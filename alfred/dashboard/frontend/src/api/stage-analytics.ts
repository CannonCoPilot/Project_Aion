import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface StageAggregate {
  stage: string;
  count: number;
  avgDurationSecs: number;
  medianDurationSecs: number;
  p90DurationSecs: number;
  maxDurationSecs: number;
  completedTransitions: number;
  throughputPerDay: number;
}

export interface StageMetrics {
  timestamp: string;
  timeWindowDays: number;
  stages: StageAggregate[];
  bottleneck: string | null;
  totalTasksTracked: number;
  oldestTransition: string | null;
}

export interface StageTransition {
  taskId: string;
  stage: string;
  enteredAt: string;
  exitedAt: string | null;
  durationSecs: number | null;
}

export interface TaskStageHistory {
  taskId: string;
  title: string;
  status: string;
  currentStage: string | null;
  transitions: StageTransition[];
  totalDurationSecs: number;
}

export function useStageMetrics() {
  return useQuery({
    queryKey: ['stage-metrics'],
    queryFn: () => get<StageMetrics>('/analytics/stages'),
    refetchInterval: 30_000,
  });
}

export function useTaskStageHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-stage-history', taskId],
    queryFn: () => get<TaskStageHistory>(`/analytics/stages/${taskId}`),
    enabled: !!taskId,
  });
}
