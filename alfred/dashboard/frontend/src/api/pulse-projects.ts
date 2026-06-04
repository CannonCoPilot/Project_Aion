import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from './client';

export interface PulseProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  owner: string;
  phases: Array<{
    id: string;
    name: string;
    status: string;
    blocked_by?: string;
    task_count: number;
  }>;
  approval: Record<string, string | number | boolean | null> | null;
  config: Record<string, string | number | boolean | null>;
  source_yaml: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  task_count: number;
  tasks_done: number;
  progress_pct: number;
}

export function usePulseProjects(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return useQuery({
    queryKey: ['pulse-projects', status],
    queryFn: () => get<{ projects: PulseProject[]; total: number }>(`/pulse/projects${qs}`),
    refetchInterval: 30_000,
  });
}

export function usePulseProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ['pulse-project', projectId],
    queryFn: () => get<PulseProject>(`/pulse/projects/${projectId}`),
    enabled: !!projectId,
    refetchInterval: 15_000,
  });
}

export function usePulseProjectTasks(projectId: string | undefined, phaseId?: string) {
  return useQuery({
    queryKey: ['pulse-project-tasks', projectId, phaseId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (phaseId) params.set('phase_id', phaseId);
      const qs = params.toString() ? `?${params}` : '';
      return get<Record<string, unknown>[]>(`/pulse/projects/${projectId}/tasks${qs}`);
    },
    enabled: !!projectId,
    refetchInterval: 15_000,
  });
}

export function useAdvanceProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      post<Record<string, unknown>>(`/pulse/projects/${projectId}/advance`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pulse-projects'] });
      queryClient.invalidateQueries({ queryKey: ['pulse-project'] });
      queryClient.invalidateQueries({ queryKey: ['pulse-project-tasks'] });
    },
  });
}

export function useExecuteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      post<Record<string, unknown>>(`/pulse/projects/${projectId}/execute`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pulse-projects'] });
    },
  });
}

export function useApproveGate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, taskId }: { projectId: string; taskId: string }) =>
      post<{ approved: boolean; task_id: string }>(
        `/pulse/projects/${projectId}/tasks/${taskId}/approve-gate`,
        { actor: 'dashboard' },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pulse-projects'] });
      queryClient.invalidateQueries({ queryKey: ['pulse-project'] });
      queryClient.invalidateQueries({ queryKey: ['pulse-project-tasks'] });
    },
  });
}
