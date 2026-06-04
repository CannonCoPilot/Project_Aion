import { useQuery } from '@tanstack/react-query';
import { get } from './client';
import type { Task } from './tasks';

export interface WorkspaceSummary {
  name: string;
  taskCount: number;
  openCount: number;
  inProgressCount: number;
  available: boolean;
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => get<{ workspaces: WorkspaceSummary[] }>('/workspaces').then((r) => r.workspaces),
  });
}

export function useCrossWorkspaceTasks(workspace?: string, status?: string) {
  return useQuery({
    queryKey: ['cross-workspace-tasks', workspace, status],
    queryFn: () =>
      get<{ tasks: (Task & { _workspace: string })[]; total: number }>('/workspaces/tasks', {
        workspace,
        status,
      }),
    refetchInterval: 30_000,
  });
}
