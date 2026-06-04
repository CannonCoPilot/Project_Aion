import type { Task } from '../api/tasks';

export function classifyTasks(tasks: Task[]) {
  const researchReview: Task[] = [];
  const waitingDavid: Task[] = [];
  const waitingNexus: Task[] = [];
  const parked: Task[] = [];
  const uncategorized: Task[] = [];

  for (const t of tasks) {
    const labels = t.labels ?? [];
    const isDeferredTask =
      t.status === 'deferred' ||
      labels.includes('parked') ||
      labels.includes('waiting:trigger') ||
      labels.some((l) => l.includes('defer'));

    if (isDeferredTask) {
      parked.push(t);
    } else if (labels.includes('review:research')) {
      researchReview.push(t);
    } else if (
      labels.includes('waiting:david') ||
      labels.includes('pipeline:needs-approval') ||
      labels.includes('needs-input') ||
      labels.includes('manual-action')
    ) {
      waitingDavid.push(t);
    } else if (
      labels.includes('waiting:external') ||
      labels.some((l) => l.startsWith('blocked:') && l !== 'blocked:no')
    ) {
      waitingDavid.push(t);
    } else if (labels.includes('auto:ready')) {
      waitingNexus.push(t);
    } else {
      uncategorized.push(t);
    }
  }

  const quick = waitingDavid.filter((t) => {
    const labels = t.labels ?? [];
    return (
      labels.some((l) => l.startsWith('action:')) ||
      labels.includes('needs-input') ||
      labels.includes('manual-action') ||
      labels.includes('pipeline:needs-approval')
    );
  });
  const session = waitingDavid.filter((t) => !quick.includes(t));

  return { researchReview, quick, session, waitingNexus, parked, uncategorized };
}
