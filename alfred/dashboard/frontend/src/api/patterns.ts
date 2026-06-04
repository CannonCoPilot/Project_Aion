import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, put } from './client';

export interface PatternEntry {
  name: string;
  persona: string;
  description: string;
  conditions: string[];
  action: string;
  confidence: string;
  risk: string;
  note?: string;
  source?: string;
  enabled: boolean;
  defer_duration?: string;
}

export interface NegativeRule {
  index: number;
  persona: string;
  rule: string;
  enabled: boolean;
}

export interface PatternStats {
  pattern_name: string;
  hit_count: number;
  last_fired: string | null;
  agreed_count: number;
  wrong_count: number;
  adjust_count: number;
}

export interface FeedbackSummary {
  total_agreed: number;
  total_wrong: number;
  total_adjusted: number;
  last_feedback_date: string | null;
}

export function usePatterns(persona?: string) {
  return useQuery({
    queryKey: ['patterns', persona],
    queryFn: () =>
      get<{ patterns: PatternEntry[]; negative_rules: NegativeRule[] }>(
        '/patterns',
        persona ? { persona } : undefined,
      ),
    refetchInterval: 30_000,
  });
}

export function usePatternStats() {
  return useQuery({
    queryKey: ['patterns', 'stats'],
    queryFn: () => get<{ stats: PatternStats[] }>('/patterns/stats'),
    refetchInterval: 60_000,
  });
}

export function useFeedbackSummary() {
  return useQuery({
    queryKey: ['patterns', 'feedback-summary'],
    queryFn: () => get<FeedbackSummary>('/patterns/feedback-summary'),
    refetchInterval: 60_000,
  });
}

export function useTogglePattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ persona, name, enabled }: { persona: string; name: string; enabled: boolean }) =>
      put<{ ok: boolean }>(`/patterns/${persona}/${name}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patterns'] }),
  });
}

export function useUpdatePattern() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      persona,
      name,
      ...updates
    }: { persona: string; name: string } & Partial<PatternEntry>) =>
      put<{ ok: boolean }>(`/patterns/${persona}/${name}`, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patterns'] }),
  });
}

export function useToggleNegativeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      persona,
      index,
      enabled,
    }: {
      persona: string;
      index: number;
      enabled: boolean;
    }) => put<{ ok: boolean }>(`/patterns/${persona}/negative/${index}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patterns'] }),
  });
}
