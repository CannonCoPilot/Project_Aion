import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from './client';

export interface WatchTrigger {
  id: number;
  task_id: string;
  condition: string;
  file_patterns: string[] | null;
  source_type: string;
  status: string;
  created_by: string;
  created_at: string;
  satisfied_at: string | null;
  expires_at: string | null;
  satisfied_by: string | null;
  last_checked_at: string | null;
  check_count: number;
}

interface WatchResult {
  message: string;
  trigger_id: number;
  condition: string;
  file_patterns: string[];
}

/** Get active watch triggers for a task */
export function useTaskWatchTriggers(taskId?: string) {
  return useQuery({
    queryKey: ['watch-triggers', taskId],
    queryFn: () => get<WatchTrigger[]>(`/tasks/${taskId}/watch`),
    enabled: !!taskId,
    refetchInterval: 60_000,
  });
}

/** One-click smart watch trigger creation — backend auto-generates condition + patterns */
export function useCreateTaskWatch(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params?: {
      condition?: string;
      file_patterns?: string[];
      expires_days?: number;
    }) => post<WatchResult>(`/tasks/${taskId}/watch`, params ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['watch-triggers', taskId] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

/** Cancel a watch trigger and return task to Sir's queue */
export function useCancelTaskWatch(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (triggerId: number) =>
      post<{ message: string }>(`/tasks/${taskId}/watch/${triggerId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['watch-triggers', taskId] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
