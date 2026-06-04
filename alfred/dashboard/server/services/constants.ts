// Canonical label constants — single source of truth for the server
// Derived from label-taxonomy.yaml. All server routes import from here.

/** Labels that block progress — needs human input or external event */
export const BLOCKER_LABELS = [
  'waiting:david',
  'waiting:external',
  'waiting:subtasks',
  'waiting:session',
  'needs-input',
  'manual-action',
  'pipeline:needs-approval',
] as const;

/** Prefixes that indicate a blocker (prefix match) */
export const BLOCKER_PREFIXES = ['blocked'] as const;

/** Check if a task's labels contain any blocker */
export function isBlocked(labels: string[]): boolean {
  return (
    labels.some((l) => (BLOCKER_LABELS as readonly string[]).includes(l)) ||
    labels.some((l) => BLOCKER_PREFIXES.some((p) => l.startsWith(`${p}:`)))
  );
}

/** Check if a task is deferred */
export function isDeferred(task: { status: string; labels?: string[] }): boolean {
  const labels = task.labels ?? [];
  return (
    task.status === 'deferred' ||
    labels.includes('parked') ||
    labels.some((l) => l.includes('defer'))
  );
}
