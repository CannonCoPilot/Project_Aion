import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface ActiveLock {
  job: string;
  pid: number;
  alive: boolean;
}

export interface PipelineTask {
  id: string;
  title: string;
  priority: number;
  labels: string[];
  status?: string;
  notes?: string;
  question?: string | null;
  risk?: string | null;
  blockers?: string[];
}

export interface RecentExecution {
  job: string;
  timestamp: string;
  summary?: string;
  cost?: number;
  duration?: number;
  success: boolean;
}

export interface PipelineStatus {
  timestamp: string;
  locks: ActiveLock[];
  queued: PipelineTask[];
  executing: PipelineTask[];
  needsApproval: PipelineTask[];
  blocked: PipelineTask[];
  recentExecutions: RecentExecution[];
  dispatcher: {
    status: string;
    lastHeartbeat: string | null;
    heartbeatAge: number | null;
  };
}

export function usePipelineStatus() {
  return useQuery({
    queryKey: ['pipeline-status'],
    queryFn: () => get<PipelineStatus>('/pipeline/status'),
    refetchInterval: 10_000,
  });
}

export interface StageEntry {
  stage: string;
  count: number;
  tasks: PipelineTask[];
}

export interface PipelineStages {
  timestamp: string;
  stages: StageEntry[];
  totalOpen: number;
  unstaged: number;
}

export function usePipelineStages() {
  return useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: () => get<PipelineStages>('/pipeline/stages'),
    refetchInterval: 15_000,
  });
}
