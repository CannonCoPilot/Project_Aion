import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { getEvents as getPulseEvents, getTaskById } from './pulse-client.js';

// --- Types ---

export type EventSource = 'tasks' | 'nexus_db' | 'task_reviewer' | 'execution' | 'relay' | 'dispatcher';
export type EventCategory = 'task' | 'job' | 'decision' | 'notification' | 'system';

export interface NexusEvent {
  id: string;
  timestamp: string;
  type: string;
  source: EventSource;
  category: EventCategory;
  task_id?: string;
  job?: string;
  persona?: string;
  project?: string;
  summary: string;
  details?: Record<string, unknown>;
  cost?: number;
  duration?: number;
  tokens?: { input: number; output: number };
  severity?: 'info' | 'warn' | 'error' | 'critical';
}

export interface TimelineQuery {
  from?: string;
  to?: string;
  task_id?: string;
  job?: string;
  persona?: string;
  project?: string;
  source?: EventSource;
  category?: EventCategory;
  limit?: number;
  offset?: number;
}

export interface TaskStatusInfo {
  status: string;
  labels: string[];
  title: string;
}

export interface TimelineResponse {
  events: NexusEvent[];
  total: number;
  taskStatuses: Record<string, TaskStatusInfo>;
  stats: {
    totalEvents: number;
    totalCost: number;
    activeJobs: number;
    tasksProgressed: number;
    bySource: Record<EventSource, number>;
    byCategory: Record<EventCategory, number>;
  };
}

// --- Caching ---

interface Cache<T> {
  data: T[];
  mtime: number;
}

const fileCache = new Map<string, Cache<unknown>>();

function getMtime(filePath: string): number {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function readJsonlCached<T>(filePath: string): T[] {
  const mtime = getMtime(filePath);
  if (mtime === 0) return [];

  const cached = fileCache.get(filePath) as Cache<T> | undefined;
  if (cached && cached.mtime === mtime) return cached.data;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const data = lines.map((line) => JSON.parse(line) as T);
    fileCache.set(filePath, { data, mtime });
    return data;
  } catch (err) {
    console.warn(`[event-correlator] Failed to read ${filePath}:`, (err as Error).message);
    return [];
  }
}

// --- Helpers ---

function makeId(source: string, timestamp: string, type: string, extra = ''): string {
  return createHash('sha256')
    .update(source + timestamp + type + extra)
    .digest('hex')
    .slice(0, 12);
}

// Normalize date-only strings ("2026-03-26") to full ISO bounds for comparison
function normalizeDateBound(d: string, end: boolean): string {
  if (d.length === 10 && !d.includes('T')) {
    return end ? `${d}T23:59:59.999Z` : `${d}T00:00:00Z`;
  }
  return d;
}

function inTimeWindow(ts: string, from?: string, to?: string): boolean {
  if (from && ts < normalizeDateBound(from, false)) return false;
  if (to && ts > normalizeDateBound(to, true)) return false;
  return true;
}

// --- Parsers ---

export function parseNexusDbEvents(from?: string, to?: string): NexusEvent[] {
  let db: Database.Database;
  try {
    db = new Database(config.nexusDbPath, { readonly: true, fileMustExist: true });
    db.pragma('journal_mode = WAL');
  } catch (err) {
    console.warn('[event-correlator] Cannot open nexus.db:', (err as Error).message);
    return [];
  }

  try {
    // event_type, source, actor, severity are TABLE COLUMNS, not fields inside the JSON data blob
    interface EventRow {
      id: number;
      event_type: string;
      source: string;
      actor: string;
      severity: string;
      data: string;
      created_at: string;
    }

    let rows: EventRow[];
    const baseSql = 'SELECT id, event_type, source, actor, severity, data, created_at FROM events';
    // Skip notification_delivered rows — they have empty data and are just delivery receipts
    const skipClause = "event_type != 'notification_delivered'";

    if (from && to) {
      rows = db
        .prepare(
          `${baseSql} WHERE ${skipClause} AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC`,
        )
        .all(normalizeDateBound(from, false), normalizeDateBound(to, true)) as EventRow[];
    } else if (from) {
      rows = db
        .prepare(`${baseSql} WHERE ${skipClause} AND created_at >= ? ORDER BY created_at DESC`)
        .all(normalizeDateBound(from, false)) as EventRow[];
    } else if (to) {
      rows = db
        .prepare(`${baseSql} WHERE ${skipClause} AND created_at <= ? ORDER BY created_at DESC`)
        .all(normalizeDateBound(to, true)) as EventRow[];
    } else {
      rows = db
        .prepare(`${baseSql} WHERE ${skipClause} ORDER BY created_at DESC LIMIT 1000`)
        .all() as EventRow[];
    }

    return rows.map((row) => {
      const d = JSON.parse(row.data) as Record<string, unknown>;
      // Use the table column for event_type — the JSON data blob does NOT contain it
      const eventType = row.event_type;
      const category = categorizeNexusDbEvent(eventType);
      const severity = normalizeSeverity(row.severity);

      return {
        id: makeId('nexus_db', row.created_at, eventType, String(row.id)),
        timestamp: row.created_at,
        type: eventType,
        source: 'nexus_db' as EventSource,
        category,
        job: (d.job as string) || undefined,
        persona: row.source ? row.source.replace(/^headless:/, '') : undefined,
        summary: (d.summary as string) || (d.title as string) || buildNexusDbSummary(eventType, d),
        details: Object.keys(d).length > 0 ? d : undefined,
        cost: d.cost_usd != null ? Number(d.cost_usd) : undefined,
        duration: typeof d.duration_secs === 'number' ? d.duration_secs : undefined,
        tokens: extractTokens(d),
        severity,
      } satisfies NexusEvent;
    });
  } catch (err) {
    console.warn('[event-correlator] Error querying nexus.db:', (err as Error).message);
    return [];
  } finally {
    db.close();
  }
}

function categorizeNexusDbEvent(type: string): EventCategory {
  if (type.startsWith('job_')) return 'job';
  if (type.startsWith('question_')) return 'notification';
  if (type.startsWith('notification')) return 'notification';
  if (type === 'pause_signal') return 'system';
  return 'system';
}

function buildNexusDbSummary(type: string, data: Record<string, unknown>): string {
  const job = (data.job as string) || '';
  switch (type) {
    case 'job_started':
      return `Job ${job} started`;
    case 'job_completed':
      return `Job ${job} completed`;
    case 'job_failed':
      return `Job ${job} failed`;
    case 'question_asked':
      return `Question from ${job}: ${(data.title as string) || 'pending'}`;
    case 'question_answered':
      return `Question answered for ${job}`;
    case 'question_expired':
      return `Question expired for ${job}`;
    case 'notification':
      return (data.title as string) || `Notification from ${job}`;
    case 'notification_delivered':
      return `Notification delivered for ${job}`;
    case 'pause_signal':
      return `Pause signal: ${job}`;
    default:
      return `${type} event${job ? ` for ${job}` : ''}`;
  }
}

function normalizeSeverity(s: string | undefined): NexusEvent['severity'] {
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === 'info' || lower === 'warn' || lower === 'error' || lower === 'critical') {
    return lower as NexusEvent['severity'];
  }
  return 'info';
}

function extractTokens(d: Record<string, unknown>): NexusEvent['tokens'] {
  const mu = d.model_usage as Record<string, unknown> | undefined;
  if (mu && typeof mu.input === 'number' && typeof mu.output === 'number') {
    return { input: mu.input, output: mu.output };
  }
  if (typeof d.tokens === 'object' && d.tokens) {
    const t = d.tokens as Record<string, unknown>;
    if (typeof t.input === 'number' && typeof t.output === 'number') {
      return { input: t.input, output: t.output };
    }
  }
  return undefined;
}

export async function parseTaskEvents(from?: string, to?: string): Promise<NexusEvent[]> {
  const events = await getPulseEvents();
  return events
    .filter((e) => inTimeWindow(e.created_at, from, to))
    .map((e) => ({
      id: makeId('tasks', e.created_at, e.event_type, e.issue_id + String(e.id)),
      timestamp: e.created_at,
      type: `task_${e.event_type}`,
      source: 'tasks' as EventSource,
      category: 'task' as EventCategory,
      task_id: e.issue_id,
      summary: buildTaskSummary(e),
      details: {
        actor: e.actor,
        old_value: e.old_value,
        new_value: e.new_value,
        comment: e.comment,
      },
    }));
}

function buildTaskSummary(e: {
  event_type: string;
  issue_id: string;
  new_value?: string;
  comment?: string;
}): string {
  switch (e.event_type) {
    case 'created':
      return `Task ${e.issue_id} created`;
    case 'label_added':
      return `Label "${e.new_value}" added to ${e.issue_id}`;
    case 'label_removed':
      return `Label removed from ${e.issue_id}`;
    case 'commented':
      return `Comment on ${e.issue_id}${e.comment ? `: ${e.comment.slice(0, 80)}` : ''}`;
    case 'closed':
      return `Task ${e.issue_id} closed`;
    case 'decomposed':
      return `Task ${e.issue_id} decomposed into subtasks`;
    default:
      return `${e.event_type} on task ${e.issue_id}`;
  }
}

export function parseAiDavidDecisions(from?: string, to?: string): NexusEvent[] {
  const dir = config.taskReviewerResultsDir;
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
  } catch {
    return [];
  }

  // Filter files by date prefix if we have a from/to window
  if (from) {
    const fromDate = from.slice(0, 10); // YYYY-MM-DD
    files = files.filter((f) => f.slice(0, 10) >= fromDate);
  }
  if (to) {
    const toDate = to.slice(0, 10);
    files = files.filter((f) => f.slice(0, 10) <= toDate);
  }

  interface AiDavidEntry {
    timestamp: string;
    task_id?: string;
    task_title?: string;
    action: string;
    confidence?: number;
    risk?: string;
    pattern_matched?: string;
    reasoning?: string;
    labels_added?: string[];
    labels_removed?: string[];
  }

  const results: NexusEvent[] = [];
  for (const file of files) {
    const entries = readJsonlCached<AiDavidEntry>(join(dir, file));
    for (const e of entries) {
      if (!inTimeWindow(e.timestamp, from, to)) continue;
      // Map AI David action to the job that ran it
      const job = ['execute', 'fix'].includes(e.action)
        ? 'task-executor'
        : ['propose', 'escalate', 'defer', 'close'].includes(e.action)
          ? 'task-evaluator'
          : undefined;

      results.push({
        id: makeId('task_reviewer', e.timestamp, e.action, e.task_id || ''),
        timestamp: e.timestamp,
        type: `ai_${e.action}`,
        source: 'task_reviewer',
        category: 'decision',
        task_id: e.task_id,
        job,
        persona: 'task-reviewer',
        summary: buildAiDavidSummary(e),
        details: {
          confidence: e.confidence,
          risk: e.risk,
          pattern_matched: e.pattern_matched,
          reasoning: e.reasoning,
          labels_added: e.labels_added,
          labels_removed: e.labels_removed,
        },
      });
    }
  }
  return results;
}

function buildAiDavidSummary(e: { action: string; task_title?: string; task_id?: string }): string {
  const target = e.task_title || e.task_id || 'unknown task';
  switch (e.action) {
    case 'execute':
      return `AI David executed: ${target}`;
    case 'propose':
      return `AI David proposed: ${target}`;
    case 'escalate':
      return `AI David escalated: ${target}`;
    case 'close':
      return `AI David closed: ${target}`;
    case 'defer':
      return `AI David deferred: ${target}`;
    case 'fix':
      return `AI David fixed: ${target}`;
    default:
      return `AI David ${e.action}: ${target}`;
  }
}

export function parseExecutionLogs(from?: string, to?: string): NexusEvent[] {
  const dir = config.executionLogsDir;
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  // Filename pattern: {job}-{YYYYMMDD}-{HHMMSS}.json
  // JSON format: Claude Code result with total_cost_usd, duration_ms, is_error, result, usage, modelUsage
  interface ExecLog {
    type?: string;
    subtype?: string;
    is_error?: boolean;
    duration_ms?: number;
    num_turns?: number;
    result?: string;
    total_cost_usd?: number;
    usage?: Record<string, unknown>;
    modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; costUSD?: number }>;
    session_id?: string;
  }

  const results: NexusEvent[] = [];
  for (const file of files) {
    const filePath = join(dir, file);
    try {
      // Extract job name and timestamp from filename
      const match = file.match(/^(.+)-(\d{8})-(\d{6})\.json$/);
      if (!match) continue;
      const [, jobName, dateStr, timeStr] = match;
      const timestamp = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}Z`;

      if (!inTimeWindow(timestamp, from, to)) continue;

      const content = readFileSync(filePath, 'utf-8');
      const e = JSON.parse(content) as ExecLog;

      const success = !e.is_error && e.subtype !== 'error';
      const costUsd = e.total_cost_usd ?? 0;
      const durationSecs = e.duration_ms ? Math.round(e.duration_ms / 1000) : undefined;

      // Extract total tokens from modelUsage
      let totalInput = 0;
      let totalOutput = 0;
      if (e.modelUsage) {
        for (const m of Object.values(e.modelUsage)) {
          totalInput += m.inputTokens ?? 0;
          totalOutput += m.outputTokens ?? 0;
        }
      }

      // Extract a short summary from the result text
      const resultPreview = e.result ? e.result.slice(0, 120).replace(/\n/g, ' ') : '';

      // Extract task IDs from the result text (pattern: AIProjects-xxxx or similar)
      const taskIdsInResult = e.result
        ? [...new Set(e.result.match(/\b(AIProjects-[a-z0-9]+)\b/gi) || [])]
        : [];

      // Infer persona from job name
      const persona =
        jobName.startsWith('task-') || jobName.startsWith('aurora-') ? 'task-reviewer' : undefined;

      results.push({
        id: makeId('execution', timestamp, 'execution_complete', jobName),
        timestamp,
        type: success ? 'execution_success' : 'execution_failure',
        source: 'execution',
        category: 'job',
        job: jobName,
        persona,
        summary: `${jobName} ${success ? 'completed' : 'failed'}${costUsd > 0 ? ` — $${costUsd.toFixed(4)}` : ''}${resultPreview ? ` | ${resultPreview}` : ''}`,
        details: {
          subtype: e.subtype,
          num_turns: e.num_turns,
          session_id: e.session_id,
          result_preview: e.result?.slice(0, 500),
          taskIds: taskIdsInResult.length > 0 ? taskIdsInResult : undefined,
        },
        cost: costUsd || undefined,
        duration: durationSecs,
        tokens:
          totalInput > 0 || totalOutput > 0
            ? { input: totalInput, output: totalOutput }
            : undefined,
        severity: success ? 'info' : 'error',
      });
    } catch (err) {
      console.warn(
        `[event-correlator] Failed to parse execution log ${file}:`,
        (err as Error).message,
      );
    }
  }
  return results;
}

export function parseStructuredLogs(from?: string, to?: string): NexusEvent[] {
  interface StructuredLog {
    ts: string;
    level: string;
    component: string;
    job?: string;
    msg: string;
  }

  const entries = readJsonlCached<StructuredLog>(config.structuredLogsPath);
  return entries
    .filter((e) => inTimeWindow(e.ts, from, to))
    .map((e) => ({
      id: makeId('dispatcher', e.ts, e.level, e.component + (e.job || '') + e.msg.slice(0, 20)),
      timestamp: e.ts,
      type: `log_${e.level}`,
      source: 'dispatcher' as EventSource,
      category: 'system' as EventCategory,
      job: e.job,
      summary: `[${e.component}] ${e.msg}`,
      severity: normalizeSeverity(e.level),
    }));
}

export function parseRelayMessages(from?: string, to?: string): NexusEvent[] {
  interface RelayMsg {
    event_type: string;
    source: string;
    severity?: string;
    data?: Record<string, unknown>;
    created_at: string;
  }

  const entries = readJsonlCached<RelayMsg>(config.relayMessagesPath);
  return entries
    .filter((e) => inTimeWindow(e.created_at, from, to))
    .map((e) => ({
      id: makeId('relay', e.created_at, e.event_type, e.source),
      timestamp: e.created_at,
      type: e.event_type,
      source: 'relay' as EventSource,
      category: categorizeRelayEvent(e.event_type),
      summary: buildRelaySummary(e),
      details: e.data,
      severity: normalizeSeverity(e.severity),
    }));
}

function categorizeRelayEvent(type: string): EventCategory {
  if (type.startsWith('job_')) return 'job';
  if (type.startsWith('task_')) return 'task';
  if (type.includes('notification') || type.includes('question')) return 'notification';
  return 'system';
}

function buildRelaySummary(e: {
  event_type: string;
  source: string;
  data?: Record<string, unknown>;
}): string {
  const title = e.data?.title as string | undefined;
  if (title) return `[${e.source}] ${title}`;
  return `[${e.source}] ${e.event_type}`;
}

// --- Main Timeline Function ---

export async function getTimeline(query: TimelineQuery = {}): Promise<TimelineResponse> {
  const { from, to, limit = 500, offset = 0 } = query;

  // Collect from all sources
  const taskEvents = await parseTaskEvents(from, to);
  const allEvents: NexusEvent[] = [
    ...parseNexusDbEvents(from, to),
    ...taskEvents,
    ...parseAiDavidDecisions(from, to),
    ...parseExecutionLogs(from, to),
    ...parseStructuredLogs(from, to),
    ...parseRelayMessages(from, to),
  ];

  // Filter out dispatcher log_info noise unless explicitly requesting dispatcher source
  // These are high-volume operational logs that drown out meaningful events
  let filtered =
    query.source === 'dispatcher'
      ? allEvents
      : allEvents.filter((e) => !(e.source === 'dispatcher' && e.type === 'log_info'));

  // Apply filters
  if (query.task_id) filtered = filtered.filter((e) => e.task_id === query.task_id);
  if (query.job) filtered = filtered.filter((e) => e.job === query.job);
  if (query.persona) filtered = filtered.filter((e) => e.persona === query.persona);
  if (query.project) filtered = filtered.filter((e) => e.project === query.project);
  if (query.source) filtered = filtered.filter((e) => e.source === query.source);
  if (query.category) filtered = filtered.filter((e) => e.category === query.category);

  // Remove events with missing timestamps, then sort descending
  filtered = filtered.filter((e) => e.timestamp);
  filtered.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));

  // Compute stats before pagination
  const stats = computeStats(filtered);

  // Paginate
  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);

  // Collect real task statuses from Pulse for all referenced task_ids
  const taskIds = new Set<string>();
  for (const e of filtered) {
    if (e.task_id) taskIds.add(e.task_id);
  }
  const taskStatuses: Record<string, TaskStatusInfo> = {};
  for (const tid of taskIds) {
    const t = await getTaskById(tid);
    if (t) {
      taskStatuses[tid] = { status: t.status, labels: t.labels, title: t.title };
    }
  }

  return { events: paged, total, taskStatuses, stats };
}

// --- Task Journey ---

export interface TaskJourneyStage {
  name: string;
  completed: boolean;
  timestamp?: string;
  duration?: number;
  cost?: number;
  events: NexusEvent[];
  actor?: string;
}

export interface TaskJourney {
  task: {
    id: string;
    title: string;
    status: string;
    labels: string[];
    priority: number;
    created: string;
  };
  stages: TaskJourneyStage[];
  currentStage: string | null;
  totalCost: number;
  totalDuration: number;
  relatedJobs: string[];
  decisions: {
    action: string;
    confidence?: number;
    risk?: string;
    feedback?: string;
    timestamp: string;
  }[];
}

const STAGE_DEFS: { name: string; match: (e: NexusEvent) => boolean }[] = [
  {
    name: 'created',
    match: (e) => e.type === 'task_created',
  },
  {
    name: 'evaluated',
    match: (e) =>
      e.type === 'task_label_added' &&
      /auto:candidate|evaluator/i.test(String(e.details?.new_value ?? '')),
  },
  {
    name: 'investigated',
    match: (e) =>
      e.type === 'task_label_added' &&
      /auto:ready|investigator/i.test(String(e.details?.new_value ?? '')),
  },
  {
    name: 'approved',
    match: (e) =>
      e.type === 'task_label_added' &&
      /pipeline:approved|stage:queue|risk:safe/i.test(String(e.details?.new_value ?? '')),
  },
  {
    name: 'executed',
    match: (e) =>
      (e.source === 'execution' && /task-executor|task-research/i.test(e.job ?? '')) ||
      (e.source === 'nexus_db' && e.type === 'job_completed'),
  },
  {
    name: 'reviewed',
    match: (e) =>
      e.source === 'task_reviewer' && /^ai_(execute|propose|escalate|close|defer|fix)/.test(e.type),
  },
  {
    name: 'closed',
    match: (e) => e.type === 'task_closed',
  },
];

export async function getTaskJourney(taskId: string): Promise<TaskJourney | null> {
  const task = await getTaskById(taskId);
  if (!task) return null;

  // Gather all events without time filter, then filter by task_id
  const taskEvents = (await parseTaskEvents()).filter((e) => e.task_id === taskId);
  const aiDecisions = parseAiDavidDecisions().filter((e) => e.task_id === taskId);
  const nexusDbEvents = parseNexusDbEvents().filter((e) => e.task_id === taskId);
  const executionEvents = parseExecutionLogs();
  const structuredLogs = parseStructuredLogs();

  // For execution/structured logs, check if task_id is referenced in details
  const executionMatches = executionEvents.filter(
    (e) => e.task_id === taskId || JSON.stringify(e.details ?? {}).includes(taskId),
  );
  const structuredMatches = structuredLogs.filter(
    (e) => e.task_id === taskId || JSON.stringify(e.details ?? {}).includes(taskId),
  );

  const allEvents = [
    ...taskEvents,
    ...aiDecisions,
    ...nexusDbEvents,
    ...executionMatches,
    ...structuredMatches,
  ];

  // Sort chronologically
  allEvents.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

  // Build stages
  const stages: TaskJourneyStage[] = STAGE_DEFS.map((def) => {
    const stageEvents = allEvents.filter((e) => def.match(e));
    const completed = stageEvents.length > 0;
    const timestamp = stageEvents[0]?.timestamp;
    const cost = stageEvents.reduce((sum, e) => sum + (e.cost ?? 0), 0) || undefined;
    const actor = stageEvents[0]?.details?.actor as string | undefined;

    return {
      name: def.name,
      completed,
      timestamp,
      cost,
      events: stageEvents,
      actor,
    };
  });

  // Compute durations between completed stages
  const completedStages = stages.filter((s) => s.completed && s.timestamp);
  for (let i = 1; i < completedStages.length; i++) {
    const prev = completedStages[i - 1];
    const curr = completedStages[i];
    if (prev.timestamp && curr.timestamp) {
      curr.duration = Math.round(
        (new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000,
      );
    }
  }

  // Collect related jobs
  const relatedJobs = new Set<string>();
  for (const e of allEvents) {
    if (e.job) relatedJobs.add(e.job);
  }

  // Build decisions list
  const decisions = aiDecisions.map((e) => ({
    action: e.type.replace(/^ai_/, ''),
    confidence: e.details?.confidence as number | undefined,
    risk: e.details?.risk as string | undefined,
    feedback: e.details?.feedback as string | undefined,
    timestamp: e.timestamp,
  }));

  const totalCost = allEvents.reduce((sum, e) => sum + (e.cost ?? 0), 0);

  // Total duration: from first to last event timestamp
  let totalDuration = 0;
  if (allEvents.length >= 2) {
    const first = allEvents[0].timestamp;
    const last = allEvents[allEvents.length - 1].timestamp;
    if (first && last) {
      totalDuration = Math.round((new Date(last).getTime() - new Date(first).getTime()) / 1000);
    }
  }

  return {
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      labels: task.labels,
      priority: task.priority,
      created: task.created_at,
    },
    stages,
    currentStage:
      (task.labels as string[]).find((l) => l.startsWith('stage:'))?.replace('stage:', '') ?? null,
    totalCost,
    totalDuration,
    relatedJobs: [...relatedJobs],
    decisions,
  };
}

// --- Job Detail ---

export interface JobRun {
  timestamp: string;
  status: 'completed' | 'failed';
  cost?: number;
  duration?: number;
  tokens?: { input: number; output: number };
  tasksProcessed: string[];
}

export interface JobDetail {
  job: {
    name: string;
    description?: string;
    persona?: string;
    schedule?: string;
    enabled?: boolean;
  };
  recentRuns: JobRun[];
  stats: {
    totalRuns: number;
    successRate: number;
    avgCost: number;
    avgDuration: number;
    totalCost: number;
  };
}

export function getJobDetail(jobName: string, from?: string, to?: string): JobDetail {
  // Gather events from relevant sources filtered to this job
  const nexusDbEvents = parseNexusDbEvents(from, to).filter((e) => e.job === jobName);
  const executionEvents = parseExecutionLogs(from, to).filter((e) => e.job === jobName);
  const structuredLogs = parseStructuredLogs(from, to).filter((e) => e.job === jobName);

  // Build runs from execution logs (each is one run)
  const runsMap = new Map<string, JobRun>();

  for (const e of executionEvents) {
    const key = e.timestamp;
    runsMap.set(key, {
      timestamp: e.timestamp,
      status: e.type === 'execution_success' ? 'completed' : 'failed',
      cost: e.cost,
      duration: e.duration,
      tokens: e.tokens,
      tasksProcessed: [],
    });
  }

  // Supplement with nexus_db job_started/job_completed pairs
  for (const e of nexusDbEvents) {
    if (e.type === 'job_completed' || e.type === 'job_failed') {
      const key = e.timestamp;
      if (!runsMap.has(key)) {
        runsMap.set(key, {
          timestamp: e.timestamp,
          status: e.type === 'job_completed' ? 'completed' : 'failed',
          cost: e.cost,
          duration: e.duration,
          tokens: e.tokens,
          tasksProcessed: [],
        });
      }
    }
  }

  // Find task_ids related to each run from nearby events
  const allJobEvents = [...nexusDbEvents, ...executionEvents, ...structuredLogs];
  for (const e of allJobEvents) {
    if (e.task_id) {
      // Attach to nearest run
      let closestRun: JobRun | undefined;
      let closestDelta = Infinity;
      for (const run of runsMap.values()) {
        const delta = Math.abs(new Date(e.timestamp).getTime() - new Date(run.timestamp).getTime());
        if (delta < closestDelta) {
          closestDelta = delta;
          closestRun = run;
        }
      }
      if (closestRun && !closestRun.tasksProcessed.includes(e.task_id)) {
        closestRun.tasksProcessed.push(e.task_id);
      }
    }
  }

  const recentRuns = [...runsMap.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Compute stats
  const totalRuns = recentRuns.length;
  const successCount = recentRuns.filter((r) => r.status === 'completed').length;
  const successRate = totalRuns > 0 ? successCount / totalRuns : 0;
  const costs = recentRuns.filter((r) => r.cost != null).map((r) => r.cost!);
  const durations = recentRuns.filter((r) => r.duration != null).map((r) => r.duration!);
  const totalCost = costs.reduce((sum, c) => sum + c, 0);
  const avgCost = costs.length > 0 ? totalCost / costs.length : 0;
  const avgDuration =
    durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;

  // Try to load job config from registry
  let jobMeta: JobDetail['job'] = { name: jobName };
  try {
    const registryPath = process.env.REGISTRY_PATH || '/nexus/registry.yaml';
    const content = readFileSync(registryPath, 'utf-8');
    // Registry uses dict format: "  job-name:\n    description: ..."
    const escaped = jobName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const jobPattern = new RegExp(`(?:^|\\n)\\s+${escaped}:\\s*\\n`, 'm');
    const match = content.match(jobPattern);
    if (match && match.index != null) {
      // Extract the indented block after the job key
      const afterKey = content.slice(match.index + match[0].length);
      // Take lines until we hit a line at the same or lower indent level
      const blockLines: string[] = [];
      for (const line of afterKey.split('\n')) {
        if (line.trim() === '' || /^\s{4,}/.test(line)) {
          blockLines.push(line);
        } else break;
      }
      const block = blockLines.join('\n');
      const descMatch = block.match(/description:\s*"?([^"\n]+)"?/);
      const personaMatch = block.match(/persona:\s*(\S+)/);
      const scheduleMatch = block.match(/every_hours:\s*(\d+)/);
      const intervalMatch = block.match(/type:\s*(\S+)/);
      const enabledMatch = block.match(/enabled:\s*(\S+)/);
      const scheduleStr = scheduleMatch
        ? `every ${scheduleMatch[1]}h`
        : intervalMatch?.[1] === 'cron'
          ? block.match(/cron:\s*"?([^"\n]+)"?/)?.[1]
          : undefined;
      jobMeta = {
        name: jobName,
        description: descMatch?.[1]?.trim(),
        persona: personaMatch?.[1]?.trim(),
        schedule: scheduleStr?.trim(),
        enabled: enabledMatch ? enabledMatch[1].trim() !== 'false' : undefined,
      };
    }
  } catch {
    // Registry not accessible — that's fine
  }

  return {
    job: jobMeta,
    recentRuns,
    stats: {
      totalRuns,
      successRate,
      avgCost,
      avgDuration,
      totalCost,
    },
  };
}

function computeStats(events: NexusEvent[]): TimelineResponse['stats'] {
  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const activeJobs = new Set<string>();
  const tasksProgressed = new Set<string>();

  // Only count cost from execution source to avoid double-counting
  // (nexus_db also reports cost for the same job runs)
  let totalCost = 0;
  const costJobTimestamps = new Set<string>();

  for (const e of events) {
    bySource[e.source] = (bySource[e.source] || 0) + 1;
    byCategory[e.category] = (byCategory[e.category] || 0) + 1;

    if (e.cost) {
      // Prefer execution source; only use nexus_db cost if no execution event exists for this job+date
      const dedupeKey = `${e.job || ''}|${e.timestamp.slice(0, 10)}`;
      if (e.source === 'execution') {
        totalCost += e.cost;
        costJobTimestamps.add(dedupeKey);
      } else if (e.source === 'nexus_db' && !costJobTimestamps.has(dedupeKey)) {
        totalCost += e.cost;
      }
      // Skip cost from other sources (tasks, relay, etc. don't have real cost data)
    }

    if (e.job && (e.type === 'job_started' || e.type === 'execution_success')) {
      activeJobs.add(e.job);
    }

    if (e.task_id) {
      tasksProgressed.add(e.task_id);
    }
  }

  return {
    totalEvents: events.length,
    totalCost,
    activeJobs: activeJobs.size,
    tasksProgressed: tasksProgressed.size,
    bySource: bySource as Record<EventSource, number>,
    byCategory: byCategory as Record<EventCategory, number>,
  };
}
