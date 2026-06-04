import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseRegistry,
  getJobTimeline,
  formatSchedule,
  readWorkflow,
  writeWorkflow,
  listPersonaDirs,
  writeJobToRegistry,
  removeJobFromRegistry,
  updateJobField,
} from './registry.js';
import type { NewJobInput, JobIntegration, JobTrigger, JobTeam } from './registry.js';
import { getJobOverrides } from './nexus-settings.js';
import { getJobStates } from './nexus-db.js';

const workspace = process.env.WORKSPACE_DIR || process.cwd();

const home = process.env.WORKSPACE_DIR || process.cwd();
const EXECUTIONS_DIR =
  process.env.EXECUTIONS_DIR || resolve(workspace, '.claude/logs/headless/executions');
const STATE_DIR = process.env.NEXUS_STATE_DIR || resolve(workspace, '.claude/jobs/state');

// Types

export interface JobHealth {
  status: 'healthy' | 'warning' | 'failing' | 'unknown';
  sla: {
    onTimeRate7d: number;
    successRate7d: number;
    lastSuccessfulRun: string | null;
    expectedNextRun: string | null;
    missedRuns7d: number;
  };
  consecutiveFailures: number;
  lastError?: string;
  costAnomaly: boolean;
}

export interface JobStats {
  totalCost7d: number;
  avgCost: number;
  runCount7d: number;
  avgDurationMs: number;
  failCount7d: number;
}

export interface RecurringJob {
  id: string;
  source: 'nexus' | 'cron' | 'systemd';
  name: string;
  description: string;
  schedule: string;
  scheduleType: string;
  enabled: boolean;
  hasOverride: boolean;
  status: 'idle' | 'running' | 'disabled';
  lastRun: string | null;
  nextRun: string | null;
  persona?: string;
  project?: string;
  engine?: string;
  maxBudget?: number;
  maxTurns?: number;
  maxDailyBudgetUsd?: number;
  timeoutMinutes?: number;
  workflowFile?: string;
  tags: string[];
  integrations?: JobIntegration[];
  trigger?: JobTrigger;
  team?: JobTeam;
  health: JobHealth;
  stats: JobStats;
  capabilities: string[];
}

interface ExecutionLog {
  file: string;
  job: string;
  timestamp: Date;
  isError: boolean;
  cost: number;
  durationMs: number;
}

// Execution log parsing

function parseExecutionLogs(jobName?: string, daysBack = 7): ExecutionLog[] {
  if (!existsSync(EXECUTIONS_DIR)) return [];

  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const files = readdirSync(EXECUTIONS_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('latest-'))
    .filter((f) => !jobName || f.startsWith(`${jobName}-`));

  const logs: ExecutionLog[] = [];
  for (const file of files) {
    const match = file.match(/^(.+)-(\d{8})-(\d{6})\.json$/);
    if (!match) continue;

    const name = match[1];
    const dateStr = match[2];
    const timeStr = match[3];
    const ts = new Date(
      `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T` +
        `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}Z`,
    );

    if (ts < cutoff) continue;

    try {
      const data = JSON.parse(readFileSync(resolve(EXECUTIONS_DIR, file), 'utf-8'));
      logs.push({
        file,
        job: name,
        timestamp: ts,
        isError: data.is_error || false,
        cost: data.total_cost_usd || 0,
        durationMs: data.duration_ms || 0,
      });
    } catch {
      // Skip unreadable
    }
  }

  return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function computeStats(logs: ExecutionLog[]): JobStats {
  const runCount = logs.length;
  const totalCost = logs.reduce((sum, l) => sum + l.cost, 0);
  const totalDuration = logs.reduce((sum, l) => sum + l.durationMs, 0);
  const failCount = logs.filter((l) => l.isError).length;

  return {
    totalCost7d: Math.round(totalCost * 100) / 100,
    avgCost: runCount > 0 ? Math.round((totalCost / runCount) * 100) / 100 : 0,
    runCount7d: runCount,
    avgDurationMs: runCount > 0 ? Math.round(totalDuration / runCount) : 0,
    failCount7d: failCount,
  };
}

function getConsecutiveFailures(jobName: string): number {
  try {
    const states = getJobStates();
    const state = states.find((s) => s.job === jobName);
    return state?.fail_count ?? 0;
  } catch {
    return 0;
  }
}

function isJobRunning(jobName: string): boolean {
  const lockFile = resolve(STATE_DIR, 'locks', `${jobName}.lock`);
  return existsSync(lockFile);
}

function computeExpectedRuns(scheduleType: string, everyHours?: number, days = 7): number {
  if (scheduleType === 'interval' && everyHours && everyHours > 0) {
    return Math.floor((days * 24) / everyHours);
  }
  if (scheduleType === 'daily') return days;
  if (scheduleType === 'weekly') return Math.max(1, Math.floor(days / 7));
  if (scheduleType === 'on-demand' || scheduleType === 'on_demand') return 0;
  return 0;
}

function computeHealth(
  jobName: string,
  logs: ExecutionLog[],
  scheduleType: string,
  everyHours?: number,
  daysBack = 7,
): JobHealth {
  const consecutiveFailures = getConsecutiveFailures(jobName);
  const expected = computeExpectedRuns(scheduleType, everyHours, daysBack);
  const actual = logs.length;
  const successes = logs.filter((l) => !l.isError);
  const lastSuccess = successes.length > 0 ? successes[0].timestamp.toISOString() : null;
  const successRate = actual > 0 ? successes.length / actual : 1;
  const missedRuns = Math.max(0, expected - actual);
  const onTimeRate = expected > 0 ? Math.min(1, actual / expected) : 1;

  // Cost anomaly: compare 7d avg to 30d avg
  const logs30d = parseExecutionLogs(jobName, 30);
  const avg7d = actual > 0 ? logs.reduce((s, l) => s + l.cost, 0) / actual : 0;
  const avg30d = logs30d.length > 0 ? logs30d.reduce((s, l) => s + l.cost, 0) / logs30d.length : 0;
  const costAnomaly = avg30d > 0 && avg7d > 2 * avg30d;

  const lastFail = logs.find((l) => l.isError);
  const lastError = lastFail
    ? `Failed on ${lastFail.timestamp.toISOString().split('T')[0]}`
    : undefined;

  let status: JobHealth['status'] = 'healthy';
  if (consecutiveFailures >= 3 || successRate < 0.5) status = 'failing';
  else if (consecutiveFailures >= 1 || missedRuns > 0 || costAnomaly || successRate < 0.8)
    status = 'warning';
  else if (expected === 0 && actual === 0) status = 'unknown';

  return {
    status,
    sla: {
      onTimeRate7d: Math.round(onTimeRate * 100) / 100,
      successRate7d: Math.round(successRate * 100) / 100,
      lastSuccessfulRun: lastSuccess,
      expectedNextRun: null,
      missedRuns7d: missedRuns,
    },
    consecutiveFailures,
    lastError,
    costAnomaly,
  };
}

// Cron jobs

interface CronJob {
  index: number;
  expression: string;
  command: string;
  comment: string;
  enabled: boolean;
}

function parseCrontab(): CronJob[] {
  try {
    const output = execFileSync('crontab', ['-l'], { encoding: 'utf-8', timeout: 5000 });
    const jobs: CronJob[] = [];
    let index = 0;
    let lastComment = '';

    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') && !trimmed.startsWith('#!')) {
        const disabledMatch = trimmed.match(/^#\s*(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)/);
        if (disabledMatch) {
          jobs.push({
            index: index++,
            expression: disabledMatch[1],
            command: disabledMatch[2],
            comment: lastComment,
            enabled: false,
          });
          lastComment = '';
        } else {
          lastComment = trimmed.slice(1).trim();
        }
        continue;
      }

      const cronMatch = trimmed.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)/);
      if (cronMatch) {
        jobs.push({
          index: index++,
          expression: cronMatch[1],
          command: cronMatch[2],
          comment: lastComment,
          enabled: true,
        });
        lastComment = '';
      }
    }
    return jobs;
  } catch {
    return [];
  }
}

function cronExprToHuman(expr: string): string {
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, , dow] = parts;
  if (min.startsWith('*/') && hour === '*') return `Every ${min.slice(2)}m`;
  if (hour.startsWith('*/') && min === '0') return `Every ${hour.slice(2)}h`;
  if (dow !== '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[parseInt(dow)] ?? dow} ${hour}:${min.padStart(2, '0')}`;
  }
  if (dom !== '*') return `Day ${dom} ${hour}:${min.padStart(2, '0')}`;
  if (hour !== '*' && min !== '*') return `Daily ${hour}:${min.padStart(2, '0')}`;
  return expr;
}

// Systemd

function getSystemdServices(): { name: string; description: string; active: boolean }[] {
  try {
    const output = execFileSync(
      'systemctl',
      ['--user', 'list-units', '--type=service', '--state=loaded', '--no-pager', '--no-legend'],
      { encoding: 'utf-8', timeout: 5000 },
    );
    const services: { name: string; description: string; active: boolean }[] = [];
    for (const line of output.split('\n')) {
      const match = line.trim().match(/^(\S+)\.service\s+\S+\s+(\S+)\s+(\S+)\s+(.*)$/);
      if (!match) continue;
      const name = match[1];
      if (!name.includes('threat-intel') && !name.includes('homelab') && !name.includes('mcp'))
        continue;
      services.push({ name, description: match[4] || name, active: match[2] === 'active' });
    }
    return services;
  } catch {
    return [];
  }
}

// Main API

const emptyHealth: JobHealth = {
  status: 'unknown',
  sla: {
    onTimeRate7d: 0,
    successRate7d: 0,
    lastSuccessfulRun: null,
    expectedNextRun: null,
    missedRuns7d: 0,
  },
  consecutiveFailures: 0,
  costAnomaly: false,
};
const emptyStats: JobStats = {
  totalCost7d: 0,
  avgCost: 0,
  runCount7d: 0,
  avgDurationMs: 0,
  failCount7d: 0,
};

export function getAllJobs(daysBack = 7): {
  jobs: RecurringJob[];
  summary: Record<string, unknown>;
} {
  const overrides = getJobOverrides();
  const { jobs: registryJobs } = parseRegistry();

  // Get last run timestamps from SQLite (nexus.db job_state table)
  const lastRuns: Record<string, string> = {};
  try {
    const jobStates = getJobStates();
    for (const state of jobStates) {
      if (state.last_run) {
        const ts =
          typeof state.last_run === 'number'
            ? new Date(state.last_run * 1000).toISOString()
            : new Date(state.last_run).toISOString();
        lastRuns[state.job] = ts;
      }
    }
  } catch {
    /* SQLite may not be available */
  }

  const timeline = getJobTimeline(lastRuns);

  // Build nexus jobs from timeline (enabled jobs with next-run computed)
  const timelineNames = new Set(timeline.jobs.map((j) => j.name));
  const nexusJobs: RecurringJob[] = timeline.jobs.map((j) => {
    const override = overrides[j.name];
    const effectiveEnabled = override?.enabled !== undefined ? override.enabled : j.enabled;
    const logs = parseExecutionLogs(j.name, daysBack);
    const stats = computeStats(logs);
    const health = computeHealth(j.name, logs, j.schedule.type, j.schedule.every_hours, daysBack);
    health.sla.expectedNextRun = j.nextRun;

    return {
      id: `nexus:${j.name}`,
      source: 'nexus' as const,
      name: j.name,
      description: j.description,
      schedule: formatSchedule(j.schedule),
      scheduleType: j.schedule.type,
      enabled: effectiveEnabled,
      hasOverride: !!override,
      status: !effectiveEnabled
        ? ('disabled' as const)
        : isJobRunning(j.name)
          ? ('running' as const)
          : ('idle' as const),
      lastRun: j.lastRun,
      nextRun: j.nextRun,
      persona: j.persona,
      engine: j.engine,
      maxBudget: override?.max_budget_usd ?? j.maxBudget,
      maxTurns: override?.max_turns ?? j.maxTurns,
      maxDailyBudgetUsd: override?.max_daily_budget_usd ?? j.maxDailyBudgetUsd,
      timeoutMinutes: override?.timeout_minutes ?? j.timeoutMinutes,
      workflowFile: j.workflow,
      tags: j.tags ?? [],
      integrations: j.integrations,
      trigger: j.trigger,
      team: j.team,
      health,
      stats,
      capabilities: ['toggle', 'run', 'edit-schedule', 'edit-workflow', 'delete'],
    };
  });

  // Add disabled registry jobs not in timeline
  const disabledJobs: RecurringJob[] = registryJobs
    .filter((j) => !timelineNames.has(j.name))
    .map((j) => ({
      id: `nexus:${j.name}`,
      source: 'nexus' as const,
      name: j.name,
      description: j.description,
      schedule: formatSchedule(j.schedule),
      scheduleType: j.schedule.type,
      enabled: overrides[j.name]?.enabled ?? false,
      hasOverride: !!overrides[j.name],
      status: 'disabled' as const,
      lastRun: lastRuns[j.name] ?? null,
      nextRun: null,
      persona: j.persona,
      engine: j.engine,
      maxBudget: overrides[j.name]?.max_budget_usd ?? j.maxBudget,
      maxTurns: overrides[j.name]?.max_turns ?? j.maxTurns,
      maxDailyBudgetUsd: overrides[j.name]?.max_daily_budget_usd ?? j.maxDailyBudgetUsd,
      timeoutMinutes: overrides[j.name]?.timeout_minutes ?? j.timeoutMinutes,
      workflowFile: j.workflow,
      tags: j.tags ?? [],
      integrations: j.integrations,
      trigger: j.trigger,
      team: j.team,
      health: { ...emptyHealth },
      stats: { ...emptyStats },
      capabilities: ['toggle', 'run', 'edit-schedule', 'edit-workflow', 'delete'],
    }));

  // Cron jobs
  const cronJobs: RecurringJob[] = parseCrontab().map((c) => ({
    id: `cron:${c.index}`,
    source: 'cron' as const,
    name: c.comment || c.command.split('/').pop()?.split(' ')[0] || `cron-${c.index}`,
    description: c.command,
    schedule: cronExprToHuman(c.expression),
    scheduleType: 'cron',
    enabled: c.enabled,
    hasOverride: false,
    status: c.enabled ? ('idle' as const) : ('disabled' as const),
    lastRun: null,
    nextRun: null,
    tags: [],
    health: { ...emptyHealth },
    stats: { ...emptyStats },
    capabilities: ['toggle'],
  }));

  // Systemd
  const systemdJobs: RecurringJob[] = getSystemdServices().map((s) => ({
    id: `systemd:${s.name}`,
    source: 'systemd' as const,
    name: s.name,
    description: s.description,
    schedule: 'Service',
    scheduleType: 'systemd',
    enabled: s.active,
    hasOverride: false,
    status: s.active ? ('idle' as const) : ('disabled' as const),
    lastRun: null,
    nextRun: null,
    tags: [],
    health: { ...emptyHealth, status: s.active ? ('healthy' as const) : ('unknown' as const) },
    stats: { ...emptyStats },
    capabilities: ['toggle', 'run'],
  }));

  const allJobs = [...nexusJobs, ...disabledJobs, ...cronJobs, ...systemdJobs];

  return {
    jobs: allJobs,
    summary: {
      total: allJobs.length,
      enabled: allJobs.filter((j) => j.enabled).length,
      running: allJobs.filter((j) => j.status === 'running').length,
      healthy: allJobs.filter((j) => j.health.status === 'healthy').length,
      warning: allJobs.filter((j) => j.health.status === 'warning').length,
      failing: allJobs.filter((j) => j.health.status === 'failing').length,
      bySource: {
        nexus: nexusJobs.length + disabledJobs.length,
        cron: cronJobs.length,
        systemd: systemdJobs.length,
      },
      totalCost7d: Math.round(allJobs.reduce((s, j) => s + j.stats.totalCost7d, 0) * 100) / 100,
    },
  };
}

export function getJobExecutionHistory(jobName: string, limit = 20, daysBack = 30) {
  const logs = parseExecutionLogs(jobName, daysBack);
  const actual = logs.map((l) => ({
    ...l,
    timestamp: l.timestamp.toISOString(),
    isMissed: false,
  }));

  // Compute missed runs from schedule
  const { jobs } = parseRegistry();
  const job = jobs.find((j) => j.name === jobName);
  if (!job) return actual.slice(0, limit);

  const sched = job.schedule;
  const now = Date.now();
  const cutoff = now - daysBack * 24 * 60 * 60 * 1000;
  const expected: Date[] = [];

  if (sched.type === 'interval' && (sched.every_hours || sched.every_minutes)) {
    const intervalMs = ((sched.every_hours ?? 0) * 3600 + (sched.every_minutes ?? 0) * 60) * 1000;
    if (intervalMs > 0) {
      // Walk backwards from now
      let t = now;
      while (t > cutoff) {
        expected.push(new Date(t));
        t -= intervalMs;
      }
    }
  } else if (sched.type === 'daily') {
    const hour = sched.hour ?? 0;
    for (let d = 0; d < 30; d++) {
      const t = new Date(now - d * 24 * 60 * 60 * 1000);
      t.setHours(hour, 0, 0, 0);
      if (t.getTime() < now) expected.push(t);
    }
  } else if (sched.type === 'weekly') {
    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const targetDay = dayMap[sched.day ?? 'monday'] ?? 1;
    const hour = sched.hour ?? 0;
    const weeksBack = Math.ceil(daysBack / 7) + 1;
    for (let w = 0; w < weeksBack; w++) {
      const t = new Date(now - w * 7 * 24 * 60 * 60 * 1000);
      const diff = (t.getDay() - targetDay + 7) % 7;
      t.setDate(t.getDate() - diff);
      t.setHours(hour, 0, 0, 0);
      if (t.getTime() < now && t.getTime() > cutoff) expected.push(t);
    }
  }

  // For each expected time, check if an actual run exists within tolerance
  const toleranceMs = Math.max(30 * 60 * 1000, (sched.every_hours ?? 1) * 3600 * 1000 * 0.3);
  const missed: typeof actual = [];

  for (const exp of expected) {
    const hasRun = logs.some((l) => Math.abs(l.timestamp.getTime() - exp.getTime()) < toleranceMs);
    if (!hasRun) {
      missed.push({
        file: '',
        job: jobName,
        timestamp: exp.toISOString(),
        isError: false,
        isMissed: true,
        cost: 0,
        durationMs: 0,
      });
    }
  }

  // Merge and sort by timestamp descending
  const combined = [...actual, ...missed].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return combined.slice(0, limit);
}

export function triggerNexusJob(jobName: string): { ok: boolean; message: string } {
  try {
    const dispatcherPath =
      process.env.DISPATCHER_PATH || resolve(workspace, '.claude/jobs/dispatcher.sh');
    execFileSync('bash', [dispatcherPath, '--run', jobName], { timeout: 10000 });
    return { ok: true, message: `Job ${jobName} triggered` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[recurring-jobs] Failed to trigger ${jobName}:`, detail);
    return { ok: false, message: `Failed to trigger ${jobName}: ${detail}` };
  }
}

export {
  readWorkflow,
  writeWorkflow,
  listPersonaDirs,
  writeJobToRegistry,
  removeJobFromRegistry,
  updateJobField,
};
export type { NewJobInput };
