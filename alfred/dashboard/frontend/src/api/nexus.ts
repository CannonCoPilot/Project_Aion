import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface NexusEvent {
  id: number;
  timestamp: string;
  type: string;
  job: string;
  summary: string;
  severity: string;
  cost?: number;
  duration?: number;
  status?: string;
  source?: string;
  output_file?: string;
  raw?: Record<string, unknown>;
}

export interface HealthStatus {
  status: string;
  timestamp: string;
  dispatcher: {
    status: string;
    lastHeartbeat: string | null;
    heartbeatAge: number | null;
  };
  jobs: Array<{
    name: string;
    status: string;
    lastRun: string | null;
    failCount: number;
  }>;
  messageBus: {
    pendingCount: number;
    pendingApprovals: number;
    oldestPending: string | null;
  };
  tasks: {
    taskCount: number;
    openCount: number;
  };
  websocket?: {
    activeConnections: number;
    totalConnections: number;
    lastBroadcast: string | null;
    broadcastCount: number;
  };
  notifications?: {
    sent: number;
    failed: number;
    staleRemoved: number;
    lastSentAt: string | null;
    lastFailedAt: string | null;
    activeSubscriptions: number;
  };
}

export interface Approval {
  id: string;
  job: string;
  question: string;
  timestamp: string;
  context?: string;
  options?: string[];
}

export function useActivity(limit = 20) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: () =>
      get<{ events: NexusEvent[]; hasMore: boolean }>(`/activity`, { limit: String(limit) }),
    refetchInterval: 10_000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => get<HealthStatus>('/health'),
    refetchInterval: 30_000,
  });
}

export function useApprovals() {
  return useQuery({
    queryKey: ['approvals'],
    queryFn: () => get<{ approvals: Approval[] }>('/approvals').then((r) => r.approvals),
    refetchInterval: 10_000,
  });
}
