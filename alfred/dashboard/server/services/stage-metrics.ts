/**
 * Stage Metrics Service
 *
 * Computes time-in-stage, throughput, and bottleneck metrics
 * by reading stage: label transitions from events.jsonl.
 */
import { getTasks, getStageTransitionEvents } from './pulse-client.js';

const STAGES = ['intake', 'evaluate', 'route', 'review', 'queue', 'execute'] as const;
type Stage = (typeof STAGES)[number];

export interface StageTransition {
  taskId: string;
  stage: Stage;
  enteredAt: string; // ISO timestamp
  exitedAt: string | null;
  durationSecs: number | null;
}

export interface TaskStageHistory {
  taskId: string;
  title: string;
  status: string;
  currentStage: Stage | null;
  transitions: StageTransition[];
  totalDurationSecs: number;
}

export interface StageAggregate {
  stage: Stage;
  count: number; // tasks currently in this stage
  avgDurationSecs: number; // average time spent (completed transitions only)
  medianDurationSecs: number;
  p90DurationSecs: number;
  maxDurationSecs: number;
  completedTransitions: number; // how many tasks have exited this stage
  throughputPerDay: number; // tasks exiting this stage per day (last 7 days)
}

export interface StageMetrics {
  timestamp: string;
  timeWindowDays: number;
  stages: StageAggregate[];
  bottleneck: Stage | null; // stage with highest avg duration (excluding execute)
  totalTasksTracked: number;
  oldestTransition: string | null;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], pct: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Build stage transition history for all tasks from Pulse label_mutation events.
 *
 * Pulse events have: event_type='label_mutation', field='stage',
 * old_value='stage:review', new_value='stage:queue', task_id, created_at
 *
 * Each event represents leaving old_value and entering new_value.
 */
export async function buildStageHistories(): Promise<Map<string, StageTransition[]>> {
  const events = await getStageTransitionEvents(2000);
  const histories = new Map<string, StageTransition[]>();

  // Sort chronologically (oldest first) for correct enter/exit pairing
  const sorted = [...events]
    .filter((e) => e.field === 'stage')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const event of sorted) {
    const taskId = event.task_id ?? event.issue_id;
    if (!taskId) continue;

    if (!histories.has(taskId)) histories.set(taskId, []);
    const transitions = histories.get(taskId)!;

    // Extract stage names from old_value/new_value (format: "stage:queue" or just "queue")
    const oldStage = extractStageName(event.old_value);
    const newStage = extractStageName(event.new_value);

    // Close the old stage transition (if open)
    if (oldStage && STAGES.includes(oldStage)) {
      for (let i = transitions.length - 1; i >= 0; i--) {
        if (transitions[i].stage === oldStage && transitions[i].exitedAt === null) {
          transitions[i].exitedAt = event.created_at;
          transitions[i].durationSecs =
            (new Date(event.created_at).getTime() - new Date(transitions[i].enteredAt).getTime()) /
            1000;
          break;
        }
      }
    }

    // Open the new stage transition
    if (newStage && STAGES.includes(newStage)) {
      transitions.push({
        taskId,
        stage: newStage,
        enteredAt: event.created_at,
        exitedAt: null,
        durationSecs: null,
      });
    }
  }

  return histories;
}

function extractStageName(value: string | null | undefined): Stage | null {
  if (!value) return null;
  const name = value.startsWith('stage:') ? value.slice(6) : value;
  return STAGES.includes(name as Stage) ? (name as Stage) : null;
}

/**
 * Get full stage history for a specific task
 */
export async function getTaskStageHistory(taskId: string): Promise<TaskStageHistory | null> {
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  const allHistories = await buildStageHistories();
  const transitions = allHistories.get(taskId) ?? [];

  const currentStageLabel = (task.labels ?? []).find((l) => l.startsWith('stage:'));
  const currentStage = currentStageLabel ? (currentStageLabel.slice(6) as Stage) : null;

  // For open transitions (still in stage), compute duration to now
  const now = Date.now();
  const withLive = transitions.map((t) => ({
    ...t,
    durationSecs: t.durationSecs ?? (now - new Date(t.enteredAt).getTime()) / 1000,
  }));

  return {
    taskId,
    title: task.title,
    status: task.status,
    currentStage,
    transitions: withLive,
    totalDurationSecs: withLive.reduce((sum, t) => sum + (t.durationSecs ?? 0), 0),
  };
}

/**
 * Compute aggregate stage metrics
 */
export async function computeStageMetrics(days = 7): Promise<StageMetrics> {
  const histories = await buildStageHistories();
  const tasks = await getTasks();
  const now = Date.now();
  const sevenDaysAgo = now - days * 86400000;

  // Count current tasks per stage
  const currentCounts: Record<Stage, number> = {
    intake: 0,
    evaluate: 0,
    route: 0,
    review: 0,
    queue: 0,
    execute: 0,
  };
  for (const task of tasks) {
    if (task.status === 'closed') continue;
    const stageLabel = (task.labels ?? []).find((l) => l.startsWith('stage:'));
    if (stageLabel) {
      const stage = stageLabel.slice(6) as Stage;
      if (stage in currentCounts) currentCounts[stage]++;
    }
  }

  // Collect completed durations per stage and throughput
  const completedDurations: Record<Stage, number[]> = {
    intake: [],
    evaluate: [],
    route: [],
    review: [],
    queue: [],
    execute: [],
  };
  const recentExits: Record<Stage, number> = {
    intake: 0,
    evaluate: 0,
    route: 0,
    review: 0,
    queue: 0,
    execute: 0,
  };
  let oldest: string | null = null;

  for (const [, transitions] of histories) {
    for (const t of transitions) {
      if (!oldest || t.enteredAt < oldest) oldest = t.enteredAt;
      if (t.exitedAt && t.durationSecs != null) {
        if (t.stage in completedDurations) {
          completedDurations[t.stage].push(t.durationSecs);
        }
        // Throughput: exits in last 7 days
        if (new Date(t.exitedAt).getTime() >= sevenDaysAgo) {
          if (t.stage in recentExits) recentExits[t.stage]++;
        }
      }
    }
  }

  const stages: StageAggregate[] = STAGES.map((stage) => {
    const durations = completedDurations[stage];
    const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      stage,
      count: currentCounts[stage],
      avgDurationSecs: Math.round(avg),
      medianDurationSecs: Math.round(median(durations)),
      p90DurationSecs: Math.round(percentile(durations, 90)),
      maxDurationSecs: durations.length > 0 ? Math.round(Math.max(...durations)) : 0,
      completedTransitions: durations.length,
      throughputPerDay: Math.round((recentExits[stage] / days) * 10) / 10,
    };
  });

  // Bottleneck = stage with highest avg duration, excluding execute (execute is expected to be long)
  const nonExecuteStages = stages.filter(
    (s) => s.stage !== 'execute' && s.completedTransitions > 0,
  );
  const bottleneck =
    nonExecuteStages.length > 0
      ? nonExecuteStages.reduce((max, s) => (s.avgDurationSecs > max.avgDurationSecs ? s : max))
          .stage
      : null;

  return {
    timestamp: new Date().toISOString(),
    timeWindowDays: days,
    stages,
    bottleneck,
    totalTasksTracked: histories.size,
    oldestTransition: oldest,
  };
}
