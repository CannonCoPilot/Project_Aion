import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface JobSchedule {
  type: string;
  every_hours?: number;
  every_minutes?: number;
  day?: string;
  hour?: number;
}

export interface TimelineJob {
  name: string;
  description: string;
  persona: string;
  schedule: JobSchedule;
  scheduleDisplay: string;
  enabled: boolean;
  engine?: string;
  maxBudget?: number;
  lastRun: string | null;
  nextRun: string | null;
}

export interface JobHistoryEvent {
  id: number;
  type: string;
  timestamp: string;
  cost?: number;
  duration?: number;
  status?: string;
  summary?: string;
}

export function useTimeline() {
  return useQuery({
    queryKey: ['timeline'],
    queryFn: () => get<{ jobs: TimelineJob[] }>('/timeline').then(r => r.jobs),
    refetchInterval: 30_000,
  });
}

export function useJobHistory(job: string) {
  return useQuery({
    queryKey: ['job-history', job],
    queryFn: () => get<{ job: string; events: JobHistoryEvent[] }>(`/timeline/history/${job}`).then(r => r.events),
    enabled: !!job,
  });
}
