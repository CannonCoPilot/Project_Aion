import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post, patch } from './client';

export interface Rule {
  id: string;
  title: string;
  domain: string;
  severity: 'critical' | 'warning' | 'info';
  scope: string;
  condition: string;
  action: string;
  source: string;
  created: string;
  updated?: string;
  enabled: boolean;
}

export interface DomainSummary {
  domain: string;
  total: number;
  enabled: number;
  critical: number;
}

export interface Correction {
  id: number;
  rule_id: string | null;
  domain: string;
  action_taken: string;
  correction: string;
  context: string | null;
  persona: string | null;
  job: string | null;
  created_at: string;
}

export interface RuleSuggestion {
  id: number;
  title: string;
  domain: string;
  condition_text: string;
  action_text: string;
  confidence: number;
  status: string;
  created_at: string;
}

export function useRules(domain?: string) {
  return useQuery({
    queryKey: ['rules', domain],
    queryFn: () => get<{ rules: Rule[]; summary: DomainSummary[] }>('/rules', { domain }),
    refetchInterval: 30_000,
  });
}

export function useCorrections(domain?: string) {
  return useQuery({
    queryKey: ['corrections', domain],
    queryFn: () => get<{ corrections: Correction[]; stats: { domain: string; count: number }[] }>(
      '/corrections', { domain }
    ),
    refetchInterval: 30_000,
  });
}

export function useRuleSuggestions(status = 'pending') {
  return useQuery({
    queryKey: ['rule-suggestions', status],
    queryFn: () => get<RuleSuggestion[]>('/rules/suggestions', { status }),
    refetchInterval: 30_000,
  });
}

export function useToggleRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      patch(`/rules/${id}/toggle`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rules'] }),
  });
}

export function useAddCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (correction: Omit<Correction, 'id' | 'created_at'>) =>
      post('/corrections', correction),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['corrections'] }),
  });
}

export function useGenerateSuggestions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/rules/suggestions/generate'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule-suggestions'] }),
  });
}

export function useUpdateSuggestionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      patch(`/rules/suggestions/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rule-suggestions'] }),
  });
}
