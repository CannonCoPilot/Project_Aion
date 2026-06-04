import type { Task } from '../api/tasks';

const PREFIX_COLORS: Record<string, { bg: string; text: string }> = {
  auto: { bg: 'bg-label-auto-bg/20', text: 'text-label-auto' },
  risk: { bg: 'bg-label-risk-bg/20', text: 'text-label-risk' },
  pipeline: { bg: 'bg-label-pipeline-bg/20', text: 'text-label-pipeline' },
  domain: { bg: 'bg-label-domain-bg/20', text: 'text-label-domain' },
  project: { bg: 'bg-label-project-bg/20', text: 'text-label-project' },
  source: { bg: 'bg-label-source-bg/20', text: 'text-label-source' },
  capability: { bg: 'bg-label-capability-bg/20', text: 'text-label-capability' },
  aurora: { bg: 'bg-label-aurora-bg/20', text: 'text-label-aurora' },
  waiting: { bg: 'bg-label-waiting-bg/20', text: 'text-label-waiting' },
  severity: { bg: 'bg-label-severity-bg/20', text: 'text-label-severity' },
  action: { bg: 'bg-label-action-bg/20', text: 'text-label-action' },
  agent: { bg: 'bg-label-agent-bg/20', text: 'text-label-agent' },
  type: { bg: 'bg-label-type-bg/20', text: 'text-label-type' },
  review: { bg: 'bg-label-review-bg/20', text: 'text-label-review' },
  stage: { bg: 'bg-label-stage-bg/20', text: 'text-label-stage' },
  blocked: { bg: 'bg-label-risk-bg/20', text: 'text-label-risk' },
  orchestration: { bg: 'bg-label-pipeline-bg/20', text: 'text-label-pipeline' },
  phase: { bg: 'bg-label-pipeline-bg/20', text: 'text-label-pipeline' },
  'completed-by': { bg: 'bg-label-source-bg/20', text: 'text-label-source' },
  assigned: { bg: 'bg-label-capability-bg/20', text: 'text-label-capability' },
  quality: { bg: 'bg-label-stage-bg/20', text: 'text-label-stage' },
  parent: { bg: 'bg-label-pipeline-bg/20', text: 'text-label-pipeline' },
  'follow-up': { bg: 'bg-label-pipeline-bg/20', text: 'text-label-pipeline' },
  approval: { bg: 'bg-label-pipeline-bg/20', text: 'text-label-pipeline' },
};

const DEFAULT_COLOR = { bg: 'bg-surface-muted/20', text: 'text-tertiary' };

export function getLabelColor(label: string) {
  const prefix = label.split(':')[0];
  return PREFIX_COLORS[prefix] ?? DEFAULT_COLOR;
}

export function getLabelPrefix(label: string): string {
  return label.split(':')[0];
}

export function getLabelValue(label: string): string {
  const parts = label.split(':');
  return parts.length > 1 ? parts.slice(1).join(':') : label;
}

// Prefixes that control the Nexus execution pipeline
const EXECUTION_PREFIXES = new Set([
  'auto',
  'risk',
  'waiting',
  'aurora',
  'pipeline',
  'action',
  'review',
  'stage',
  'blocked',
]);

// Standalone labels that are execution-related
const EXECUTION_STANDALONE = new Set(['parked', 'needs-input', 'manual-action']);

// Labels that block progress — needs human input or external event
const BLOCKER_LABELS = new Set([
  'waiting:david',
  'waiting:external',
  'waiting:subtasks',
  'waiting:session',
  'waiting:trigger',
  'needs-input',
  'manual-action',
  'pipeline:needs-approval',
  'blocked:dependency',
]);

// Blocked reason derivation — computed from existing labels, never stored
export type BlockedReason =
  | 'decision'
  | 'research'
  | 'input'
  | 'dependency'
  | 'session'
  | 'external'
  | 'manual'
  | 'approval'
  | 'parked'
  | 'pipeline';

export interface BlockedReasonDef {
  reason: BlockedReason;
  label: string;
  description: string;
  derivedFrom: string[];
}

export const BLOCKED_REASONS: BlockedReasonDef[] = [
  {
    reason: 'research',
    label: 'Research Review',
    description: 'Research findings awaiting review',
    derivedFrom: ['review:research'],
  },
  {
    reason: 'decision',
    label: 'Decision needed',
    description: 'Waiting for Sir to make a call',
    derivedFrom: ['waiting:david'],
  },
  {
    reason: 'input',
    label: 'Input needed',
    description: 'Task description incomplete, needs clarification',
    derivedFrom: ['needs-input'],
  },
  {
    reason: 'dependency',
    label: 'Task dependency',
    description: 'Blocked on another task or project phase',
    derivedFrom: ['waiting:subtasks', 'depends:*', 'blocked:dependency'],
  },
  {
    reason: 'session',
    label: 'Needs CLI session',
    description: 'Too complex for Nexus — waiting for Sir to pick up in CLI',
    derivedFrom: ['waiting:session'],
  },
  {
    reason: 'external',
    label: 'External blocker',
    description: 'Waiting on third-party, vendor, or release',
    derivedFrom: ['waiting:external'],
  },
  {
    reason: 'manual',
    label: 'Manual action',
    description: 'Requires physical or hands-on action (not automatable)',
    derivedFrom: ['manual-action'],
  },
  {
    reason: 'approval',
    label: 'Approval gate',
    description: 'Queued in the approval pipeline',
    derivedFrom: ['pipeline:needs-approval'],
  },
  {
    reason: 'parked',
    label: 'Parked',
    description: 'Deliberately shelved, no timeline',
    derivedFrom: ['parked'],
  },
  {
    reason: 'pipeline',
    label: 'Pipeline blocked',
    description: 'Blocked by pipeline (max retries, safety, or other)',
    derivedFrom: ['blocked:yes'],
  },
];

const BLOCKED_REASON_MAP: {
  exact: Map<string, BlockedReason>;
  prefixes: { prefix: string; reason: BlockedReason }[];
} = {
  exact: new Map([
    ['review:research', 'research'],
    ['waiting:david', 'decision'],
    ['needs-input', 'input'],
    ['waiting:subtasks', 'dependency'],
    ['blocked:dependency', 'dependency'],
    ['waiting:session', 'session'],
    ['waiting:external', 'external'],
    ['manual-action', 'manual'],
    ['pipeline:needs-approval', 'approval'],
    ['parked', 'parked'],
    ['blocked:yes', 'pipeline'],
  ]),
  prefixes: [
    { prefix: 'depends:', reason: 'dependency' },
  ],
};

/** Derive the blocked reason(s) for a task from its labels. Returns empty array if not blocked. */
export function getBlockedReasons(labels: string[]): BlockedReason[] {
  const reasons = new Set<BlockedReason>();
  for (const l of labels) {
    const exact = BLOCKED_REASON_MAP.exact.get(l);
    if (exact) {
      reasons.add(exact);
      continue;
    }
    for (const p of BLOCKED_REASON_MAP.prefixes) {
      if (l.startsWith(p.prefix)) {
        reasons.add(p.reason);
        break;
      }
    }
  }
  return [...reasons];
}

export type LabelRole = 'execution' | 'context';

export function getLabelRole(label: string): LabelRole {
  const prefix = label.split(':')[0];
  if (EXECUTION_PREFIXES.has(prefix)) return 'execution';
  if (EXECUTION_STANDALONE.has(label)) return 'execution';
  return 'context';
}

/** Blocked reasons that represent Sir's action items — should NOT dim rows */
const ACTIONABLE_REASONS: ReadonlySet<BlockedReason> = new Set([
  'decision',
  'research',
  'session',
  'approval',
  'input',
  'manual',
]);

/** Returns true if all blocked reasons are actionable by Sir (his turn, not a passive block) */
export function isActionableBlock(reasons: BlockedReason[]): boolean {
  return reasons.length > 0 && reasons.every((r) => ACTIONABLE_REASONS.has(r));
}

export function isBlockerLabel(label: string): boolean {
  if (BLOCKER_LABELS.has(label)) return true;
  if (label.startsWith('blocked:') && label !== 'blocked:no') return true;
  return false;
}

/** Return the human-readable label for the primary blocked reason, or null if not blocked. */
export function getPrimaryBlockedLabel(labels: string[]): string | null {
  const reasons = getBlockedReasons(labels);
  if (reasons.length === 0) return null;
  const def = BLOCKED_REASONS.find((r) => r.reason === reasons[0]);
  return def?.label ?? null;
}

/** Count of forward dependencies this task has (from metadata.depends_on, set by Pulse/orchestrations). */
export function getDependencyCount(task: Task): number {
  const deps = (task.metadata as { depends_on?: unknown } | undefined)?.depends_on;
  return Array.isArray(deps) ? deps.length : 0;
}

/** Return the dependency IDs for a task, or empty array. */
export function getDependencyIds(task: Task): string[] {
  const deps = (task.metadata as { depends_on?: unknown } | undefined)?.depends_on;
  return Array.isArray(deps) ? (deps.filter((d) => typeof d === 'string') as string[]) : [];
}
