// Phase 1.2 personas API client — v5 schema (Phase 1.1 endpoints proxied via /api/v1).
//
// Replaces the legacy schema-v1 client. Old schema:
//   PersonaSummary { tier:'research|builder|...', maxBudget, maxTurns, ... }
//   PUT /personas/:name/prompt { prompt }
// New schema:
//   PersonaSummary { tier:'A|B|C|D', cluster, status, job_binding_count, ... }
//   PUT /api/v1/personas/:name/prompt { prompt_content, version_label, notes, created_by }
//
// Endpoints live in pulse (FastAPI) and are forwarded by dashboard server's
// pulse-v1-proxy.ts route. The frontend never talks to pulse directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, put } from './client';

export type PersonaTier = 'A' | 'B' | 'C' | 'D';
export type PersonaStatus = 'active' | 'soft-deleted' | 'unlocked' | 'unknown';

// Substrate row from pulse.persona_metadata — fields are the column projection.
// Note: `tags` and `legacy_limits` arrive as JSON-stringified strings (asyncpg
// JSONB default). Parse in components when needed.
export interface PersonaSummary {
  name: string;
  tier: PersonaTier;
  cluster: string | null;
  status: PersonaStatus | string;
  owner: string;
  tags: string; // JSON-stringified array
  schema_version: number;
  legacy_limits: string | null; // JSON-stringified object
  unlocked_until: string | null;
  soft_deleted_at: string | null;
  created_at: string;
  updated_at: string;
  job_binding_count: number;
}

export interface PersonasResponse {
  personas: PersonaSummary[];
  count: number;
}

export interface PersonaPermission {
  tool_id: string;
  family: 'Built-in' | 'MCP' | 'Command' | 'Skill' | string;
  source_workspace: string | null;
  state: 'allowed' | 'denied' | 'admin-only' | string;
}

export interface PersonaActivePrompt {
  id: number;
  version_label: string | null;
  prompt_content: string;
  active: boolean;
  created_at: string;
  created_by: string;
  notes: string | null;
}

export interface PersonaLastActivity {
  event_type: string;
  outcome: string | null;
  occurred_at: string;
  tokens_total: number | null;
}

// Filesystem-resident state — Phase 1.2 detail endpoint enrichment.
// Pulse loads these via _load_yaml_file(); arbitrary keys preserved (config.yaml
// and methodology.yaml are loosely schematized).
export interface PersonaConfig {
  persona?: string;
  engine?: { default: string; model: string; fallback: string | null };
  output?: { format?: string; save_to?: string };
  session?: { persist?: boolean };
  env_files?: string[];
  schema_version?: number;
  [key: string]: unknown;
}

export interface PersonaMethodology {
  identity?: string;
  perspective?: string;
  voice?: string;
  decision_heuristics?: unknown;
  context_scope?: string;
  quality_scaling?: string;
  success_criteria?: unknown;
  common_failure_modes?: unknown;
  process?: unknown;
  [key: string]: unknown;
}

export interface PersonaDetail {
  metadata: PersonaSummary;
  config: PersonaConfig;
  methodology: PersonaMethodology;
  active_prompt: PersonaActivePrompt | null;
  permissions: PersonaPermission[];
  last_activity: PersonaLastActivity | null;
}

// ---- Queries ----

export function usePersonas() {
  return useQuery({
    queryKey: ['personas', 'v1'],
    queryFn: () => get<PersonasResponse>('/v1/personas').then(r => r.personas),
    staleTime: 30_000, // metadata changes are slow; revalidate aggressively only on mutations
  });
}

export function usePersonaDetail(name: string | null) {
  return useQuery({
    queryKey: ['persona', 'v1', name],
    queryFn: () => get<PersonaDetail>(`/v1/personas/${name}`),
    enabled: !!name,
    staleTime: 15_000,
  });
}

// ---- Mutations (Tier-gated; substrate enforces — UI hides for read-only tiers) ----

export interface UpdatePromptInput {
  name: string;
  prompt_content: string;
  version_label?: string;
  notes?: string;
  created_by?: string;
}

export function useUpdatePersonaPrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...body }: UpdatePromptInput) =>
      put<{ persona: string; version_id: number; fs_synced: boolean }>(
        `/v1/personas/${name}/prompt`,
        body,
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['persona', 'v1', vars.name] });
      qc.invalidateQueries({ queryKey: ['personas', 'v1'] });
    },
  });
}

export interface UpdateMetadataInput {
  name: string;
  cluster?: string | null;
  tags?: string[];
  status?: string;
}

export function useUpdatePersonaMetadata() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...body }: UpdateMetadataInput) =>
      put<{ persona: string; updated: string[] }>(`/v1/personas/${name}/metadata`, body),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['persona', 'v1', vars.name] });
      qc.invalidateQueries({ queryKey: ['personas', 'v1'] });
    },
  });
}

// ---- Tool catalog (Matrix + Graph views — Task #4) ----

export interface ToolCatalogEntry {
  tool_id: string;
  name: string;
  family: 'Built-in' | 'MCP' | 'Command' | 'Skill' | string;
  source_workspace: string | null;
  source_path: string | null;
  domain: string | null;
  description: string | null;
  ingested_at: string;
  last_seen: string;
}

export interface ToolCatalogResponse {
  tools: ToolCatalogEntry[];
  count: number;
}

export function useToolCatalog(family?: string) {
  return useQuery({
    queryKey: ['tool-catalog', family ?? 'all'],
    queryFn: () =>
      get<ToolCatalogResponse>(family ? `/v1/tool-catalog?family=${encodeURIComponent(family)}` : '/v1/tool-catalog'),
    staleTime: 5 * 60_000,
  });
}

// Persona × Tool matrix — Matrix view (§4.3)
export interface PersonaToolMatrixResponse {
  personas: Array<{ name: string; tier: PersonaTier; cluster: string | null }>;
  tools: ToolCatalogEntry[];
  matrix: Record<string, Record<string, string>>; // matrix[persona_name][tool_id] = state
  unassigned_tools: string[]; // tool_ids with no persona assignment
}

export function usePersonaToolMatrix() {
  return useQuery({
    queryKey: ['persona-tool-matrix'],
    queryFn: () => get<PersonaToolMatrixResponse>('/v1/persona-tool-matrix'),
    staleTime: 30_000,
  });
}

// Persona graph — Graph view (§4.4)
export type GraphNodeType = 'persona' | 'tool' | 'job' | 'domain';
export interface PersonaGraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  tier?: PersonaTier;
  cluster?: string;
  family?: string;
  status?: string;
}
export interface PersonaGraphEdge {
  source: string;
  target: string;
  kind: 'allowed' | 'denied' | 'binding' | 'mentions' | string;
}
export interface PersonaGraphResponse {
  nodes: PersonaGraphNode[];
  edges: PersonaGraphEdge[];
}

export function usePersonaGraph() {
  return useQuery({
    queryKey: ['persona-graph'],
    queryFn: () => get<PersonaGraphResponse>('/v1/persona-graph'),
    staleTime: 30_000,
  });
}

// Persona heatmap — Heatmap view (§5.5)
//
// Backend source field:
//   'activity_snapshots'         — primary (token-rich)
//   'decision_events_fallback'   — used when snapshots table is empty (today's dev state)
export interface HeatmapCell {
  dow: number; // 0=Sun..6=Sat
  hour: number; // 0..23
  count: number;
}
export interface HeatmapTrendRow {
  persona: string;
  bucket: string; // ISO timestamp at hour resolution
  tokens_in: number;
  tokens_out: number;
  event_count: number;
}
export interface HeatmapRankRow {
  persona: string;
  event_count: number;
  tokens_total: number;
}
export interface SankeyFlow {
  actor: string;
  decision_type: string;
  outcome: string;
  count: number;
}
export interface PersonaHeatmapResponse {
  source: 'activity_snapshots' | 'decision_events_fallback';
  window_days: number;
  heatmap: HeatmapCell[];
  trends: HeatmapTrendRow[];
  rank: HeatmapRankRow[];
  sankey: SankeyFlow[];
}

export function usePersonaHeatmap(windowDays: number = 7) {
  return useQuery({
    queryKey: ['persona-heatmap', windowDays],
    queryFn: () => get<PersonaHeatmapResponse>(`/v1/persona-heatmap?window_days=${windowDays}`),
    staleTime: 60_000,
  });
}

// Timeline — Add-on §5.3 (Canvas Gantt event stream)
//
// Backend source field (same provenance pattern as Heatmap):
//   'activity_snapshots'         — primary (token-rich)
//   'decision_events_fallback'   — used when snapshots table is empty
export type TimelineWindow = '1h' | '6h' | '24h' | '7d';

export interface TimelineEvent {
  persona: string;     // actor — e.g. 'system:executor', 'persona:reviewer'
  type: string;        // event_type / decision_type
  outcome: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  thread_id: string | null;
  fired_at: string;    // ISO timestamp
}

export interface PersonaTimelineResponse {
  source: 'activity_snapshots' | 'decision_events_fallback';
  window: TimelineWindow;
  events: TimelineEvent[];
}

export function usePersonaTimeline(window: TimelineWindow = '1h') {
  return useQuery({
    queryKey: ['persona-timeline', window],
    queryFn: () => get<PersonaTimelineResponse>(`/v1/persona-timeline?window=${window}`),
    staleTime: 30_000,
  });
}

// Flow — Add-on §5.1 (ReactFlow swim-lane)
export interface FlowStage {
  id: string;
  label: string;
  personas: string[];
}
export interface PersonaFlowResponse {
  pipeline_v2: FlowStage[];
  creative_pipeline: FlowStage[];
  team_pipeline: FlowStage[];
}

export function usePersonaFlow() {
  return useQuery({
    queryKey: ['persona-flow'],
    queryFn: () => get<PersonaFlowResponse>('/v1/persona-flow'),
    staleTime: 5 * 60_000,
  });
}

// Village — Add-on §5.2 (DOM tile grid + BFS)
export interface VillagePosition {
  persona_name: string;
  grid_x: number;
  grid_y: number;
  zone_assignment: string;
}
export interface PersonaVillageResponse {
  grid_width: number;
  grid_height: number;
  positions: VillagePosition[];
}

export function usePersonaVillage() {
  return useQuery({
    queryKey: ['persona-village'],
    queryFn: () => get<PersonaVillageResponse>('/v1/persona-village/layout'),
    staleTime: 5 * 60_000,
  });
}

interface PersonasRunningResponse {
  running: string[];
  count: number;
}

export function usePersonasRunning() {
  return useQuery({
    queryKey: ['personas-running'],
    queryFn: () => get<PersonasRunningResponse>('/v1/personas/running'),
    refetchInterval: 5_000,
  });
}

// Create persona — +New wizard (§4.5)
export interface CreatePersonaInput {
  name: string;
  tier?: 'D'; // Always Tier D from UI
  cluster?: string;
  description?: string;
  base_template?: string;
  engine?: { default: string; model: string; fallback: string | null };
  prompt_content?: string;
  methodology?: PersonaMethodology;
  allowed_tools?: string[];
  created_by?: string;
}

export function useCreatePersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePersonaInput) =>
      fetch('/api/v1/personas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, tier: 'D' }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(`Create failed: ${r.status} ${await r.text()}`);
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personas', 'v1'] });
      qc.invalidateQueries({ queryKey: ['persona-tool-matrix'] });
      qc.invalidateQueries({ queryKey: ['persona-graph'] });
    },
  });
}

// ---- Helpers ----

export function parseTags(tags: string | string[]): string[] {
  if (Array.isArray(tags)) return tags;
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface LegacyLimits {
  max_turns?: number;
  max_budget_usd?: number;
  timeout_minutes?: number;
}

export function parseLegacyLimits(raw: string | LegacyLimits | null): LegacyLimits | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Tier display metadata — affordance + label.
export const TIER_META: Record<PersonaTier, { label: string; icon: string; group: 'reserved' | 'free'; locked: boolean }> = {
  A: { label: 'Tier A — Pipeline-locked', icon: '🔒', group: 'reserved', locked: true },
  B: { label: 'Tier B — System-locked', icon: '🔒', group: 'reserved', locked: true },
  C: { label: 'Tier C — Job-bound', icon: '🔧', group: 'free', locked: false },
  D: { label: 'Tier D — General-purpose', icon: '✏', group: 'free', locked: false },
};
