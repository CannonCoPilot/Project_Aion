import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from './client';

export interface ReviewDecision {
  timestamp: string;
  task_id: string;
  task_title: string;
  action: string;
  confidence: 'high' | 'medium' | 'low';
  risk: 'safe' | 'moderate' | 'destructive';
  pattern_matched: string | null;
  pattern_source: string | null;
  reasoning: string;
  question?: string | null;
  reversible: boolean;
  stage?: string;
  labels_added: string[];
  labels_removed: string[];
  value?: string;
  effort?: string;
  recommendation?: string;
  feedback: 'agreed' | 'wrong' | 'adjust' | null;
  feedback_comment: string | null;
  feedback_timestamp: string | null;
}

export interface ReviewStats {
  total: number;
  executed: number;
  proposed: number;
  escalated: number;
  closed: number;
  pending_review: number;
  agreed: number;
  wrong: number;
  adjusted: number;
}

export interface TaskCostSummary {
  cost_usd_total: number;
  runs_count: number;
  models: string[];
  total_duration_s: number;
  last_run_ts: string | null;
}

export function useReviews(days = 7) {
  return useQuery({
    queryKey: ['reviews', days],
    queryFn: () =>
      get<{
        reviews: ReviewDecision[];
        stats: ReviewStats;
        blockingCounts?: Record<string, number>;
        taskCreatedDates?: Record<string, string>;
        costByTask?: Record<string, TaskCostSummary>;
      }>('/reviews', { days: String(days) }),
    refetchInterval: 30_000,
  });
}

export function useSubmitBulkFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      items: Array<{
        task_id: string;
        task_title: string;
        decision_timestamp: string;
        action: string;
        feedback: 'agreed' | 'wrong' | 'adjust';
        comment: string;
      }>;
    }) =>
      post<{ processed: number; failed: number; errors: string[] }>(
        '/reviews/feedback/bulk',
        params,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      task_id: string;
      task_title: string;
      decision_timestamp: string;
      action: string;
      feedback: 'agreed' | 'wrong' | 'adjust';
      comment: string;
    }) => post('/reviews/feedback', params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
}
