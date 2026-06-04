import { readFileSync, writeFileSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

const workspace = process.env.WORKSPACE_DIR || process.cwd();

const home = process.env.WORKSPACE_DIR || process.cwd();
const REGISTRY_PATH =
  process.env.REGISTRY_PATH || resolve(workspace, '.claude/jobs/registry.yaml');
const WORKFLOWS_DIR = process.env.WORKFLOWS_DIR || resolve(REGISTRY_PATH, '..', 'workflows');
const PERSONAS_DIR = process.env.PERSONAS_DIR || resolve(REGISTRY_PATH, '..', 'personas');

export interface JobSchedule {
  type: string;
  every_hours?: number;
  every_minutes?: number;
  day?: string;
  hour?: number;
}

export interface JobIntegration {
  service: string;
  email?: string;
  recipient?: string;
}

export interface JobTrigger {
  webhook?: boolean;
  parameters?: { name: string; default?: string; required?: boolean }[];
}

export interface JobTeamMember {
  name: string;
  persona?: string;
  model?: string;
}

export interface JobTeam {
  mode: string;
  members: JobTeamMember[];
  consensus?: { rule: string };
}

export interface JobDefinition {
  name: string;
  description: string;
  persona: string;
  schedule: JobSchedule;
  enabled: boolean;
  engine?: string;
  maxBudget?: number;
  maxTurns?: number;
  maxDailyBudgetUsd?: number;
  timeoutMinutes?: number;
  workflow?: string;
  tags?: string[];
  company?: string;
  integrations?: JobIntegration[];
  trigger?: JobTrigger;
  team?: JobTeam;
}

function yamlVal(line: string): string {
  const idx = line.indexOf(':');
  if (idx === -1) return '';
  return line.slice(idx + 1).trim();
}

function parseIntSafe(s: string): number {
  const m = s.trim().match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

type ParseSection =
  | 'none'
  | 'schedule'
  | 'integrations'
  | 'trigger'
  | 'trigger-params'
  | 'team'
  | 'team-members'
  | 'team-consensus'
  | 'skip';

export function parseRegistry(): { jobs: JobDefinition[]; quietHours: Record<string, unknown> } {
  if (!existsSync(REGISTRY_PATH)) return { jobs: [], quietHours: {} };

  const content = readFileSync(REGISTRY_PATH, 'utf-8');
  const jobsSection = content.split(/^jobs:/m)[1];
  if (!jobsSection) return { jobs: [], quietHours: {} };

  const jobs: JobDefinition[] = [];
  let current: JobDefinition | null = null;
  let section: ParseSection = 'none';
  let currentIntegration: JobIntegration | null = null;
  let currentTriggerParam: { name: string; default?: string; required?: boolean } | null = null;
  let currentTeamMember: JobTeamMember | null = null;

  function flushIntegration() {
    if (currentIntegration && current) {
      if (!current.integrations) current.integrations = [];
      current.integrations.push(currentIntegration);
    }
    currentIntegration = null;
  }

  function flushTriggerParam() {
    if (currentTriggerParam && current?.trigger) {
      if (!current.trigger.parameters) current.trigger.parameters = [];
      current.trigger.parameters.push(currentTriggerParam);
    }
    currentTriggerParam = null;
  }

  function flushTeamMember() {
    if (currentTeamMember && current?.team) {
      current.team.members.push(currentTeamMember);
    }
    currentTeamMember = null;
  }

  for (const line of jobsSection.split('\n')) {
    // Top-level job (2-space indent)
    const jobMatch = line.match(/^ {2}(\w[\w-]*):\s*$/);
    if (jobMatch) {
      flushIntegration();
      flushTriggerParam();
      flushTeamMember();
      if (current) jobs.push(current);
      current = {
        name: jobMatch[1],
        description: '',
        persona: '',
        schedule: { type: 'unknown' },
        enabled: true,
      };
      section = 'none';
      continue;
    }

    if (!current) continue;
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) continue;

    // Detect indent level
    const indent = line.search(/\S/);

    // 4-space indent = top-level job property or section header
    if (indent === 4 && line.match(/^\s{4}\w/)) {
      // Flush any pending nested items
      flushIntegration();
      flushTriggerParam();
      flushTeamMember();
      section = 'none';

      const val = yamlVal(stripped);

      if (stripped.startsWith('schedule:')) {
        section = 'schedule';
      } else if (stripped.startsWith('integrations:')) {
        section = 'integrations';
      } else if (stripped.startsWith('trigger:')) {
        current.trigger = {};
        section = 'trigger';
      } else if (stripped.startsWith('team:')) {
        current.team = { mode: '', members: [] };
        section = 'team';
      } else if (stripped.startsWith('description:')) {
        current.description = val.replace(/^"(.*)"$/, '$1');
      } else if (stripped.startsWith('persona:')) {
        current.persona = val;
      } else if (stripped.startsWith('enabled:')) {
        current.enabled = val.includes('true');
      } else if (stripped.startsWith('engine:')) {
        current.engine = val;
      } else if (stripped.startsWith('max_budget_usd:')) {
        current.maxBudget = parseFloat(val) || undefined;
      } else if (stripped.startsWith('max_turns:')) {
        current.maxTurns = parseIntSafe(val);
      } else if (stripped.startsWith('max_daily_budget_usd:')) {
        current.maxDailyBudgetUsd = parseFloat(val) || undefined;
      } else if (stripped.startsWith('timeout_minutes:')) {
        current.timeoutMinutes = parseIntSafe(val);
      } else if (stripped.startsWith('workflow:')) {
        current.workflow = val;
      } else if (stripped.startsWith('company:')) {
        current.company = val;
      } else if (stripped.startsWith('tags:')) {
        const bracketMatch = val.match(/^\[(.+)\]$/);
        if (bracketMatch) {
          current.tags = bracketMatch[1].split(',').map((t) => t.trim());
        }
      }
      continue;
    }

    // Nested content (6+ space indent)
    if (indent >= 6 && current) {
      const val = yamlVal(stripped);

      if (section === 'schedule') {
        if (stripped.startsWith('type:')) current.schedule.type = val || 'unknown';
        else if (stripped.startsWith('every_hours:'))
          current.schedule.every_hours = parseIntSafe(val);
        else if (stripped.startsWith('every_minutes:'))
          current.schedule.every_minutes = parseIntSafe(val);
        else if (stripped.startsWith('day:')) current.schedule.day = val;
        else if (stripped.startsWith('hour:')) current.schedule.hour = parseIntSafe(val);
      } else if (section === 'integrations') {
        if (stripped.startsWith('- service:')) {
          flushIntegration();
          currentIntegration = { service: val };
        } else if (currentIntegration) {
          if (stripped.startsWith('email:')) currentIntegration.email = val;
          else if (stripped.startsWith('recipient:')) currentIntegration.recipient = val;
        }
      } else if (section === 'trigger') {
        if (stripped.startsWith('webhook:')) current.trigger!.webhook = val === 'true';
        else if (stripped.startsWith('parameters:')) section = 'trigger-params';
      } else if (section === 'trigger-params') {
        if (stripped.startsWith('- name:')) {
          flushTriggerParam();
          currentTriggerParam = { name: val };
        } else if (currentTriggerParam) {
          if (stripped.startsWith('default:'))
            currentTriggerParam.default = val.replace(/^"(.*)"$/, '$1');
          else if (stripped.startsWith('required:')) currentTriggerParam.required = val === 'true';
        }
      } else if (
        section === 'team' ||
        section === 'team-members' ||
        section === 'team-consensus' ||
        section === 'skip'
      ) {
        // Team sibling sections all live at indent 6 — check for section transitions first
        if (indent === 6 && current.team) {
          if (stripped.startsWith('mode:')) {
            section = 'team';
            current.team.mode = val;
          } else if (stripped.startsWith('members:')) {
            flushTeamMember();
            section = 'team-members';
          } else if (stripped.startsWith('consensus:')) {
            section = 'team-consensus';
          } else if (stripped.startsWith('coordinator:') || stripped.startsWith('escalation:')) {
            section = 'skip';
          } else if (section === 'team-members' && stripped.startsWith('- name:')) {
            flushTeamMember();
            currentTeamMember = { name: val };
          }
        } else if (section === 'team-members') {
          if (stripped.startsWith('- name:')) {
            flushTeamMember();
            currentTeamMember = { name: val };
          } else if (currentTeamMember) {
            if (stripped.startsWith('persona:')) currentTeamMember.persona = val;
            else if (stripped.startsWith('model:')) currentTeamMember.model = val;
          }
        } else if (section === 'team-consensus') {
          if (stripped.startsWith('rule:')) {
            if (!current.team!.consensus) current.team!.consensus = { rule: '' };
            current.team!.consensus.rule = val;
          }
        }
      }
    }
  }

  flushIntegration();
  flushTriggerParam();
  flushTeamMember();
  if (current) jobs.push(current);

  return { jobs, quietHours: {} };
}

export interface TimelineEvent {
  job: string;
  persona: string;
  timestamp: string;
  type: 'completed' | 'scheduled';
  cost?: number;
  duration?: number;
}

function getNextRun(job: JobDefinition, lastRun: string | null): string | null {
  const now = new Date();
  const sched = job.schedule;

  if (sched.type === 'on_demand') return null;

  if (sched.type === 'interval') {
    const intervalMs = ((sched.every_hours ?? 0) * 3600 + (sched.every_minutes ?? 0) * 60) * 1000;
    if (!intervalMs) return null;
    if (lastRun) {
      const next = new Date(new Date(lastRun).getTime() + intervalMs);
      return next > now ? next.toISOString() : new Date(now.getTime() + intervalMs).toISOString();
    }
    return new Date(now.getTime() + intervalMs).toISOString();
  }

  if (sched.type === 'daily') {
    const target = new Date(now);
    target.setHours(sched.hour ?? 0, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target.toISOString();
  }

  if (sched.type === 'weekly') {
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
    const target = new Date(now);
    target.setHours(sched.hour ?? 0, 0, 0, 0);
    const diff = (targetDay - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + (diff === 0 && target <= now ? 7 : diff));
    return target.toISOString();
  }

  return null;
}

export function getJobTimeline(lastRuns: Record<string, string>): {
  jobs: (JobDefinition & { lastRun: string | null; nextRun: string | null })[];
} {
  const { jobs } = parseRegistry();

  return {
    jobs: jobs
      .filter((j) => j.enabled)
      .map((j) => ({
        ...j,
        lastRun: lastRuns[j.name] ?? null,
        nextRun: getNextRun(j, lastRuns[j.name] ?? null),
      }))
      .sort((a, b) => {
        if (!a.nextRun && !b.nextRun) return a.name.localeCompare(b.name);
        if (!a.nextRun) return 1;
        if (!b.nextRun) return -1;
        return new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime();
      }),
  };
}

export function formatSchedule(sched: JobSchedule): string {
  if (sched.type === 'interval') {
    if (sched.every_hours) return `Every ${sched.every_hours}h`;
    if (sched.every_minutes) return `Every ${sched.every_minutes}m`;
    return 'Interval';
  }
  if (sched.type === 'daily') return `Daily @${sched.hour ?? 0}:00`;
  if (sched.type === 'weekly') return `Weekly ${sched.day ?? ''} @${sched.hour ?? 0}:00`;
  if (sched.type === 'on_demand' || sched.type === 'on-demand') return 'On Demand';
  return sched.type;
}

// Workflow file operations

function validateJobName(jobName: string): void {
  if (!jobName || !/^[\w-]+$/.test(jobName)) {
    throw new Error(`Invalid job name: ${jobName}`);
  }
  // Prevent path traversal
  if (jobName.includes('..') || jobName.includes('/') || jobName.includes('\\')) {
    throw new Error(`Invalid job name (path traversal attempt): ${jobName}`);
  }
}

export function readWorkflow(jobName: string): string | null {
  validateJobName(jobName);
  const filepath = resolve(WORKFLOWS_DIR, `${jobName}.md`);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath, 'utf-8');
}

export function writeWorkflow(jobName: string, content: string): void {
  validateJobName(jobName);
  const filepath = resolve(WORKFLOWS_DIR, `${jobName}.md`);
  writeFileSync(filepath, content);
}

export function listPersonaDirs(): string[] {
  if (!existsSync(PERSONAS_DIR)) return [];
  return readdirSync(PERSONAS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);
}

// Registry field updates

export function updateJobField(jobName: string, field: string, value: string): void {
  validateJobName(jobName);
  if (!existsSync(REGISTRY_PATH)) throw new Error('Registry file not found');

  const content = readFileSync(REGISTRY_PATH, 'utf-8');
  const lines = content.split('\n');
  const result: string[] = [];
  let inTargetJob = false;
  let fieldUpdated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const jobMatch = line.match(/^ {2}(\w[\w-]*):\s*$/);
    if (jobMatch) {
      inTargetJob = jobMatch[1] === jobName;
    }

    if (inTargetJob && line.match(new RegExp(`^    ${field}:\\s`))) {
      result.push(`    ${field}: ${value}`);
      fieldUpdated = true;
      continue;
    }

    result.push(line);
  }

  if (!fieldUpdated) throw new Error(`Field '${field}' not found in job '${jobName}'`);
  writeRegistryAtomic(result.join('\n'));
}

// Registry write operations

export interface NewJobInput {
  name: string;
  description: string;
  persona: string;
  schedule: JobSchedule;
  engine?: string;
  maxBudget?: number;
  maxTurns?: number;
  timeoutMinutes?: number;
}

const VALID_SCHEDULE_TYPES = ['interval', 'daily', 'weekly', 'on-demand'] as const;

function writeRegistryAtomic(content: string): void {
  const tmp = REGISTRY_PATH + '.tmp';
  writeFileSync(tmp, content);
  renameSync(tmp, REGISTRY_PATH);
}

export function writeJobToRegistry(input: NewJobInput): void {
  validateJobName(input.name);
  if (!existsSync(REGISTRY_PATH)) throw new Error('Registry file not found');

  // Validate schedule
  if (
    !input.schedule?.type ||
    !VALID_SCHEDULE_TYPES.includes(input.schedule.type as (typeof VALID_SCHEDULE_TYPES)[number])
  ) {
    throw new Error(
      `Invalid schedule type: ${input.schedule?.type}. Valid: ${VALID_SCHEDULE_TYPES.join(', ')}`,
    );
  }
  if (
    input.schedule.type === 'interval' &&
    (!input.schedule.every_hours || input.schedule.every_hours <= 0)
  ) {
    throw new Error('Interval schedule requires every_hours > 0');
  }
  if (input.schedule.type === 'weekly' && !input.schedule.day) {
    throw new Error('Weekly schedule requires day');
  }

  // Check for duplicate
  const existing = parseRegistry();
  if (existing.jobs.find((j) => j.name === input.name)) {
    throw new Error(`Job '${input.name}' already exists in registry`);
  }

  const content = readFileSync(REGISTRY_PATH, 'utf-8');

  // Build YAML entry — escape description for YAML safety
  const safeDesc = input.description.replace(/"/g, '\\"');
  const lines: string[] = [
    `  ${input.name}:`,
    `    description: "${safeDesc}"`,
    `    persona: ${input.persona}`,
    `    schedule:`,
    `      type: ${input.schedule.type}`,
  ];

  if (input.schedule.every_hours) lines.push(`      every_hours: ${input.schedule.every_hours}`);
  if (input.schedule.day) lines.push(`      day: ${input.schedule.day}`);
  if (input.schedule.hour !== undefined) lines.push(`      hour: ${input.schedule.hour}`);

  lines.push(`    enabled: true`);
  if (input.maxTurns) lines.push(`    max_turns: ${input.maxTurns}`);
  if (input.maxBudget) lines.push(`    max_budget_usd: ${input.maxBudget.toFixed(2)}`);
  if (input.timeoutMinutes) lines.push(`    timeout_minutes: ${input.timeoutMinutes}`);
  if (input.engine) lines.push(`    engine: ${input.engine}`);
  lines.push(`    workflow: ${input.name}.md`);
  lines.push('');

  const updated = content.replace(/\n+$/, '') + '\n\n' + lines.join('\n') + '\n';
  writeRegistryAtomic(updated);

  // Create empty workflow file
  const workflowPath = resolve(WORKFLOWS_DIR, `${input.name}.md`);
  if (!existsSync(workflowPath)) {
    writeFileSync(
      workflowPath,
      `# ${input.description}\n\n<!-- Add workflow instructions here -->\n`,
    );
  }
}

export function removeJobFromRegistry(jobName: string): void {
  if (!existsSync(REGISTRY_PATH)) throw new Error('Registry file not found');

  const content = readFileSync(REGISTRY_PATH, 'utf-8');
  const lines = content.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const jobMatch = line.match(/^ {2}(\w[\w-]*):\s*$/);
    if (jobMatch) {
      if (jobMatch[1] === jobName) {
        skipping = true;
        continue;
      } else {
        skipping = false;
      }
    }

    // Skip indented content of the removed job (4+ spaces or comments after job header)
    if (skipping && (line.match(/^\s{4,}/) || line.trim() === '' || line.match(/^\s{2,}#/))) {
      continue;
    }
    if (skipping && line.match(/^\s{2}\w/)) {
      skipping = false;
    }

    if (!skipping) result.push(line);
  }

  writeRegistryAtomic(result.join('\n'));
}
