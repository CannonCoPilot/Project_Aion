import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from './client';

export interface NotificationHistoryItem {
  id: number;
  title: string;
  body: string;
  category: string;
  severity: string;
  url: string | null;
  task_id: string | null;
  source: string | null;
  read: boolean;
  created_at: string;
}

export function useNotificationHistory(limit = 50, unreadOnly = false) {
  return useQuery({
    queryKey: ['notification-history', limit, unreadOnly],
    queryFn: () =>
      get<{ notifications: NotificationHistoryItem[] }>(
        '/notifications/history',
        { limit: String(limit), unread_only: unreadOnly ? '1' : undefined },
      ).then(r => r.notifications),
    refetchInterval: 30000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: () => get<{ count: number }>('/notifications/unread-count').then(r => r.count),
    refetchInterval: 15000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => post(`/notifications/${id}/read`, {}),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notification-history'] });
      await qc.cancelQueries({ queryKey: ['notification-unread-count'] });

      // Optimistic update: mark item read immediately in the cache
      qc.setQueriesData<NotificationHistoryItem[]>(
        { queryKey: ['notification-history'] },
        (old) => old?.map(n => n.id === id ? { ...n, read: true } : n),
      );
      qc.setQueriesData<number>(
        { queryKey: ['notification-unread-count'] },
        (old) => Math.max(0, (old ?? 1) - 1),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notification-history'] });
      qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/notifications/read-all', {}),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['notification-history'] });
      await qc.cancelQueries({ queryKey: ['notification-unread-count'] });

      // Optimistic update: mark all read
      qc.setQueriesData<NotificationHistoryItem[]>(
        { queryKey: ['notification-history'] },
        (old) => old?.map(n => ({ ...n, read: true })),
      );
      qc.setQueryData(['notification-unread-count'], 0);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notification-history'] });
      qc.invalidateQueries({ queryKey: ['notification-unread-count'] });
    },
  });
}
