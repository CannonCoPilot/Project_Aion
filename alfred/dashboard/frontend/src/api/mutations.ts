import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post, patch, del } from './client';
import type { Task } from './tasks';

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      priority?: number;
      labels?: string[];
      assignee?: string;
    }) => post<Task>('/tasks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      status?: string;
      priority?: number;
      assignee?: string;
      notes?: string;
      append_notes?: string;
    }) => patch<Task>(`/tasks/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['task-events', id] });
    },
  });
}

export function useCloseTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { reason: string }) => post<Task>(`/tasks/${id}/close`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['task-events', id] });
    },
  });
}

export function useAddLabel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => post<Task>(`/tasks/${id}/labels`, { label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['labels-live'] });
    },
  });
}

export function useSummarizeTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { save?: boolean }) =>
      post<{ summary: string }>(`/tasks/${id}/summarize`, data),
    onSuccess: (_data, variables) => {
      if (variables.save) {
        qc.invalidateQueries({ queryKey: ['task', id] });
        qc.invalidateQueries({ queryKey: ['task-events', id] });
      }
    },
  });
}

export function useAskAboutTask(id: string) {
  return useMutation({
    mutationFn: (data: { question: string }) => post<{ answer: string }>(`/tasks/${id}/ask`, data),
  });
}

export function useSaveAskToComments(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { question: string; answer: string }) =>
      post<{ ok: boolean }>(`/tasks/${id}/ask/save`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-events', id] });
    },
  });
}

export function useTaskTransition(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { scenario: string; source?: string }) =>
      post<{ message: string }>(`/tasks/${id}/transition`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-events', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export function useRemoveLabel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => del<void>(`/tasks/${id}/labels/${encodeURIComponent(label)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['labels-live'] });
    },
  });
}
