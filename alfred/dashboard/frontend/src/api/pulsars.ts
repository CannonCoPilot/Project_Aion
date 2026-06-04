import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch } from './client';

// Types

export interface PulsarSchedule {
  type: 'daily' | 'weekly' | 'interval';
  hour?: number;
  day?: string;
  every_hours?: number;
}

export interface PulsarState {
  last_run: string;
  gate_fired?: string;
  gate_met_at?: string;
  last_task_id?: string;
  last_task_created?: string;
}

export interface KnowledgeEntry {
  date: string;
  task_id: string;
  title: string;
  summary: string;
}

export interface PulsarKnowledge {
  hasKnowledge: boolean;
  knowledgeCarryForward: boolean;
  runCount: number;
  latestFindings: string | null;
  runs: KnowledgeEntry[];
}

export interface ExternalService {
  name: string;
  endpoint: string;
  job: string;
  headless_job?: string;
  recipient?: string;
  sender?: string;
}

export interface PulsarDefinition {
  name: string;
  type: 'gate' | 'recurring' | 'monitor' | 'external';
  description: string;
  schedule: PulsarSchedule;
  scheduleLabel: string;
  enabled: boolean;
  state: PulsarState;
  status: 'watching' | 'fired' | 'active' | 'disabled' | 'external';
  taskTemplate: {
    title: string;
    priority: number;
    labels: string[];
  };
  knowledge: PulsarKnowledge;
  externalService?: ExternalService;
}

export interface PulsarsResponse {
  pulsars: PulsarDefinition[];
  summary: {
    total: number;
    enabled: number;
    watching: number;
    fired: number;
    byType: { gate: number; recurring: number; monitor: number };
  };
}

// Hooks

export function usePulsars() {
  return useQuery({
    queryKey: ['pulsars'],
    queryFn: () => get<PulsarsResponse>('/pulsars'),
    refetchInterval: 30_000,
  });
}

export function useTogglePulsar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; enabled: boolean }) =>
      patch(`/pulsars/${payload.name}`, { enabled: payload.enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulsars'] }),
  });
}

export function useResetPulsar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => post(`/pulsars/${name}/reset`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulsars'] }),
  });
}

export function useRunPulsar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      post<{ success: boolean; output: string }>(`/pulsars/${name}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulsars'] }),
  });
}
