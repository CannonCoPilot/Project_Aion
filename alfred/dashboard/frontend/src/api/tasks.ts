import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  issue_type?: string;
  labels: string[];
  assignee?: string;
  owner?: string;
  notes?: string;
  question?: string | null;
  external_ref?: string;
  spec_id?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  company_id?: string;
  objective_id?: string;
  metadata?: Record<string, unknown>;
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

export interface Stats {
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

export interface TaskFilters {
  status?: string;
  priority?: string;
  domain?: string;
  workspace?: string;
  project?: string;
  source?: string;
  assignee?: string;
  search?: string;
  sort?: string;
  order?: string;
  label?: string;
  excludeLabel?: string;
  ready?: string;
  blockedReason?: string;
  stage?: string;
  company?: string;
  updatedAfter?: string;
  updatedBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
  closedAfter?: string;
  staleDays?: string;
}

export function useTaskList(filters: TaskFilters) {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: () =>
      get<{ tasks: Task[]; total: number }>(
        '/tasks',
        filters as Record<string, string | undefined>,
      ).then((r) => r.tasks),
    refetchInterval: 15000,
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['task', id],
    queryFn: () => get<Task>(`/tasks/${id}`),
    enabled: !!id,
  });
}

export function useTaskEvents(id: string | undefined) {
  return useQuery({
    queryKey: ['task-events', id],
    queryFn: () => get<{ events: TaskEvent[] }>(`/tasks/${id}/events`).then((r) => r.events),
    enabled: !!id,
  });
}

export function useLastLabelEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['task-events', id],
    queryFn: () => get<{ events: TaskEvent[] }>(`/tasks/${id}/events`).then((r) => r.events),
    enabled: !!id,
    staleTime: 30000,
    select: (events) =>
      events
        .filter((e) => e.event_type.includes('label'))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .at(-1) ?? null,
  });
}

export interface PipelineEvent extends TaskEvent {
  task_title: string;
  task_status: string;
  task_labels: string[];
}

export function usePipelineEvents(limit = 100) {
  return useQuery({
    queryKey: ['pipeline-events', limit],
    queryFn: () =>
      get<{ events: PipelineEvent[] }>(`/pipeline/events?limit=${limit}`).then((r) => r.events),
    refetchInterval: 15000,
  });
}

export function useStats(company?: string) {
  return useQuery({
    queryKey: ['stats', company],
    queryFn: () => get<Stats>('/stats', company ? { company } : {}),
    refetchInterval: 30000,
  });
}

export interface LiveLabelEntry {
  label: string;
  total: number;
  open: number;
  closed: number;
}

export interface LiveLabelCategory {
  prefix: string;
  name: string;
  description: string;
  function: string;
  group: string;
  labels: LiveLabelEntry[];
}

export interface LiveLabelGroupMeta {
  key: string;
  name: string;
  description: string;
}

export interface LiveLabelsResponse {
  categories: LiveLabelCategory[];
  groups: LiveLabelGroupMeta[];
  totalTasks: number;
  lastUpdated: string;
}

export function useLiveLabels() {
  return useQuery({
    queryKey: ['labels-live'],
    queryFn: () => get<LiveLabelsResponse>('/labels/live'),
    refetchInterval: 30000,
  });
}

export interface BlockedReasonEntry {
  reason: string;
  label: string;
  description: string;
  derivedFrom: string[];
  count: number;
  taskIds: string[];
}

export interface BlockedReasonsResponse {
  reasons: BlockedReasonEntry[];
  totalBlocked: number;
  totalOpen: number;
}

export interface ObsidianBacklink {
  title: string;
  path: string;
  snippet: string;
  obsidianUrl: string;
}

export function useObsidianBacklinks(id: string | undefined) {
  return useQuery({
    queryKey: ['obsidian-backlinks', id],
    queryFn: () =>
      get<{ backlinks: ObsidianBacklink[]; total: number }>(`/tasks/${id}/obsidian-backlinks`),
    enabled: !!id,
    staleTime: 60000, // vault doesn't change rapidly
  });
}

export function useBlockedReasons() {
  return useQuery({
    queryKey: ['blocked-reasons'],
    queryFn: () => get<BlockedReasonsResponse>('/labels/blocked-reasons'),
    refetchInterval: 30000,
  });
}

export interface DailyThroughput {
  date: string;
  created: number;
  closed: number;
}

export function useThroughput(days = 30) {
  return useQuery({
    queryKey: ['throughput', days],
    queryFn: () =>
      get<{ daily: DailyThroughput[] }>(`/stats/throughput?days=${days}`).then((r) => r.daily),
    refetchInterval: 60000,
  });
}

// --- Pipeline Active State (board-level glow) ---

export interface PipelineActiveResponse {
  staging: string[];
  evaluating: string[];
  orchestrating?: string[];
  executing: string[];
  reviewing: string[];
}

export function usePipelineActive() {
  return useQuery({
    queryKey: ['pipeline-active'],
    queryFn: () => get<PipelineActiveResponse>('/pipeline/active'),
    refetchInterval: 5000,
  });
}

// --- Live Task Detail (task detail pane metrics) ---

export interface TaskLiveDetail {
  task_id: string;
  status: 'active' | 'stale' | 'not_active';
  persona?: string;
  model?: string;
  session_id?: string;
  pid?: number;
  pid_alive?: boolean;
  start_time?: string;
  elapsed_seconds?: number;
  log_bytes?: number;
  log_lines?: number;
  activity_tail?: string[];
  prompt_preview?: string;
  log_file?: string;
  metadata?: Record<string, unknown>;
}

export function useTaskLiveDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['task-live', id],
    queryFn: () => get<TaskLiveDetail>(`/tasks/${id}/live`),
    enabled: !!id,
    refetchInterval: 5000,
  });
}
