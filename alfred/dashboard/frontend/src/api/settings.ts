import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, patch } from './client';
import { setArchiveDays } from '../lib/board';

export interface DashboardSettings {
  archive_days: number;
  work_aggregator_interval_minutes: number;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const settings = await get<DashboardSettings>('/settings');
      // Sync archive_days to localStorage so classifyTask can use it without async
      setArchiveDays(settings.archive_days);
      return settings;
    },
    refetchInterval: 60000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<DashboardSettings>) =>
      patch<DashboardSettings>('/settings', settings),
    onSuccess: (data) => {
      setArchiveDays(data.archive_days);
      queryClient.setQueryData(['settings'], data);
      // Invalidate stats and tasks since archive threshold changed
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
