import { useQuery } from '@tanstack/react-query';
import { get } from './client.js';

export interface HookEvent {
  id: number;
  timestamp: number;
  session_id: string;
  hook_event_type: string;
  source_app: string;
  payload: {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    agent_type?: string;
    complexity?: number;
  };
  patterns?: string[];
  task_id?: string;
  orchestration_id?: string;
  orchestration_action?: string;
}

export interface PAIStats {
  total_events: number;
  by_type?: Record<string, number>;
  by_tool?: Record<string, number>;
  by_session?: Record<string, number>;
  // Actual API field names
  events_by_type?: Record<string, number>;
  events_by_tool?: Record<string, number>;
  active_sessions?: string[];
}

export interface PAIHealth {
  status: string;
  uptime?: number;
}

export function usePAIHealth() {
  return useQuery({
    queryKey: ['pai-health'],
    queryFn: () => get<PAIHealth>('/pai/health'),
    refetchInterval: 10_000,
    retry: false,
  });
}

export function usePAIStats() {
  return useQuery({
    queryKey: ['pai-stats'],
    queryFn: () => get<PAIStats>('/pai/stats'),
    refetchInterval: 10_000,
    retry: 1,
  });
}

export function usePAIRecentEvents(limit = 100, sinceMs = 3600000) {
  return useQuery({
    queryKey: ['pai-events', limit, sinceMs],
    queryFn: () =>
      get<HookEvent[]>('/pai/events/recent', {
        limit: String(limit),
        since: String(sinceMs),
      }),
    refetchInterval: 10_000,
    retry: 1,
  });
}

export interface PAIPattern {
  name: string;
  count: number;
  last_seen?: number;
}

export function usePAIPatterns() {
  return useQuery({
    queryKey: ['pai-patterns'],
    queryFn: () => get<PAIPattern[]>('/pai/patterns'),
    refetchInterval: 30_000,
    retry: 1,
  });
}

export interface InfraStatus {
  updated_at: string | null;
  tasks: { open: number; in_progress: number; p1_count: number };
  nexus: { last_run: string | null; tasks_run: number; not_due: number; gated: number; failed: number };
  infra: { containers_running: number; containers_total: number; unhealthy_count: number; unhealthy_names: string[] };
  git: { branch: string; commits_today: number; uncommitted: number };
}

export function usePAIInfraStatus() {
  return useQuery({
    queryKey: ['pai-infra-status'],
    queryFn: () => get<InfraStatus>('/pai/infra-status'),
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function usePAISessionEvents(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['pai-session-events', sessionId],
    queryFn: () => get<HookEvent[]>(`/pai/events/session/${sessionId}`),
    enabled: !!sessionId,
    refetchInterval: 10_000,
    retry: 1,
  });
}
