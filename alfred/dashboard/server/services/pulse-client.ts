/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Pulse HTTP client.
 *
 * All task data comes from the Pulse API (http://pulse:8700/api/v1).
 */

import type { Task } from '../types.js';

const PULSE_URL = process.env.PULSE_API_URL || 'http://pulse:8700/api/v1';
const PULSE_SERVICE_TOKEN = process.env.PULSE_DASHBOARD_TOKEN || '';

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (PULSE_SERVICE_TOKEN) {
    headers['X-Service-Token'] = PULSE_SERVICE_TOKEN;
  }
  return headers;
}

// --- HTTP helpers ---

async function pulseGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${PULSE_URL}${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pulse GET ${path}: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

async function pulsePost<T = any>(path: string, data?: any): Promise<T> {
  const res = await fetch(`${PULSE_URL}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pulse POST ${path}: ${res.status} ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function pulsePatch<T = any>(path: string, data: any): Promise<T> {
  const res = await fetch(`${PULSE_URL}${path}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pulse PATCH ${path}: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

async function pulseDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(`${PULSE_URL}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pulse DELETE ${path}: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

async function pulsePut<T = any>(path: string, data: any): Promise<T> {
  const res = await fetch(`${PULSE_URL}${path}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pulse PUT ${path}: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

// --- Response mapping ---

/** Extract a question from task notes/description for display on dashboard */
function extractQuestion(text: string): string | null {
  // Match **Question**: or Question: (markdown bold or plain)
  const questionMatch = text.match(/\*{0,2}Question\*{0,2}:\s*(.+)/i);
  if (questionMatch) return questionMatch[1].trim();
  // Fallback: "What's needed:"
  const neededMatch = text.match(/\*{0,2}What's needed\*{0,2}:\s*(.+)/i);
  if (neededMatch) return neededMatch[1].trim();
  // Fallback: extract from Recommendation that contains a question mark
  const recoMatch = text.match(/\*{0,2}Recommendation\*{0,2}:\s*(.*\?)/i);
  if (recoMatch) return recoMatch[1].trim();
  return null;
}

/** Map Pulse API task response to dashboard Task type */
function mapTask(raw: any): Task {
  const labels = raw.labels ?? [];
  const needsQuestion =
    labels.includes('waiting:david') ||
    labels.includes('needs-input') ||
    labels.includes('pipeline:needs-approval') ||
    labels.includes('review:escalated');
  const text = (raw.description ?? '') + '\n' + (raw.notes ?? '');
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description ?? '',
    notes: raw.notes ?? '',
    question: needsQuestion ? extractQuestion(text) : null,
    status: raw.status,
    priority: raw.priority,
    issue_type: raw.issue_type,
    assignee: raw.assignee ?? '',
    owner: raw.owner ?? '',
    external_ref: raw.external_ref ?? '',
    spec_id: raw.spec_id ?? '',
    metadata: raw.metadata ?? {},
    close_reason: raw.close_reason ?? '',
    created_by: raw.created_by,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    closed_at: raw.closed_at ?? '',
    labels,
    workspace: raw.workspace ?? raw.project ?? (process.env.DEFAULT_WORKSPACE || 'MyProject'),
  };
}

// ============================================================================
// Task reads — replaces jsonl-reader.ts
// ============================================================================

/** Fetch all tasks with pagination (replaces getTasks from jsonl-reader) */
export async function getTasks(): Promise<Task[]> {
  const all: Task[] = [];
  let offset = 0;
  const limit = 500;
  while (true) {
    const result = await pulseGet<{ tasks: any[]; total: number }>(
      `/tasks?limit=${limit}&offset=${offset}`,
    );
    all.push(...result.tasks.map(mapTask));
    if (all.length >= result.total || result.tasks.length < limit) break;
    offset += limit;
  }
  return all;
}

/** Fetch a single task by ID (replaces getTaskById from jsonl-reader) */
export async function getTaskById(id: string): Promise<Task | null> {
  try {
    const raw = await pulseGet(`/tasks/${encodeURIComponent(id)}`);
    return mapTask(raw);
  } catch (err) {
    if ((err as Error).message.includes('404')) return null;
    throw err;
  }
}

/** Fetch tasks with filters */
export async function getFilteredTasks(
  params: Record<string, string>,
): Promise<{ tasks: Task[]; total: number }> {
  const query = new URLSearchParams(params).toString();
  const result = await pulseGet<{ tasks: any[]; total: number }>(`/tasks?${query}`);
  return { tasks: result.tasks.map(mapTask), total: result.total };
}

/** Get ready tasks */
export async function getReadyTasks(limit = 10): Promise<Task[]> {
  const raw = await pulseGet<any[]>(`/tasks/ready?limit=${limit}`);
  return raw.map(mapTask);
}

/** Get task stats, optionally scoped to a workspace */
export async function getTaskStats(workspace?: string): Promise<any> {
  const path = workspace
    ? `/tasks/stats?workspace=${encodeURIComponent(workspace)}`
    : '/tasks/stats';
  return pulseGet(path);
}

// ============================================================================
// Task writes — replaces bd-cli.ts
// ============================================================================

/** Create a task (replaces createTask from bd-cli) */
export async function createTask(opts: {
  title: string;
  description?: string;
  priority?: number;
  labels?: string[];
  assignee?: string;
  workspace?: string;
}): Promise<any> {
  const priorityMap: Record<number, string> = { 1: 'high', 2: 'medium', 3: 'low', 4: 'backlog' };
  return pulsePost('/tasks', {
    title: opts.title,
    description: opts.description,
    priority: priorityMap[opts.priority ?? 3] ?? 'low',
    labels: opts.labels ?? [],
    assignee: opts.assignee,
    workspace: opts.workspace ?? (process.env.DEFAULT_WORKSPACE || 'MyProject'),
    actor: 'dashboard',
  });
}

/** Update a task (replaces updateTask from bd-cli) */
export async function updateTask(
  id: string,
  opts: {
    status?: string;
    priority?: number;
    assignee?: string;
    notes?: string;
    append_notes?: string;
    claim?: boolean;
  },
): Promise<any> {
  return pulsePatch(`/tasks/${encodeURIComponent(id)}`, {
    ...opts,
    actor: 'dashboard',
  });
}

/** Close a task (replaces closeTask from bd-cli) */
export async function closeTask(id: string, reason: string): Promise<any> {
  return pulsePost(`/tasks/${encodeURIComponent(id)}/close`, {
    reason,
    actor: 'dashboard',
  });
}

/** Add label (replaces addLabel from bd-cli) */
export async function addLabel(id: string, label: string): Promise<any> {
  return pulsePost(`/tasks/${encodeURIComponent(id)}/labels`, {
    labels: [label],
    actor: 'dashboard',
  });
}

/** Remove label (replaces removeLabel from bd-cli) */
export async function removeLabel(id: string, label: string): Promise<any> {
  return pulseDelete(
    `/tasks/${encodeURIComponent(id)}/labels/${encodeURIComponent(label)}?actor=dashboard`,
  );
}

/** Add comment (replaces addComment from bd-cli) */
export async function addComment(id: string, comment: string): Promise<any> {
  return pulsePost(`/tasks/${encodeURIComponent(id)}/comments`, {
    body: comment,
    actor: 'dashboard-ai',
  });
}

/** Execute a named transition (new — replaces multi-step label add/remove) */
export async function executeTransition(
  id: string,
  scenario: string,
  source: string,
): Promise<any> {
  return pulsePost(`/tasks/${encodeURIComponent(id)}/transition`, {
    scenario,
    source,
    actor: 'dashboard',
  });
}

// ============================================================================
// Events
// ============================================================================

/** Get events from Pulse */
export async function getEvents(limit = 100): Promise<any[]> {
  return pulseGet(`/events?limit=${limit}`);
}

/** Get events for a task */
export async function getEventsByTaskId(id: string): Promise<any[]> {
  return pulseGet(`/events?task_id=${encodeURIComponent(id)}&limit=200`);
}

/** Get events since ID */
export async function getEventsSinceId(sinceId: number, limit = 100): Promise<any[]> {
  return pulseGet(`/events?since_id=${sinceId}&limit=${limit}`);
}

/** Get stage transition events — paginates since Pulse caps at 500 */
export async function getStageTransitionEvents(maxEvents = 2000): Promise<any[]> {
  const all: any[] = [];
  const pageSize = 500;
  let offset = 0;
  while (all.length < maxEvents) {
    const batch: any[] = await pulseGet(
      `/events?event_type=label_mutation&limit=${pageSize}&offset=${offset}`,
    );
    if (batch.length === 0) break;
    all.push(...batch);
    offset += batch.length;
    if (batch.length < pageSize) break;
  }
  return all;
}

// ============================================================================
// Projects — replaces multi-project.ts
// ============================================================================

export interface WorkspaceSummary {
  name: string;
  taskCount: number;
  openCount: number;
  inProgressCount: number;
  available: boolean;
}

/** Get workspace summaries — groups tasks by workspace (Pulse `project` column) */
export async function getWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
  const tasks = await getTasks();

  const workspaces: Record<string, { open: number; inProgress: number; closed: number }> = {};
  for (const t of tasks) {
    const ws = t.workspace || process.env.DEFAULT_WORKSPACE || 'MyProject';
    if (!workspaces[ws]) workspaces[ws] = { open: 0, inProgress: 0, closed: 0 };
    if (t.status === 'closed') workspaces[ws].closed++;
    else if (t.status === 'in_progress') workspaces[ws].inProgress++;
    else workspaces[ws].open++;
  }

  return Object.entries(workspaces).map(([workspace, counts]) => ({
    name: workspace,
    taskCount: counts.open + counts.inProgress + counts.closed,
    openCount: counts.open,
    inProgressCount: counts.inProgress,
    available: true,
  }));
}

/** Get all tasks across all projects (replaces getAllProjectTasks) */
export async function getAllProjectTasks(): Promise<Task[]> {
  return getTasks();
}

// ============================================================================
// Feedback — replaces JSONL file writes for feedback loop
// ============================================================================

/** Submit feedback to Pulse API */
export async function submitFeedback(body: {
  task_id: string;
  verdict: string;
  comment?: string;
}): Promise<any> {
  return pulsePost('/feedback/submit', body);
}

/** Create approved action in Pulse */
export async function createApprovedAction(body: {
  task_id: string;
  action_type: string;
  action_data?: any;
}): Promise<any> {
  return pulsePost('/approved-actions', body);
}

/** Get pending approved actions from Pulse */
export async function getPendingApprovedActions(): Promise<any[]> {
  return pulseGet('/approved-actions?status=pending');
}

// ============================================================================
// Settings — replaces nexus-settings.json file reads/writes
// ============================================================================

/** Get all Nexus settings from Pulse */
export async function getNexusSettings(): Promise<Record<string, any>> {
  return pulseGet('/settings');
}

/** Update a setting via Pulse */
export async function updateSetting(key: string, value: any, actor = 'dashboard'): Promise<any> {
  return pulsePut(`/settings/${encodeURIComponent(key)}`, { value, actor });
}

// ============================================================================
// Project API — Pulse-native project management
// ============================================================================

export interface PulseProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  owner: string;
  phases: Array<{
    id: string;
    name: string;
    status: string;
    blocked_by?: string;
    task_count: number;
  }>;
  approval: Record<string, any> | null;
  config: Record<string, any>;
  source_yaml: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  task_count: number;
  tasks_done: number;
  progress_pct: number;
}

export interface AdvanceResult {
  project_id: string;
  completed: boolean;
  dispatchable: Array<{
    pulse_task_id: string;
    title: string;
    persona: string;
    phase_id: string;
    yaml_task_id: string;
  }>;
  gates_waiting: Array<{
    pulse_task_id: string;
    title: string;
    gate_type: string;
    phase_id: string;
  }>;
  errors: string[];
}

export async function createProject(data: {
  name: string;
  description?: string;
  phases?: any[];
  approval?: any;
  config?: any;
  source_yaml?: string;
  actor?: string;
}): Promise<PulseProject> {
  return pulsePost('/projects', data);
}

export async function importProject(data: {
  yaml_content: string;
  source_filename?: string;
  link_existing?: boolean;
  actor?: string;
}): Promise<any> {
  return pulsePost('/projects/import', data);
}

export async function updateProject(
  projectId: string,
  data: Record<string, any>,
): Promise<PulseProject> {
  return pulsePatch(`/projects/${encodeURIComponent(projectId)}`, data);
}

export async function getProjectUnblocked(projectId: string): Promise<{ tasks: any[] }> {
  return pulseGet(`/projects/${encodeURIComponent(projectId)}/unblocked`);
}

export async function getProjects(
  status?: string,
): Promise<{ projects: PulseProject[]; total: number }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return pulseGet(`/projects${qs}`);
}

export async function getProject(projectId: string): Promise<PulseProject> {
  return pulseGet(`/projects/${encodeURIComponent(projectId)}`);
}

export async function getProjectTasks(
  projectId: string,
  opts?: { status?: string; phase_id?: string },
): Promise<Task[]> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.phase_id) params.set('phase_id', opts.phase_id);
  const qs = params.toString() ? `?${params}` : '';
  return pulseGet(`/projects/${encodeURIComponent(projectId)}/tasks${qs}`);
}

export async function executeProject(projectId: string): Promise<AdvanceResult> {
  return pulsePost(`/projects/${encodeURIComponent(projectId)}/execute`);
}

export async function advanceProject(projectId: string): Promise<AdvanceResult> {
  return pulsePost(`/projects/${encodeURIComponent(projectId)}/advance`);
}

export async function advanceAllProjects(): Promise<{ projects: AdvanceResult[] }> {
  return pulsePost('/projects/advance-all');
}

export async function approveGate(
  projectId: string,
  taskId: string,
  actor = 'dashboard',
): Promise<{ approved: boolean; task_id: string; error?: string }> {
  return pulsePost(
    `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/approve-gate`,
    { actor },
  );
}

// ============================================================================
// Watch Triggers — Reactive file-watch definitions
// ============================================================================

/** Create a watch trigger */
export async function createWatchTrigger(body: {
  task_id: string;
  condition: string;
  file_patterns: string[];
  source_type: string;
  expires_days: number;
  created_by: string;
}): Promise<any> {
  return pulsePost('/watch-triggers', body);
}

/** List watch triggers with optional filters */
export async function getWatchTriggers(params?: {
  status?: string;
  task_id?: string;
}): Promise<any[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.task_id) query.set('task_id', params.task_id);
  const qs = query.toString() ? `?${query}` : '';
  return pulseGet(`/watch-triggers${qs}`);
}

/** Cancel a watch trigger */
export async function cancelWatchTrigger(triggerId: number): Promise<any> {
  return pulsePatch(`/watch-triggers/${triggerId}`, { status: 'cancelled' });
}

// ============================================================================
// Compatibility stubs
// ============================================================================

/** No-op — Pulse is always fresh, no cache to invalidate */
export function invalidateCache(): void {
  // Pulse API is always consistent — no caching layer
}
