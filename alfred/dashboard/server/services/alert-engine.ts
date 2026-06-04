import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { getDashboardDb } from './dashboard-db.js';
import { parseTaskEvents, parseExecutionLogs, parseAiDavidDecisions } from './event-correlator.js';
import { getJobStates } from './nexus-db.js';
import { sendNotification } from './push.js';
import { parseRegistry as parseRegistryForAlerts } from './registry.js';

// --- Types ---

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
  severity: 'info' | 'warn' | 'error' | 'critical';
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  context: Record<string, unknown>;
  acknowledged: boolean;
}

export interface AlertsResponse {
  alerts: Alert[];
  rules: AlertRule[];
}

// --- In-memory acknowledged set (resets on restart) ---

const acknowledgedAlerts = new Set<string>();

// Track which alerts we've already sent push notifications for
const notifiedAlerts = new Set<string>();

// Track when each alert was first detected (persists across evaluations until server restart)
const alertFirstSeen = new Map<string, string>();

// --- Default rules ---

const DEFAULT_RULES: AlertRule[] = [
  {
    id: 'stuck_task',
    name: 'Stuck Task',
    description: 'Task with auto:ready label that has not progressed in N+ dispatcher cycles',
    enabled: true,
    threshold: 2,
    severity: 'warn',
  },
  {
    id: 'cost_spike',
    name: 'Cost Spike',
    description: 'Job cost exceeds N% of its 7-day average',
    enabled: true,
    threshold: 200,
    severity: 'warn',
  },
  {
    id: 'pipeline_break',
    name: 'Pipeline Break',
    description: 'N+ consecutive failures for the same job',
    enabled: true,
    threshold: 3,
    severity: 'error',
  },
  {
    id: 'cascade_failure',
    name: 'Cascade Failure',
    description:
      'Upstream job failed and downstream jobs stalled (no runs within expected interval)',
    enabled: true,
    threshold: 2,
    severity: 'critical',
  },
  {
    id: 'stale_proposal',
    name: 'Stale Proposal',
    description: 'AI David proposal older than N hours without feedback',
    enabled: true,
    threshold: 24,
    severity: 'info',
  },
  {
    id: 'heartbeat_missing',
    name: 'Heartbeat Missing',
    description: 'Dispatcher heartbeat file older than 2x expected interval',
    enabled: true,
    threshold: 2,
    severity: 'critical',
  },
  {
    id: 'missed_schedule',
    name: 'Missed Scheduled Run',
    description: 'Job has not run within 2x its expected interval',
    enabled: true,
    threshold: 2,
    severity: 'warn',
  },
  {
    id: 'sla_degradation',
    name: 'SLA Degradation',
    description: 'Job success rate below threshold over 7 days',
    enabled: true,
    threshold: 80,
    severity: 'warn',
  },
  {
    id: 'cost_anomaly',
    name: 'Job Cost Anomaly',
    description: '7-day average cost exceeds Nx the 30-day average',
    enabled: true,
    threshold: 2,
    severity: 'warn',
  },
];

// --- DB schema for rule configs ---

let schemaInitialized = false;

function ensureSchema(): void {
  if (schemaInitialized) return;
  const db = getDashboardDb();
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      threshold REAL NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warn'
    )
  `,
  ).run();

  // Seed defaults
  const insert = db.prepare(
    `INSERT OR IGNORE INTO alert_rules (id, name, description, enabled, threshold, severity)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const rule of DEFAULT_RULES) {
    insert.run(
      rule.id,
      rule.name,
      rule.description,
      rule.enabled ? 1 : 0,
      rule.threshold,
      rule.severity,
    );
  }

  schemaInitialized = true;
}

// --- Rule config persistence ---

export function getAlertRules(): AlertRule[] {
  ensureSchema();
  const db = getDashboardDb();
  const rows = db.prepare('SELECT * FROM alert_rules ORDER BY id').all() as {
    id: string;
    name: string;
    description: string;
    enabled: number;
    threshold: number;
    severity: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    enabled: Boolean(r.enabled),
    threshold: r.threshold,
    severity: r.severity as AlertRule['severity'],
  }));
}

export function updateAlertRule(id: string, updates: Partial<AlertRule>): AlertRule {
  ensureSchema();
  const db = getDashboardDb();

  const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    throw new Error(`Alert rule '${id}' not found`);
  }

  if (updates.enabled !== undefined) {
    db.prepare('UPDATE alert_rules SET enabled = ? WHERE id = ?').run(updates.enabled ? 1 : 0, id);
  }
  if (updates.threshold !== undefined) {
    db.prepare('UPDATE alert_rules SET threshold = ? WHERE id = ?').run(updates.threshold, id);
  }
  if (updates.severity !== undefined) {
    db.prepare('UPDATE alert_rules SET severity = ? WHERE id = ?').run(updates.severity, id);
  }
  if (updates.name !== undefined) {
    db.prepare('UPDATE alert_rules SET name = ? WHERE id = ?').run(updates.name, id);
  }
  if (updates.description !== undefined) {
    db.prepare('UPDATE alert_rules SET description = ? WHERE id = ?').run(updates.description, id);
  }

  return getAlertRules().find((r) => r.id === id)!;
}

export function acknowledgeAlert(id: string): void {
  acknowledgedAlerts.add(id);
}

// --- Alert ID helper ---

function makeAlertId(ruleId: string, extra: string): string {
  return createHash('sha256')
    .update(ruleId + extra)
    .digest('hex')
    .slice(0, 16);
}

// --- Rule evaluators ---

async function evaluateStuckTask(rule: AlertRule): Promise<Alert[]> {
  const alerts: Alert[] = [];
  try {
    const events = await parseTaskEvents();

    // Find tasks that have auto:ready label added
    const readyTasks = new Map<string, string>(); // taskId -> timestamp of label add
    for (const e of events) {
      if (e.type === 'task_label_added' && /auto:ready/i.test(String(e.details?.new_value ?? ''))) {
        readyTasks.set(e.task_id!, e.timestamp);
      }
    }

    // Check for progress: any event AFTER the auto:ready label was added
    for (const [taskId, readyTimestamp] of readyTasks) {
      const laterEvents = events.filter(
        (e) =>
          e.task_id === taskId && e.timestamp > readyTimestamp && e.type !== 'task_label_added',
      );

      if (laterEvents.length > 0) continue; // task has progressed

      // Estimate dispatcher cycles elapsed based on time since ready
      // Assume ~2h dispatcher interval
      const hoursStuck = (Date.now() - new Date(readyTimestamp).getTime()) / (1000 * 60 * 60);
      const cyclesStuck = Math.floor(hoursStuck / 2);

      if (cyclesStuck >= rule.threshold) {
        const alertId = makeAlertId(rule.id, taskId);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `Stuck task: ${taskId}`,
          message: `Task ${taskId} has had auto:ready label for ~${cyclesStuck} dispatcher cycles without progress`,
          timestamp: new Date().toISOString(),
          context: { taskId, readySince: readyTimestamp, cyclesStuck },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] stuck_task evaluation failed:', (err as Error).message);
  }
  return alerts;
}

function evaluateCostSpike(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const execLogs = parseExecutionLogs(weekAgo.toISOString(), now.toISOString());

    // Group by job
    const jobCosts = new Map<string, number[]>();
    for (const e of execLogs) {
      if (!e.job || e.cost == null) continue;
      if (!jobCosts.has(e.job)) jobCosts.set(e.job, []);
      jobCosts.get(e.job)!.push(e.cost);
    }

    for (const [jobName, costs] of jobCosts) {
      if (costs.length < 2) continue;
      const latestCost = costs[costs.length - 1];
      // Average of all runs except the latest
      const prevCosts = costs.slice(0, -1);
      const avg = prevCosts.reduce((s, c) => s + c, 0) / prevCosts.length;
      if (avg === 0) continue;

      const pct = (latestCost / avg) * 100;
      if (pct >= rule.threshold) {
        const alertId = makeAlertId(rule.id, jobName);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `Cost spike: ${jobName}`,
          message: `${jobName} latest run cost $${latestCost.toFixed(4)} — ${Math.round(pct)}% of 7-day average ($${avg.toFixed(4)})`,
          timestamp: new Date().toISOString(),
          context: { jobName, latestCost, averageCost: avg, percentage: Math.round(pct) },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] cost_spike evaluation failed:', (err as Error).message);
  }
  return alerts;
}

function evaluatePipelineBreak(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const execLogs = parseExecutionLogs();

    // Group by job, sorted chronologically
    const jobRuns = new Map<string, { timestamp: string; success: boolean }[]>();
    for (const e of execLogs) {
      if (!e.job) continue;
      if (!jobRuns.has(e.job)) jobRuns.set(e.job, []);
      jobRuns.get(e.job)!.push({
        timestamp: e.timestamp,
        success: e.type === 'execution_success',
      });
    }

    for (const [jobName, runs] of jobRuns) {
      // Sort chronologically
      runs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Count consecutive failures at the tail
      let consecutiveFailures = 0;
      for (let i = runs.length - 1; i >= 0; i--) {
        if (!runs[i].success) consecutiveFailures++;
        else break;
      }

      if (consecutiveFailures >= rule.threshold) {
        const alertId = makeAlertId(rule.id, jobName);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `Pipeline break: ${jobName}`,
          message: `${jobName} has ${consecutiveFailures} consecutive failures`,
          timestamp: new Date().toISOString(),
          context: { jobName, consecutiveFailures, lastFailure: runs[runs.length - 1].timestamp },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] pipeline_break evaluation failed:', (err as Error).message);
  }
  return alerts;
}

function evaluateCascadeFailure(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const execLogs = parseExecutionLogs();

    // Known job relationships (upstream -> downstream)
    // task-evaluator -> task-executor -> task-research
    const relationships: [string, string][] = [
      ['task-evaluator', 'task-executor'],
      ['task-executor', 'task-research'],
    ];

    // Group by job, get latest runs
    const jobLatest = new Map<string, { timestamp: string; success: boolean }[]>();
    for (const e of execLogs) {
      if (!e.job) continue;
      if (!jobLatest.has(e.job)) jobLatest.set(e.job, []);
      jobLatest.get(e.job)!.push({
        timestamp: e.timestamp,
        success: e.type === 'execution_success',
      });
    }

    for (const [upstream, downstream] of relationships) {
      const upRuns = jobLatest.get(upstream) || [];
      const downRuns = jobLatest.get(downstream) || [];

      if (upRuns.length === 0) continue;

      // Sort chronologically
      upRuns.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      downRuns.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Check if upstream has recent failures
      const recentUpstreamFailures = upRuns.slice(-rule.threshold).filter((r) => !r.success);
      if (recentUpstreamFailures.length < rule.threshold) continue;

      // Check if downstream has stalled (no runs after the upstream failure)
      const firstFailureTs = recentUpstreamFailures[0].timestamp;
      const downstreamAfterFailure = downRuns.filter((r) => r.timestamp > firstFailureTs);

      if (downstreamAfterFailure.length === 0) {
        const alertId = makeAlertId(rule.id, `${upstream}->${downstream}`);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `Cascade failure: ${upstream} → ${downstream}`,
          message: `${upstream} has ${recentUpstreamFailures.length} failures and ${downstream} has stalled (no runs since ${firstFailureTs})`,
          timestamp: new Date().toISOString(),
          context: {
            upstream,
            downstream,
            upstreamFailures: recentUpstreamFailures.length,
            stalledSince: firstFailureTs,
          },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] cascade_failure evaluation failed:', (err as Error).message);
  }
  return alerts;
}

function evaluateStaleProposal(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const decisions = parseAiDavidDecisions();
    const proposals = decisions.filter((e) => e.type === 'ai_propose');

    // Load feedback entries to check which proposals have been addressed
    const feedbackPath = join(config.taskReviewerResultsDir, 'feedback.jsonl');
    const feedbackTaskIds = new Set<string>();
    try {
      const content = readFileSync(feedbackPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.task_id) feedbackTaskIds.add(entry.task_id as string);
      }
    } catch {
      // Feedback file may not exist — that's fine, means no feedback given
    }

    const now = Date.now();
    const thresholdMs = rule.threshold * 60 * 60 * 1000; // threshold is in hours

    for (const proposal of proposals) {
      const taskId = proposal.task_id;
      if (!taskId) continue;
      if (feedbackTaskIds.has(taskId)) continue; // has feedback

      const ageMs = now - new Date(proposal.timestamp).getTime();
      if (ageMs >= thresholdMs) {
        const hoursStale = Math.round(ageMs / (1000 * 60 * 60));
        const alertId = makeAlertId(rule.id, taskId);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `Stale proposal: ${taskId}`,
          message: `AI David proposal for ${taskId} has been waiting ${hoursStale}h without feedback`,
          timestamp: new Date().toISOString(),
          context: { taskId, proposedAt: proposal.timestamp, hoursStale },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] stale_proposal evaluation failed:', (err as Error).message);
  }
  return alerts;
}

function evaluateHeartbeatMissing(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const heartbeatPath = config.dispatcherHeartbeatPath;
    const stats = statSync(heartbeatPath);
    const ageMs = Date.now() - stats.mtimeMs;

    // Expected interval: 2 hours (dispatcher default). Threshold is multiplier.
    const expectedIntervalMs = 2 * 60 * 60 * 1000;
    const maxAgeMs = expectedIntervalMs * rule.threshold;

    if (ageMs > maxAgeMs) {
      const hoursAgo = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
      const alertId = makeAlertId(rule.id, 'heartbeat');
      alerts.push({
        id: alertId,
        ruleId: rule.id,
        severity: rule.severity,
        title: 'Dispatcher heartbeat missing',
        message: `Dispatcher heartbeat is ${hoursAgo}h old — expected within ${rule.threshold * 2}h`,
        timestamp: new Date().toISOString(),
        context: { heartbeatPath, lastBeat: new Date(stats.mtimeMs).toISOString(), hoursAgo },
        acknowledged: acknowledgedAlerts.has(alertId),
      });
    }
  } catch {
    const alertId = makeAlertId(rule.id, 'heartbeat-missing');
    alerts.push({
      id: alertId,
      ruleId: rule.id,
      severity: 'info',
      title: 'Dispatcher not running',
      message: `No dispatcher heartbeat found — Nexus scheduler may not be configured in this environment`,
      timestamp: new Date().toISOString(),
      context: { heartbeatPath: config.dispatcherHeartbeatPath },
      acknowledged: acknowledgedAlerts.has(alertId),
    });
  }
  return alerts;
}

// --- SLA alert evaluators ---

function evaluateMissedSchedule(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const execLogs = parseExecutionLogs();
    const { jobs: registryJobs } = parseRegistryForAlerts();

    // Build interval map from registry: job -> expected hours between runs
    const expectedIntervals = new Map<string, number>();
    for (const job of registryJobs) {
      if (!job.enabled) continue;
      if (job.schedule.type === 'interval' && job.schedule.every_hours) {
        expectedIntervals.set(job.name, job.schedule.every_hours);
      } else if (job.schedule.type === 'daily') {
        expectedIntervals.set(job.name, 24);
      } else if (job.schedule.type === 'weekly') {
        expectedIntervals.set(job.name, 168);
      }
      // on-demand jobs: no expected interval, skip
    }

    // Primary source: SQLite job_state (always updated by dispatcher, even for gated runs)
    const jobLastRun = new Map<string, string>();
    for (const state of getJobStates()) {
      if (!state.last_run) continue;
      const ts =
        typeof state.last_run === 'number'
          ? state.last_run
          : new Date(state.last_run).getTime() / 1000;
      if (ts > 0) {
        jobLastRun.set(state.job, new Date(ts * 1000).toISOString());
      }
    }

    // Secondary: execution logs (use whichever source is more recent)
    for (const e of execLogs) {
      if (!e.job) continue;
      const existing = jobLastRun.get(e.job);
      if (!existing || e.timestamp > existing) {
        jobLastRun.set(e.job, e.timestamp);
      }
    }

    // Check each job with an expected interval
    for (const [jobName, intervalHours] of expectedIntervals) {
      const lastRun = jobLastRun.get(jobName);
      if (!lastRun) continue; // Never run — different alert
      const hoursSince = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60);
      const maxAllowed = intervalHours * rule.threshold; // threshold = multiplier (default 2)

      if (hoursSince > maxAllowed) {
        const alertId = makeAlertId(rule.id, jobName);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `Missed schedule: ${jobName}`,
          message: `${jobName} has not run in ${Math.round(hoursSince)}h (expected every ${intervalHours}h, threshold ${rule.threshold}x)`,
          timestamp: new Date().toISOString(),
          context: {
            jobName,
            hoursSinceLastRun: Math.round(hoursSince),
            expectedIntervalHours: intervalHours,
          },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] missed_schedule evaluation failed:', (err as Error).message);
  }
  return alerts;
}

function evaluateSlaDegradation(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const execLogs = parseExecutionLogs();
    const jobRuns = new Map<string, { total: number; failures: number }>();
    for (const e of execLogs) {
      if (!e.job) continue;
      if (!jobRuns.has(e.job)) jobRuns.set(e.job, { total: 0, failures: 0 });
      const entry = jobRuns.get(e.job)!;
      entry.total++;
      if (e.type === 'execution_error') entry.failures++;
    }

    for (const [jobName, stats] of jobRuns) {
      if (stats.total < 3) continue;
      const successRate = ((stats.total - stats.failures) / stats.total) * 100;
      if (successRate < rule.threshold) {
        const alertId = makeAlertId(rule.id, jobName);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `SLA degradation: ${jobName}`,
          message: `${jobName} success rate is ${successRate.toFixed(0)}% (threshold: ${rule.threshold}%)`,
          timestamp: new Date().toISOString(),
          context: {
            jobName,
            successRate: Math.round(successRate),
            total: stats.total,
            failures: stats.failures,
          },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] sla_degradation evaluation failed:', (err as Error).message);
  }
  return alerts;
}

function evaluateCostAnomaly(rule: AlertRule): Alert[] {
  const alerts: Alert[] = [];
  try {
    const execLogs = parseExecutionLogs();
    const jobCosts = new Map<string, number[]>();
    for (const e of execLogs) {
      if (!e.job || !e.cost) continue;
      if (!jobCosts.has(e.job)) jobCosts.set(e.job, []);
      jobCosts.get(e.job)!.push(e.cost as number);
    }

    for (const [jobName, costs] of jobCosts) {
      if (costs.length < 3) continue;
      const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
      const latest = costs[0];
      if (latest > avg * rule.threshold) {
        const alertId = makeAlertId(rule.id, jobName);
        alerts.push({
          id: alertId,
          ruleId: rule.id,
          severity: rule.severity,
          title: `Cost anomaly: ${jobName}`,
          message: `${jobName} latest cost $${latest.toFixed(2)} is ${rule.threshold}x above average $${avg.toFixed(2)}`,
          timestamp: new Date().toISOString(),
          context: { jobName, latestCost: latest, avgCost: avg },
          acknowledged: acknowledgedAlerts.has(alertId),
        });
      }
    }
  } catch (err) {
    console.warn('[alert-engine] cost_anomaly evaluation failed:', (err as Error).message);
  }
  return alerts;
}

// --- Rule evaluator dispatch ---

const RULE_EVALUATORS: Record<string, (rule: AlertRule) => Alert[] | Promise<Alert[]>> = {
  stuck_task: evaluateStuckTask,
  cost_spike: evaluateCostSpike,
  pipeline_break: evaluatePipelineBreak,
  cascade_failure: evaluateCascadeFailure,
  stale_proposal: evaluateStaleProposal,
  heartbeat_missing: evaluateHeartbeatMissing,
  missed_schedule: evaluateMissedSchedule,
  sla_degradation: evaluateSlaDegradation,
  cost_anomaly: evaluateCostAnomaly,
};

// --- Public API ---

export async function evaluateAlerts(): Promise<Alert[]> {
  const rules = getAlertRules();
  const alerts: Alert[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const evaluator = RULE_EVALUATORS[rule.id];
    if (!evaluator) continue;

    try {
      const ruleAlerts = await evaluator(rule);
      alerts.push(...ruleAlerts);
    } catch (err) {
      console.warn(`[alert-engine] Rule ${rule.id} evaluation threw:`, (err as Error).message);
    }
  }

  // Stamp first-seen time: use the cached timestamp if this alert was seen before,
  // otherwise record now as the first occurrence
  const currentAlertIds = new Set<string>();
  for (const alert of alerts) {
    currentAlertIds.add(alert.id);
    if (!alertFirstSeen.has(alert.id)) {
      alertFirstSeen.set(alert.id, alert.timestamp);
    }
    alert.timestamp = alertFirstSeen.get(alert.id)!;
  }

  // Prune first-seen entries for alerts that have resolved
  for (const id of Array.from(alertFirstSeen.keys())) {
    if (!currentAlertIds.has(id)) {
      alertFirstSeen.delete(id);
    }
  }

  // Sort by severity (critical first), then by timestamp
  const severityOrder: Record<string, number> = { critical: 0, error: 1, warn: 2, info: 3 };
  alerts.sort((a, b) => {
    const sa = severityOrder[a.severity] ?? 4;
    const sb = severityOrder[b.severity] ?? 4;
    if (sa !== sb) return sa - sb;
    return b.timestamp.localeCompare(a.timestamp);
  });

  // Send push notifications for new, unacknowledged alerts
  const alertSeverityToCategory: Record<string, 'escalation' | 'health_critical' | 'pipeline'> = {
    critical: 'health_critical',
    error: 'health_critical',
    warn: 'pipeline',
    info: 'pipeline',
  };
  for (const alert of alerts) {
    if (alert.acknowledged || notifiedAlerts.has(alert.id)) continue;
    notifiedAlerts.add(alert.id);
    sendNotification({
      title: alert.title,
      body: alert.message,
      category: alertSeverityToCategory[alert.severity] ?? 'pipeline',
      severity: alert.severity,
      url: '/nexus-ops',
      tag: `alert-${alert.ruleId}`,
    }).catch(() => {});
  }

  return alerts;
}
