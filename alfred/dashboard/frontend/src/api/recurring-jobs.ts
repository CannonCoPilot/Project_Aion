import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, put, del } from './client';

// Types

export interface JobHealth {
  status: 'healthy' | 'warning' | 'failing' | 'unknown';
  sla: {
    onTimeRate7d: number;
    successRate7d: number;
    lastSuccessfulRun: string | null;
    expectedNextRun: string | null;
    missedRuns7d: number;
  };
  consecutiveFailures: number;
  lastError?: string;
  costAnomaly: boolean;
}

export interface JobStats {
  totalCost7d: number;
  avgCost: number;
  runCount7d: number;
  avgDurationMs: number;
  failCount7d: number;
}

export interface JobIntegration {
  service: string;
  email?: string;
  recipient?: string;
}

export interface JobTriggerParam {
  name: string;
  default?: string;
  required?: boolean;
}

export interface JobTrigger {
  webhook?: boolean;
  parameters?: JobTriggerParam[];
}

export interface JobTeamMember {
  name: string;
  persona?: string;
  model?: string;
}

export interface JobTeam {
  mode: string;
  members: JobTeamMember[];
  consensus?: { rule: string };
}

export interface RecurringJob {
  id: string;
  source: 'nexus' | 'cron' | 'systemd';
  name: string;
  description: string;
  schedule: string;
  scheduleType: string;
  enabled: boolean;
  hasOverride: boolean;
  status: 'idle' | 'running' | 'disabled';
  lastRun: string | null;
  nextRun: string | null;
  persona?: string;
  project?: string;
  engine?: string;
  maxBudget?: number;
  maxTurns?: number;
  maxDailyBudgetUsd?: number;
  timeoutMinutes?: number;
  workflowFile?: string;
  tags: string[];
  integrations?: JobIntegration[];
  trigger?: JobTrigger;
  team?: JobTeam;
  health: JobHealth;
  stats: JobStats;
  capabilities: string[];
}

export interface RecurringJobsResponse {
  jobs: RecurringJob[];
  summary: {
    total: number;
    enabled: number;
    running: number;
    healthy: number;
    warning: number;
    failing: number;
    bySource: { nexus: number; cron: number; systemd: number };
    totalCost7d: number;
  };
}

export interface ExecutionLogEntry {
  file: string;
  job: string;
  timestamp: string;
  isError: boolean;
  isMissed?: boolean;
  cost: number;
  durationMs: number;
}

// Hooks

export function useRecurringJobs(days = 7) {
  return useQuery({
    queryKey: ['recurring-jobs', days],
    queryFn: () => get<RecurringJobsResponse>(`/recurring-jobs?days=${days}`),
    refetchInterval: 15_000,
  });
}

export function useToggleJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source: string; jobId: string; enabled: boolean }) =>
      patch(`/recurring-jobs/${payload.source}/${payload.jobId}`, { enabled: payload.enabled }),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['recurring-jobs'] });
      const prev = qc.getQueryData<RecurringJobsResponse>(['recurring-jobs', 7]);
      if (prev) {
        qc.setQueryData<RecurringJobsResponse>(['recurring-jobs', 7], {
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.id === `${payload.source}:${payload.jobId}` ? { ...j, enabled: payload.enabled } : j,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['recurring-jobs', 7], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['recurring-jobs'] }),
  });
}

export function useUpdateJobSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source: string; jobId: string; overrides: Record<string, unknown> }) =>
      patch(`/recurring-jobs/${payload.source}/${payload.jobId}`, payload.overrides),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['recurring-jobs'] });
      const prev = qc.getQueryData<RecurringJobsResponse>(['recurring-jobs', 7]);
      if (prev) {
        qc.setQueryData<RecurringJobsResponse>(['recurring-jobs', 7], {
          ...prev,
          jobs: prev.jobs.map((j) =>
            j.id === `${payload.source}:${payload.jobId}`
              ? { ...j, hasOverride: true, ...payload.overrides }
              : j,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['recurring-jobs', 7], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['recurring-jobs'] }),
  });
}

export function useRunJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source: string; jobId: string }) =>
      post(`/recurring-jobs/${payload.source}/${payload.jobId}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-jobs'] }),
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => post('/recurring-jobs', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-jobs'] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => del(`/recurring-jobs/nexus/${jobId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-jobs'] }),
  });
}

export function useResetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source: string; jobId: string }) =>
      del(`/recurring-jobs/${payload.source}/${payload.jobId}/override`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-jobs'] }),
  });
}

export function useJobLogs(source: string, jobId: string, days?: number) {
  const daysParam = days ? `?days=${days}` : '';
  return useQuery({
    queryKey: ['recurring-jobs', source, jobId, 'logs', days],
    queryFn: () => get<ExecutionLogEntry[]>(`/recurring-jobs/${source}/${jobId}/logs${daysParam}`),
    enabled: !!jobId,
  });
}

export function useJobWorkflow(jobId: string) {
  return useQuery({
    queryKey: ['recurring-jobs', 'workflow', jobId],
    queryFn: () =>
      get<{ jobId: string; content: string }>(`/recurring-jobs/nexus/${jobId}/workflow`),
    enabled: !!jobId,
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { jobId: string; content: string }) =>
      put(`/recurring-jobs/nexus/${payload.jobId}/workflow`, { content: payload.content }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['recurring-jobs', 'workflow', vars.jobId] });
    },
  });
}

export function useWorkflowAssist() {
  return useMutation({
    mutationFn: (payload: { jobId: string; instruction: string }) =>
      post<{ content: string }>(`/recurring-jobs/nexus/${payload.jobId}/workflow/assist`, {
        instruction: payload.instruction,
      }),
  });
}

export function usePersonas() {
  return useQuery({
    queryKey: ['recurring-jobs', 'personas'],
    queryFn: () => get<{ personas: string[] }>('/recurring-jobs/personas'),
    staleTime: 60_000,
  });
}

export function useHealthSummary() {
  return useQuery({
    queryKey: ['recurring-jobs', 'health-summary'],
    queryFn: () =>
      get<{ summary: Record<string, unknown>; warnings: unknown[]; failing: unknown[] }>(
        '/recurring-jobs/health-summary',
      ),
    refetchInterval: 30_000,
  });
}
