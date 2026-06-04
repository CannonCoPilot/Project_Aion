import type { Task } from '../api/tasks';

export const BOARD_COLUMNS = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'ready', label: 'Ready' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'deferred', label: 'Deferred' },
  { id: 'archived', label: 'Archived' },
] as const;

// v2 pipeline columns — maps to 6-dimension label state machine
export const PIPELINE_COLUMNS = [
  { id: 'staging', label: 'Staging' },
  { id: 'evaluated', label: 'Evaluated' },
  { id: 'queued', label: 'Queued' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
  { id: 'blocked', label: 'Blocked' },
] as const;

// Legacy stage columns (v1) — kept for backward compat
export const STAGE_COLUMNS = [
  { id: 'intake', label: 'Intake' },
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'route', label: 'Route' },
  { id: 'review', label: 'Review' },
  { id: 'queue', label: 'Queue' },
  { id: 'execute', label: 'Execute' },
] as const;

export type PipelineColumn = (typeof PIPELINE_COLUMNS)[number]['id'];
export type StageColumn = (typeof STAGE_COLUMNS)[number]['id'];
export type BoardColumn = (typeof BOARD_COLUMNS)[number]['id'];

const ARCHIVE_DAYS_KEY = 'pulse_archive_days';
const DEFAULT_ARCHIVE_DAYS = 7;

export function getArchiveDays(): number {
  const stored = localStorage.getItem(ARCHIVE_DAYS_KEY);
  return stored ? parseInt(stored, 10) || DEFAULT_ARCHIVE_DAYS : DEFAULT_ARCHIVE_DAYS;
}

export function setArchiveDays(days: number): void {
  localStorage.setItem(ARCHIVE_DAYS_KEY, String(days));
}

// v1 blocker labels (legacy — used by classifyTask for status view)
export const BLOCKER_LABELS = [
  'waiting:human',
  'waiting:david',
  'waiting:external',
  'waiting:subtasks',
  'waiting:session',
  'needs-input',
  'manual-action',
  'pipeline:needs-approval',
] as const;
export const BLOCKER_PREFIXES = ['blocked'] as const;

export function isBlocked(labels: string[]): boolean {
  return (
    labels.some((l) => BLOCKER_LABELS.includes(l as (typeof BLOCKER_LABELS)[number])) ||
    labels.some((l) => BLOCKER_PREFIXES.some((p) => l.startsWith(`${p}:`)) && l !== 'blocked:no')
  );
}

export function isDeferred(task: Task): boolean {
  const labels = task.labels ?? [];
  return (
    task.status === 'deferred' ||
    labels.includes('parked') ||
    labels.includes('waiting:trigger') ||
    labels.some((l) => l.includes('defer'))
  );
}

function hasLabel(labels: string[], key: string): boolean {
  return labels.includes(key);
}

/** Extract the pipeline stage from a task's labels, or null if none */
export function getTaskStage(task: Task): StageColumn | null {
  const labels = task.labels ?? [];
  for (const l of labels) {
    if (l.startsWith('stage:')) {
      const stage = l.slice(6) as StageColumn;
      if (STAGE_COLUMNS.some((s) => s.id === stage)) return stage;
    }
  }
  return null;
}

/** Check if a task uses v2 pipeline labels (has any of the 6 dimensions) */
export function isV2Task(task: Task): boolean {
  const labels = task.labels ?? [];
  return labels.some((l) =>
    l.startsWith('staging:') || l.startsWith('evaluated:') ||
    l.startsWith('queued:') || l.startsWith('active:') ||
    l.startsWith('completed:') || l === 'blocked:yes' || l === 'blocked:no'
  );
}

/** v2 pipeline classifier — maps 6-dimension labels to pipeline columns */
export function classifyTaskPipeline(task: Task): PipelineColumn {
  const labels = task.labels ?? [];

  // Closed tasks are completed (FSM labels stripped on close)
  if (task.status === 'closed') return 'completed';

  // Blocked overrides everything
  if (hasLabel(labels, 'blocked:yes')) return 'blocked';

  // Terminal: completed
  if (hasLabel(labels, 'completed:done')) return 'completed';

  // Active: running or done (done = awaiting review)
  if (hasLabel(labels, 'active:running') || hasLabel(labels, 'active:done')) return 'active';

  // Queued: orchestrated, waiting for executor
  if (hasLabel(labels, 'queued:done') && !hasLabel(labels, 'active:running')) return 'queued';

  // Evaluated: passed evaluation, waiting for orchestration
  if (hasLabel(labels, 'evaluated:done') && !hasLabel(labels, 'queued:done')) return 'evaluated';

  // Staging: awaiting staging or evaluation
  return 'staging';
}

/** v1 board classifier (legacy — used for status view) */
export function classifyTask(task: Task): BoardColumn {
  const labels = task.labels ?? [];

  if (task.status === 'closed') {
    if (task.closed_at) {
      const closedMs = new Date(task.closed_at).getTime();
      const thresholdMs = Date.now() - getArchiveDays() * 86400000;
      if (closedMs < thresholdMs) return 'archived';
    }
    return 'done';
  }
  if (isDeferred(task)) return 'deferred';
  if (labels.includes('review:research')) return 'review';
  if (labels.includes('pipeline:needs-approval')) return 'approvals';
  if (isBlocked(labels)) return 'blocked';
  if (task.status === 'in_progress') return 'in_progress';
  if (labels.includes('stage:queue')) return 'ready';
  return 'backlog';
}

/** Default v2 labels applied to every new task */
export const V2_DEFAULT_LABELS = [
  'staging:wait',
  'evaluated:no',
  'queued:no',
  'active:no',
  'completed:no',
  'blocked:no',
];

/** Reset labels for unblock action */
export const V2_UNBLOCK_LABELS = [...V2_DEFAULT_LABELS];
