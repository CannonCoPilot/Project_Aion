/**
 * pulse-events.ts — HTTP client for Pulse observability READ endpoints (P1.B1.1).
 *
 * Replaces direct PostgreSQL access (the previous boundary violation, identified
 * 2026-05-05). All reads now flow through Pulse's symmetric GET endpoints, mirroring
 * the existing POST receivers:
 *   GET /api/v1/audit/events             | POST /api/v1/audit/events     (P1.5)
 *   GET /api/v1/audit/decisions          | POST /api/v1/audit/decisions  (P1.5)
 *   GET /api/v1/costs/events             | POST /api/v1/costs/events     (P1.5)
 *   GET /api/v1/observability/storyline/{thread_id}
 *   GET /api/v1/observability/decisions/stats
 *   GET /api/v1/observability/threads
 *
 * Env (resolved via Pulse-canonical priority chain — see lib/pulse-env.sh):
 *   PULSE_API_URL    (preferred, full path with /api/v1)
 *   PULSE_API        (legacy alias)
 *   PULSE_URL        (base; /api/v1 appended)
 *   fallback         http://pulse:8700/api/v1   (Docker network default)
 */

// ─── URL resolution (mirrors lib/pulse-env.sh chain) ────────────────────────

function resolvePulseApiUrl(): string {
  const explicit = process.env.PULSE_API_URL || process.env.PULSE_API;
  if (explicit) return explicit.replace(/\/$/, '');
  const base = (process.env.PULSE_URL || 'http://pulse:8700').replace(/\/$/, '');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

const PULSE_API_URL = resolvePulseApiUrl();

// ─── Types (preserved from previous implementation) ─────────────────────────

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

export interface DecisionStats {
  total: number;
  by_actor: { actor: string; count: number }[];
  by_decision_type: { decision_type: string; count: number }[];
  by_outcome: { outcome: string; count: number }[];
  decisions_per_hour_24h: number;
  unique_threads: number;
}

// ─── HTTP plumbing ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10_000;

function buildQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  const usp = new URLSearchParams();
  for (const [k, v] of entries) usp.set(k, String(v));
  return `?${usp.toString()}`;
}

async function pulseGet<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = `${PULSE_API_URL}${path}${buildQuery(params)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) {
      throw new Error(`Pulse ${res.status} ${res.statusText} on GET ${path}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Public functions (signatures preserved for route compatibility) ────────

export async function listDecisions(filter: DecisionFilter = {}): Promise<DecisionEvent[]> {
  const data = await pulseGet<{ decisions: DecisionEvent[] }>('/audit/decisions', {
    actor: filter.actor,
    decision_type: filter.decision_type,
    outcome: filter.outcome,
    thread_id: filter.thread_id,
    task_id: filter.task_id,
    since: filter.since,
    until: filter.until,
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  });
  return data.decisions;
}

export async function getDecisionStats(sinceHours = 24): Promise<DecisionStats> {
  const data = await pulseGet<{
    total: number;
    by_actor: { actor: string; count: number }[];
    by_decision_type: { decision_type: string; count: number }[];
    by_outcome: { outcome: string; count: number }[];
    decisions_per_hour: number;
    unique_threads: number;
  }>('/observability/decisions/stats', { since_hours: sinceHours });
  return {
    total: data.total,
    by_actor: data.by_actor,
    by_decision_type: data.by_decision_type,
    by_outcome: data.by_outcome,
    decisions_per_hour_24h: data.decisions_per_hour,
    unique_threads: data.unique_threads,
  };
}

export async function getDecisionsByThread(thread_id: string): Promise<DecisionEvent[]> {
  return listDecisions({ thread_id, limit: 500 });
}

export async function getStoryline(thread_id: string): Promise<StorylineEvent[]> {
  const data = await pulseGet<{ events: StorylineEvent[] }>(
    `/observability/storyline/${encodeURIComponent(thread_id)}`,
  );
  return data.events;
}

export async function listRecentThreads(
  limit = 50,
): Promise<{ thread_id: string; first_ts: string; last_ts: string; decision_count: number }[]> {
  const data = await pulseGet<{
    threads: { thread_id: string; first_ts: string; last_ts: string; decision_count: number }[];
  }>('/observability/threads', { limit });
  return data.threads;
}

// Cost-by-task aggregation for Reviewer Dash cost column (v1.3 §6.1 #3).
// Fetches recent cost events from Pulse, aggregates by task_id. Cheap to compute
// at request time given the table's modest size (one event per executor run).
export interface TaskCostSummary {
  cost_usd_total: number;
  runs_count: number;
  models: string[];
  total_duration_s: number;
  last_run_ts: string | null;
}

export async function getCostByTask(sinceHours = 168): Promise<Record<string, TaskCostSummary>> {
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const data = await pulseGet<{ events: CostEvent[] }>('/costs/events', {
    since,
    limit: 5000,
  });
  const out: Record<string, TaskCostSummary> = {};
  for (const e of data.events) {
    if (!e.task_id) continue;
    const acc = out[e.task_id] ?? {
      cost_usd_total: 0,
      runs_count: 0,
      models: [],
      total_duration_s: 0,
      last_run_ts: null,
    };
    acc.cost_usd_total += e.cost_usd ?? 0;
    acc.runs_count += 1;
    if (e.model && !acc.models.includes(e.model)) acc.models.push(e.model);
    acc.total_duration_s += e.duration_s ?? 0;
    if (!acc.last_run_ts || (e.ts && e.ts > acc.last_run_ts)) acc.last_run_ts = e.ts;
    out[e.task_id] = acc;
  }
  return out;
}
