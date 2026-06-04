// Persona cluster classification — Phase 1.2 frontend.
//
// Source-of-truth fallback for cluster assignment until pulse.persona_metadata.cluster
// is backfilled (Phase 1.4 or via separate seed migration). Per v5 design §1.1:
// clusters apply ONLY to Tier C + D (Group 2 — Free-for-use). Tier A + B (Group 1 —
// Internal Reserved) are NOT clustered — they appear under "Internal Reserved" in the
// sidebar grouping.
//
// Cluster axis: Engineering / Quality / Research / Creative / Planner.
// Counts: Engineering 6, Quality 6, Research 5, Creative 5, Planner 3 = 25 Tier D.
//
// Color palette aligned with v5 design system (audit-grounded; netclaw category-map
// pattern). Used for 4px left border on persona cards + Tier D cluster sub-group
// headers + Matrix column grouping (Phase 1.2 Task #4).

export type ClusterId = 'engineering' | 'quality' | 'research' | 'creative' | 'planner';

export interface ClusterMeta {
  id: ClusterId;
  label: string;
  // Tailwind classes. Border for cards, bg for header chip, text for emphasis.
  border: string;
  bgChip: string;
  text: string;
  // Solid hex for Canvas/d3 renders (Graph view Phase 1.2 Task #4).
  hex: string;
}

export const CLUSTERS: Record<ClusterId, ClusterMeta> = {
  engineering: {
    id: 'engineering',
    label: 'Engineering',
    border: 'border-l-sky-500',
    bgChip: 'bg-sky-500/15',
    text: 'text-sky-300',
    hex: '#0ea5e9',
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    border: 'border-l-amber-500',
    bgChip: 'bg-amber-500/15',
    text: 'text-amber-300',
    hex: '#f59e0b',
  },
  research: {
    id: 'research',
    label: 'Research',
    border: 'border-l-teal-500',
    bgChip: 'bg-teal-500/15',
    text: 'text-teal-300',
    hex: '#14b8a6',
  },
  creative: {
    id: 'creative',
    label: 'Creative',
    border: 'border-l-emerald-500',
    bgChip: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    hex: '#10b981',
  },
  planner: {
    id: 'planner',
    label: 'Planner',
    border: 'border-l-violet-500',
    bgChip: 'bg-violet-500/15',
    text: 'text-violet-300',
    hex: '#8b5cf6',
  },
};

// Tier D persona → cluster. Assignment heuristic; serves as DB seed candidate
// (a future migration can UPSERT cluster column from this map and then this
// constant can be dropped or kept as a UI fallback).
export const TIER_D_CLUSTER: Record<string, ClusterId> = {
  // Engineering (6)
  'backend-eng': 'engineering',
  'db-eng': 'engineering',
  'ux-eng': 'engineering',
  'infrastructure-deployer': 'engineering',
  'content-writer': 'engineering',
  'project-manager': 'engineering',

  // Quality (6)
  'ai-reviewer': 'quality',
  'security-reviewer': 'quality',
  'bug-fixer': 'quality',
  'test-researcher': 'quality',
  'test-reviewer': 'quality',
  'test-writer': 'quality',

  // Research (5)
  researcher: 'research',
  'researcher-readonly': 'research',
  analyst: 'research',
  investigator: 'research',
  troubleshooter: 'research',

  // Creative (5)
  'aurora-feedback': 'creative',
  'creative-action': 'creative',
  'creative-builder': 'creative',
  'creative-presenter': 'creative',
  'creative-thinker': 'creative',

  // Planner (3)
  orchestrator: 'planner',
  'task-evaluator': 'planner',
  'skill-experimenter': 'planner',
};

// Resolves cluster for a persona — prefer DB value when populated, fall back to map.
// DB values may be case-mixed ("Quality" vs "quality"); normalize before lookup.
export function resolveCluster(name: string, dbCluster: string | null): ClusterId | null {
  if (dbCluster) {
    const normalized = dbCluster.toLowerCase();
    if (normalized in CLUSTERS) return normalized as ClusterId;
  }
  return TIER_D_CLUSTER[name] ?? null;
}
