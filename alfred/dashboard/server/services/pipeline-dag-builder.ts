/**
 * Pipeline DAG Builder
 *
 * Composes pipeline DAG data from stage-metrics and pulse-client
 * for the Pipeline Flow visualization in Nexus-Ops.
 */
import { getTasks, getStageTransitionEvents } from './pulse-client.js';
import { computeStageMetrics } from './stage-metrics.js';
import type { StageAggregate } from './stage-metrics.js';
import type { Task } from '../types.js';

const STAGES = ['intake', 'evaluate', 'route', 'review', 'queue', 'execute'] as const;
type Stage = (typeof STAGES)[number];

export interface PipelineTransition {
  from: string;
  to: string;
  timestamp: string;
  actor?: string;
  outcome?: string;
}

export interface PipelineDAGTask {
  id: string;
  title: string;
  status: string;
  currentStage: string | null;
  priority: number;
  labels: string[];
  stageEnteredAt: string | null;
  transitions: PipelineTransition[];
  decision?: {
    action: string;
    confidence?: number;
    risk?: string;
  };
}

export interface PipelineDAGResponse {
  tasks: PipelineDAGTask[];
  stageAggregates: StageAggregate[];
  flowEdges: { from: string; to: string; count: number }[];
  timestamp: string;
}

function getCurrentStage(task: Task): Stage | 'closed' | null {
  if (task.status === 'closed') return 'closed';
  const stageLabel = task.labels.find((l) => l.startsWith('stage:'));
  if (!stageLabel) return null;
  const stage = stageLabel.slice(6);
  return STAGES.includes(stage as Stage) ? (stage as Stage) : null;
}

function inferOutcome(from: string, to: string, labels: string[]): string | undefined {
  if (from === 'evaluate' && to === 'queue') return 'fast-track';
  if (from === 'review' && to === 'evaluate') return 'feedback-loop';
  if (from === 'execute' && to === 'review') return 'execution-failed';
  if (labels.includes('review:escalated')) return 'escalated';
  return undefined;
}

function extractDecision(task: Task): PipelineDAGTask['decision'] | undefined {
  const risk = task.labels.find((l) => l.startsWith('risk:'))?.slice(5);
  const isPipelineApproved = task.labels.includes('pipeline:approved');
  const isEscalated = task.labels.includes('review:escalated');

  if (isEscalated) return { action: 'escalate', risk };
  if (isPipelineApproved) return { action: 'approve', risk };
  if (task.labels.includes('pipeline:needs-approval')) return { action: 'pending', risk };
  if (risk) return { action: 'evaluate', risk };
  return undefined;
}

interface RawEvent {
  id: number;
  task_id: string;
  event_type: string;
  actor: string;
  field?: string;
  old_value?: string;
  new_value?: string;
  comment?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

/**
 * Build per-task transitions from label_mutation events.
 * Pulse events have: field="stage", old_value="stage:X", new_value="stage:Y"
 */
function buildTransitionsFromEvents(
  events: RawEvent[],
  taskLabels: Map<string, string[]>,
): {
  transitionsByTask: Map<string, PipelineTransition[]>;
  lastEnteredByTask: Map<string, string>; // taskId → ISO timestamp of last stage entry
} {
  const transitionsByTask = new Map<string, PipelineTransition[]>();
  const lastEnteredByTask = new Map<string, string>();

  // Events come newest-first from Pulse, reverse for chronological
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  for (const event of sorted) {
    if (event.field !== 'stage') continue;

    const fromMatch = event.old_value?.match(/^stage:(\w+)$/);
    const toMatch = event.new_value?.match(/^stage:(\w+)$/);
    if (!fromMatch || !toMatch) continue;

    const from = fromMatch[1];
    const to = toMatch[1];
    const labels = taskLabels.get(event.task_id) ?? [];

    if (!transitionsByTask.has(event.task_id)) {
      transitionsByTask.set(event.task_id, []);
    }

    transitionsByTask.get(event.task_id)!.push({
      from,
      to,
      timestamp: event.created_at,
      actor: event.actor || (event.metadata?.source as string) || undefined,
      outcome: inferOutcome(from, to, labels),
    });

    lastEnteredByTask.set(event.task_id, event.created_at);
  }

  return { transitionsByTask, lastEnteredByTask };
}

export async function buildPipelineDAG(): Promise<PipelineDAGResponse> {
  const [tasks, events, metrics] = await Promise.all([
    getTasks(),
    getStageTransitionEvents(500),
    computeStageMetrics(),
  ]);

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  // Build label lookup
  const taskLabels = new Map(tasks.map((t) => [t.id, t.labels]));

  // Build transitions from raw events
  const { transitionsByTask, lastEnteredByTask } = buildTransitionsFromEvents(
    events as RawEvent[],
    taskLabels,
  );

  // Include open tasks + recently closed (last 24h)
  const relevantTasks = tasks.filter((t) => {
    if (t.status !== 'closed') return true;
    return t.closed_at ? new Date(t.closed_at).getTime() >= oneDayAgo : false;
  });

  // Aggregate flow edges
  const flowCounts = new Map<string, number>();

  const dagTasks: PipelineDAGTask[] = relevantTasks
    .map((task) => {
      const currentStage = getCurrentStage(task);
      const transitions = transitionsByTask.get(task.id) ?? [];

      // Count flow edges
      for (const t of transitions) {
        const key = `${t.from}→${t.to}`;
        flowCounts.set(key, (flowCounts.get(key) ?? 0) + 1);
      }

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        currentStage,
        priority: task.priority,
        labels: task.labels,
        stageEnteredAt: lastEnteredByTask.get(task.id) ?? null,
        transitions,
        decision: extractDecision(task),
      };
    })
    .filter((t) => t.currentStage !== null);

  // Cap closed tasks to 10 most recent
  const openTasks = dagTasks.filter((t) => t.currentStage !== 'closed');
  const closedTasks = dagTasks
    .filter((t) => t.currentStage === 'closed')
    .sort((a, b) => {
      const aTime = a.stageEnteredAt ? new Date(a.stageEnteredAt).getTime() : 0;
      const bTime = b.stageEnteredAt ? new Date(b.stageEnteredAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 10);

  const flowEdges = Array.from(flowCounts.entries()).map(([key, count]) => {
    const [from, to] = key.split('→');
    return { from, to, count };
  });

  return {
    tasks: [...openTasks, ...closedTasks],
    stageAggregates: metrics.stages,
    flowEdges,
    timestamp: new Date().toISOString(),
  };
}
