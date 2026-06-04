/**
 * @deprecated Superseded by api/reo.ts (Pulse READ API consumer). DecisionsPage
 * (the only consumer of this module) is itself deprecated as of 2026-05-11 per
 * re-cleave plan §5.2 M2. Kept in tree for one release cycle as fallback;
 * scheduled for deletion alongside DecisionsPage at REO Phase 5.5 PRE-SHIP AUDIT.
 *
 * ReoPage.tsx imports from api/reo.ts exclusively. Do not import from this file.
 *
 * Note: the endpoints this hook hits (dashboard/server/routes/decisions.ts) were
 * symmetric to P1.B1's direct PostgreSQL access; the symmetric Pulse READ
 * endpoints landed at P1.B1.1 (commit 66885bb) and api/reo.ts uses those.
 */
import { useQuery } from '@tanstack/react-query';
import { get } from './client';

// ─── Types (mirror server/services/pulse-events.ts) ─────────────────────────

export interface DecisionEvent {
  id: number;
  ts: string;
  thread_id: string;
  parent_id: string | null;
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

export interface AuditLogEntry {
  id: number;
  ts: string;
  thread_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  task_id: string | null;
  project_id: string | null;
  session_id: string | null;
  severity: string | null;
  details: unknown;
  source_file: string | null;
}

export interface CostEvent {
  id: number;
  ts: string;
  thread_id: string | null;
  task_id: string | null;
  session_id: string | null;
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
  router_model: string | null;
  router_overridden: boolean | null;
  company: string | null;
  project_id: string | null;
}

export type StorylineEvent =
  | ({ kind: 'audit' } & AuditLogEntry)
  | ({ kind: 'cost' } & CostEvent)
  | ({ kind: 'decision' } & DecisionEvent);

export interface DecisionStats {
  total: number;
  by_actor: { actor: string; count: number }[];
  by_decision_type: { decision_type: string; count: number }[];
  by_outcome: { outcome: string; count: number }[];
  decisions_per_hour_24h: number;
  unique_threads: number;
}

export interface ThreadSummary {
  thread_id: string;
  first_ts: string;
  last_ts: string;
  decision_count: number;
}

export interface DecisionFilter {
  actor?: string;
  decision_type?: string;
  outcome?: string;
  thread_id?: string;
  task_id?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useDecisions(filter: DecisionFilter = {}) {
  const params: Record<string, string | undefined> = {};
  if (filter.actor) params.actor = filter.actor;
  if (filter.decision_type) params.decision_type = filter.decision_type;
  if (filter.outcome) params.outcome = filter.outcome;
  if (filter.thread_id) params.thread_id = filter.thread_id;
  if (filter.task_id) params.task_id = filter.task_id;
  if (filter.since) params.since = filter.since;
  if (filter.until) params.until = filter.until;
  if (filter.limit !== undefined) params.limit = String(filter.limit);
  if (filter.offset !== undefined) params.offset = String(filter.offset);

  return useQuery({
    queryKey: ['decisions', filter],
    queryFn: () => get<{ decisions: DecisionEvent[] }>('/decisions', params),
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useDecisionStats(hours = 24) {
  return useQuery({
    queryKey: ['decision-stats', hours],
    queryFn: () => get<DecisionStats>('/decisions/stats', { hours: String(hours) }),
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useRecentThreads(limit = 50) {
  return useQuery({
    queryKey: ['decision-threads', limit],
    queryFn: () => get<{ threads: ThreadSummary[] }>('/decisions/threads', { limit: String(limit) }),
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useStoryline(thread_id: string | undefined) {
  return useQuery({
    queryKey: ['storyline', thread_id],
    queryFn: () => get<{ events: StorylineEvent[] }>(`/storyline/${encodeURIComponent(thread_id!)}`),
    enabled: !!thread_id,
    refetchInterval: 15_000,
    retry: 1,
  });
}
