import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch, post, del } from './client';

interface RiskGates {
  auto_execute: string[];
  with_approval: string[];
  block: string[];
}

interface TimingEntry {
  every_hours: number;
}

interface TurboState {
  active: boolean;
  expires_at: string | null;
  mode: 'turbo' | 'turbo+' | null;
  default_timing: Record<string, TimingEntry>;
}

interface PipelineRunnerSettings {
  enabled: boolean;
  max_dispatches_per_hour: number;
}

interface TaskTypeOverride {
  gate: string;
  max_risk: string;
}

interface TaskReviewerThresholdTier {
  min_confidence: string;
  max_risk: string;
}

interface TaskReviewerThresholds {
  auto_execute: TaskReviewerThresholdTier;
  execute_medium: TaskReviewerThresholdTier;
  propose: TaskReviewerThresholdTier;
  escalate_below: string;
}

export interface AiProviderSettings {
  provider: 'ollama' | 'openai';
  ollama_model: string;
  openai_model: string;
  temperature: number;
}

interface AiProviderStatus extends AiProviderSettings {
  openai_configured: boolean;
}

export interface NexusSettings {
  version: number;
  risk_gates: Record<string, RiskGates>;
  timing: Record<string, TimingEntry>;
  turbo: TurboState;
  pipeline_runner?: PipelineRunnerSettings;
  task_type_overrides?: Record<string, TaskTypeOverride>;
  task_reviewer_thresholds?: TaskReviewerThresholds;
  ai_provider?: AiProviderSettings;
  updated_at: string;
  updated_by: string;
}

export function useNexusSettings() {
  return useQuery({
    queryKey: ['nexus-settings'],
    queryFn: () => get<NexusSettings>('/nexus-settings'),
    refetchInterval: 10000,
  });
}

export function useUpdateRiskGates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { executor: string; gates: RiskGates }) =>
      patch<NexusSettings>('/nexus-settings/risk-gates', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
    },
  });
}

export function useUpdateTiming() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { executor: string; every_hours: number }) =>
      patch<NexusSettings>('/nexus-settings/timing', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
    },
  });
}

export function useActivateTurbo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { duration_hours: number; interval_hours?: number }) =>
      post<NexusSettings>('/nexus-settings/turbo', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
    },
  });
}

export function useDeactivateTurbo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => del<NexusSettings>('/nexus-settings/turbo'),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
    },
  });
}

export function useUpdatePipelineRunner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { enabled?: boolean; max_dispatches_per_hour?: number }) =>
      patch<NexusSettings>('/nexus-settings/pipeline-runner', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
    },
  });
}

export function useUpdateTaskTypeOverrides() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { overrides: Record<string, TaskTypeOverride> }) =>
      patch<NexusSettings>('/nexus-settings/task-type-overrides', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
    },
  });
}

export function useUpdateTaskReviewerThresholds() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { thresholds: TaskReviewerThresholds }) =>
      patch<NexusSettings>('/nexus-settings/task-reviewer-thresholds', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
    },
  });
}

export function useAiProviderStatus() {
  return useQuery({
    queryKey: ['ai-provider-status'],
    queryFn: () => get<AiProviderStatus>('/ai-provider/status'),
  });
}

export function useUpdateAiProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<AiProviderSettings>) =>
      patch<NexusSettings>('/nexus-settings/ai-provider', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['nexus-settings'], data);
      queryClient.invalidateQueries({ queryKey: ['ai-provider-status'] });
    },
  });
}
