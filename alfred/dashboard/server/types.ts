export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'closed' | 'deferred';
  priority: number; // 0=CRITICAL, 1=HIGH, 2=MEDIUM, 3=LOW, 4=Backlog
  issue_type: string;
  assignee?: string;
  owner?: string;
  estimated_minutes?: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  labels: string[];
  external_ref?: string;
  spec_id?: string;
  project_id?: string;
  phase_id?: string;
  yaml_task_id?: string;
  company_id?: string;
  objective_id?: string;
  notes?: string;
  question?: string | null;
  metadata?: Record<string, unknown>;
  workspace?: string;
}

export interface TaskEvent {
  id: number;
  issue_id: string;
  event_type: string;
  actor: string;
  old_value?: string;
  new_value?: string;
  comment?: string;
  created_at: string;
}

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<number, number>;
  byDomain: Record<string, number>;
  byProject: Record<string, number>;
  bySource: Record<string, number>;
  byAssignee: Record<string, number>;
  noProject: number;
  ready: number;
  needsInput: number;
  waitingDavid: number;
  waitingNexus: number;
  researchQueue: number;
  researchActionRequired: number;
  researchFyi: number;
  parked: number;
  inProgress: number;
  blocked: number;
  byBoard: Record<string, number>;
  byStage: Record<string, number>;
  archived: number;
  archiveStats?: {
    byDomain: Record<string, number>;
    byProject: Record<string, number>;
    byWeek: Record<string, number>;
    total: number;
  };
}

// ── Token Compression ────────────────────────────────────────────────────────

/** A single entry in the token-compression JSONL metrics file. */
export interface TokenCompressionEvent {
  timestamp: string;
  session_id?: string;
  phase?: string;
  technique?: string;
  input_tokens: number;
  output_tokens: number;
  compressed_tokens: number;
  savings: number;
  compression_ratio: number;
}

/** Aggregate statistics across all compression events. */
export interface TokenCompressionStats {
  totalEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCompressedTokens: number;
  totalSavings: number;
  averageCompressionRatio: number;
  byTechnique: Record<string, { events: number; savings: number; avgRatio: number }>;
}

/** Per-phase breakdown of token-compression metrics. */
export interface TokenCompressionPhaseMetrics {
  phase: string;
  events: number;
  totalInputTokens: number;
  totalCompressedTokens: number;
  totalSavings: number;
  averageCompressionRatio: number;
}

// ─────────────────────────────────────────────────────────────────────────────

export const PRIORITY_MAP: Record<number, { name: string; symbol: string; color: string }> = {
  0: { name: 'CRITICAL', symbol: '[X]', color: 'red' },
  1: { name: 'HIGH', symbol: '[!]', color: 'orange' },
  2: { name: 'MEDIUM', symbol: '[~]', color: 'yellow' },
  3: { name: 'LOW', symbol: '[-]', color: 'blue' },
  4: { name: 'Backlog', symbol: '', color: 'gray' },
};
