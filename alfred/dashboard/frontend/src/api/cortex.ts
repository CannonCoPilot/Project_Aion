import { useQuery } from '@tanstack/react-query';
import { get } from './client';

// --- Staleness ---

export type StalenessTier = 'fresh' | 'aging' | 'stale' | 'critical';

export interface StalenessFile {
  path: string;
  category: string;
  lastModified: string;
  stalenessTier: StalenessTier;
  ageInDays: number;
}

export interface StalenessResponse {
  files: StalenessFile[];
  summary: {
    total: number;
    fresh: number;
    aging: number;
    stale: number;
    critical: number;
  };
}

export function useStaleness() {
  return useQuery({
    queryKey: ['cortex', 'staleness'],
    queryFn: () => get<StalenessResponse>('/cortex/staleness'),
    refetchInterval: 60_000,
  });
}

// --- Training Stats ---

export interface TrainingStatsResponse {
  totalCaptures: number;
  capturesPerDay: Array<{ date: string; count: number }>;
  byPersona: Record<string, number>;
  byModel: Record<string, number>;
  byRecordType: Record<string, number>;
  dataHealth: {
    personaDataPopulated: number;
    humanFeedbackPopulated: number;
    taskIdsPopulated: number;
    totalRecords: number;
  };
  days: number;
}

export function useTrainingStats(days = 30) {
  return useQuery({
    queryKey: ['cortex', 'training-stats', days],
    queryFn: () =>
      get<TrainingStatsResponse>('/cortex/training-stats', {
        days: String(days),
      }),
    refetchInterval: 60_000,
  });
}

// --- Velocity ---

export interface VelocityResponse {
  contextRefreshes: {
    last7d: number;
    last14d: number;
    last30d: number;
  };
  trainingCaptures: {
    thisWeek: number;
    lastWeek: number;
    trend: number;
  };
  patternsLastModified: string | null;
}

export function useVelocity() {
  return useQuery({
    queryKey: ['cortex', 'velocity'],
    queryFn: () => get<VelocityResponse>('/cortex/velocity'),
    refetchInterval: 60_000,
  });
}

// --- Recommendations (Phase 3) ---

export interface Recommendation {
  id: string;
  timestamp: string;
  category: string;
  priority: number;
  target: string;
  title: string;
  rationale: string;
  suggested_action: string;
  status: string;
  run_id?: string;
}

export function useRecommendations() {
  return useQuery({
    queryKey: ['cortex', 'recommendations'],
    queryFn: () => get<Recommendation[]>('/cortex/recommendations'),
    refetchInterval: 60_000,
  });
}

export type RecommendationAction = 'acknowledge' | 'dismiss' | 'convert' | 'resolve';

export interface ActionResult {
  status: string;
  id?: string;
  task_id?: string;
  task_title?: string;
}

export function useRecommendationHistory() {
  return useQuery({
    queryKey: ['cortex', 'recommendations', 'history'],
    queryFn: () => get<Recommendation[]>('/cortex/recommendations', { include_history: 'true' }),
    refetchInterval: 60_000,
  });
}

export async function triggerCortexRun(): Promise<{ status: string }> {
  const res = await fetch('/api/recurring-jobs/nexus/cortex-advisor/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postRecommendationAction(
  id: string,
  action: RecommendationAction,
  note?: string,
): Promise<ActionResult> {
  const res = await fetch(`/api/cortex/recommendations/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, note }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
