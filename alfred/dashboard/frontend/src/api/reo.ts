import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface TimelineEvent {
  id: number;
  ts: string;
  thread_id: string;
  task_id: string | null;
  actor: string;
  decision_type: string;
  outcome: string;
  confidence: number | null;
  rationale: string | null;
  nearest_cost_usd: number | null;
  nearest_cost_persona: string | null;
}

export interface PersonaAggregate {
  actor: string;
  decision_count: number;
  total_cost_usd: number;
  avg_duration_s: number | null;
  thread_count: number;
}

export interface TimelineFilters {
  actor: string[] | null;
  decision_type: string[] | null;
  outcome: string[] | null;
  task_id: string | null;
  thread_id: string | null;
  q: string | null;
}

interface TimelineResponse {
  events: TimelineEvent[];
  count: number;
  since_hours: number;
  filters: TimelineFilters;
  persona: string | null;
}

interface AggregatesResponse {
  aggregates: PersonaAggregate[];
  count: number;
  since_hours: number;
}

export interface ReoTimelineOpts {
  sinceHours?: number;
  actor?: string[];
  decisionType?: string[];
  outcome?: string[];
  taskId?: string;
  threadId?: string;
  q?: string;
  limit?: number;
}

export function useReoTimeline(opts: ReoTimelineOpts) {
  const {
    sinceHours = 24,
    actor,
    decisionType,
    outcome,
    taskId,
    threadId,
    q,
    limit = 200,
  } = opts;

  const params: Record<string, string | undefined> = {
    since_hours: String(sinceHours),
    limit: String(limit),
  };
  if (actor && actor.length > 0) params.actor = actor.join(',');
  if (decisionType && decisionType.length > 0) params.decision_type = decisionType.join(',');
  if (outcome && outcome.length > 0) params.outcome = outcome.join(',');
  if (taskId) params.task_id = taskId;
  if (threadId) params.thread_id = threadId;
  if (q) params.q = q;

  return useQuery<TimelineResponse>({
    queryKey: [
      'reo',
      'timeline',
      sinceHours,
      (actor ?? []).join(',') || '',
      (decisionType ?? []).join(',') || '',
      (outcome ?? []).join(',') || '',
      taskId ?? '',
      threadId ?? '',
      q ?? '',
      limit,
    ],
    queryFn: () => get<TimelineResponse>('/reo/timeline', params),
    refetchInterval: 30_000,
  });
}

export function usePersonaAggregates(opts: { sinceHours?: number } = {}) {
  const sinceHours = opts.sinceHours ?? 24;
  return useQuery<AggregatesResponse>({
    queryKey: ['reo', 'persona-aggregates', sinceHours],
    queryFn: () =>
      get<AggregatesResponse>('/reo/persona-aggregates', {
        since_hours: String(sinceHours),
      }),
    refetchInterval: 30_000,
  });
}

export interface DecisionDetail {
  id: number;
  ts: string;
  thread_id: string;
  parent_id: number | null;
  task_id: string | null;
  actor: string;
  decision_type: string;
  outcome: string;
  alternatives: unknown;
  signals_matched: unknown;
  confidence: number | null;
  rationale: string | null;
  downstream_effect: unknown;
}

export interface CostRow {
  id: number;
  ts: string;
  job: string | null;
  persona: string | null;
  model: string | null;
  engine: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  cache_hit_ratio: number | null;
  duration_s: number | null;
  success: boolean | null;
}

export interface AuditRow {
  id: number;
  ts: string;
  thread_id: string;
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  task_id: string | null;
  project_id: string | null;
  session_id: string | null;
  severity: string | null;
  details: unknown;
  source_file: string | null;
}

export interface DecisionDetailResponse {
  decision: DecisionDetail;
  linked_costs: CostRow[];
  linked_audit: AuditRow[];
}

export function useReoDecision(eventId: number | null) {
  return useQuery<DecisionDetailResponse>({
    queryKey: ['reo', 'decision', eventId],
    queryFn: () => get<DecisionDetailResponse>(`/reo/decisions/${eventId}`),
    enabled: eventId != null,
    staleTime: 60_000,
  });
}
