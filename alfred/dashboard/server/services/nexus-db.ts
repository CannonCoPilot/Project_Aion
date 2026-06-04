import Database from 'better-sqlite3';
import { statSync } from 'node:fs';
import { config } from '../config.js';
import { parseRegistry } from './registry.js';
import { getFilteredTasks } from './pulse-client.js';

interface NexusEvent {
  id: number;
  data: string;
  created_at: string;
}

interface JobState {
  job: string;
  last_run: string;
  fail_count: number;
  last_failure: string | null;
}

interface ParsedEvent {
  id: number;
  type: string;
  job?: string;
  severity?: string;
  summary?: string;
  cost?: number;
  duration?: number;
  status?: string;
  source?: string;
  output_file?: string;
  timestamp: string;
  raw: Record<string, unknown>;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(config.nexusDbPath, { readonly: true, fileMustExist: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function deriveEventType(data: Record<string, unknown>): string {
  if (data.event_type) return data.event_type as string;
  if (data.exit_code !== undefined) return 'job_completed';
  if (data.title && typeof data.title === 'string') {
    if (data.title.includes('completed')) return 'job_completed';
    if (data.title.includes('started')) return 'job_started';
    if (data.title.includes('failed')) return 'job_failed';
  }
  if (data.job) return 'job_event';
  return 'unknown';
}

function parseEvent(row: NexusEvent): ParsedEvent {
  const data = JSON.parse(row.data) as Record<string, unknown>;
  return {
    id: row.id,
    type: deriveEventType(data),
    job: data.job as string | undefined,
    severity: data.severity as string | undefined,
    summary: data.summary as string | undefined,
    cost:
      data.cost_usd != null
        ? Number(data.cost_usd)
        : data.cost != null
          ? Number(data.cost)
          : undefined,
    duration:
      typeof data.duration_secs === 'number'
        ? (data.duration_secs as number)
        : (data.duration as number | undefined),
    status: data.status as string | undefined,
    source: data.source as string | undefined,
    output_file: data.output_file as string | undefined,
    timestamp: row.created_at,
    raw: data,
  };
}

export function getRecentEvents(limit = 20, since?: string): ParsedEvent[] {
  const db = getDb();
  let rows: NexusEvent[];
  if (since) {
    rows = db
      .prepare(
        'SELECT id, data, created_at FROM events WHERE created_at > ? ORDER BY created_at DESC LIMIT ?',
      )
      .all(since, limit) as NexusEvent[];
  } else {
    rows = db
      .prepare('SELECT id, data, created_at FROM events ORDER BY created_at DESC LIMIT ?')
      .all(limit) as NexusEvent[];
  }
  return rows.map(parseEvent);
}

export interface WaitingDavidApproval {
  id: string;
  job: string;
  question: string;
  context?: string;
  timestamp: string;
}

export async function getPendingApprovals(): Promise<WaitingDavidApproval[]> {
  try {
    const { tasks } = await getFilteredTasks({ label: 'waiting:david', status: 'open' });
    return tasks
      .filter((t) => {
        // Only surface tasks that have an actual question or explicit approval gate
        const labels = t.labels ?? [];
        return (
          t.question || labels.includes('needs-input') || labels.includes('pipeline:needs-approval')
        );
      })
      .map((t) => {
        const sourceLabel = (t.labels ?? []).find((l: string) => l.startsWith('source:'));
        const contextParts = [t.description, t.notes].filter(Boolean);
        const rawContext = contextParts.join('\n\n---\n\n') || undefined;
        return {
          id: t.id,
          job: sourceLabel ? sourceLabel.replace('source:', '') : 'nexus',
          question: t.question ?? t.title,
          context:
            rawContext && rawContext.length > 2000
              ? rawContext.slice(0, 2000) + '\n\n[truncated]'
              : rawContext,
          timestamp: t.updated_at ?? t.created_at ?? new Date().toISOString(),
        };
      });
  } catch {
    return [];
  }
}

export function getJobStates(): JobState[] {
  const db = getDb();
  return db
    .prepare('SELECT job, last_run, fail_count, last_failure FROM job_state')
    .all() as JobState[];
}

/** Schedule-aware stale threshold in seconds. Mirrors dispatcher.sh stall detection. */
function getStaleThreshold(schedType: string, everyHours?: number): number {
  switch (schedType) {
    case 'on-demand':
    case 'on_demand':
      return Infinity; // on-demand jobs are never stale
    case 'weekly':
      return 10 * 86400; // 10 days
    case 'daily':
      return 3 * 86400; // 3 days
    case 'interval':
      return (everyHours ?? 24) * 3600 * 3; // 3× the configured interval
    default:
      return 3 * 86400; // safe default: 3 days
  }
}

export async function getHealthStatus(): Promise<{
  dispatcher: { status: string; lastHeartbeat: string | null; heartbeatAge: number | null };
  jobs: { name: string; lastRun: string | null; failCount: number; status: string }[];
  messageBus: { pendingCount: number; pendingApprovals: number; oldestPending: string | null };
}> {
  // Dispatcher heartbeat
  let dispatcherStatus = 'down';
  let lastHeartbeat: string | null = null;
  let heartbeatAge: number | null = null;
  try {
    const stat = statSync(config.dispatcherHeartbeatPath);
    lastHeartbeat = stat.mtime.toISOString();
    heartbeatAge = Math.round((Date.now() - stat.mtimeMs) / 1000);
    if (heartbeatAge < 120) {
      dispatcherStatus = 'healthy';
    } else if (heartbeatAge < 600) {
      dispatcherStatus = 'stale';
    } else {
      dispatcherStatus = 'down';
    }
  } catch {
    // heartbeat file doesn't exist
  }

  // Job states — schedule-aware staleness thresholds
  const jobStates = getJobStates();
  const { jobs: registryJobs } = parseRegistry();
  const jobMap = new Map(registryJobs.map((j) => [j.name, j]));
  const nowSecs = Date.now() / 1000;
  const jobs = jobStates.map((j) => {
    // last_run may be a Unix timestamp (number) or ISO string
    const lastRunTs =
      typeof j.last_run === 'number'
        ? j.last_run
        : j.last_run
          ? new Date(j.last_run).getTime() / 1000
          : 0;
    const lastRunAge = lastRunTs ? nowSecs - lastRunTs : Infinity;
    const lastRunIso = lastRunTs ? new Date(lastRunTs * 1000).toISOString() : '';

    const jobDef = jobMap.get(j.job);
    if (!jobDef) {
      // Job exists in DB but not in registry — removed or renamed, not stale
      return { name: j.job, lastRun: lastRunIso, failCount: j.fail_count, status: 'ok' };
    }
    const schedType = jobDef.schedule?.type ?? 'interval';
    const enabled = jobDef.enabled !== false;
    const staleThreshold = getStaleThreshold(schedType, jobDef.schedule?.every_hours);

    let status = 'ok';
    if (j.fail_count > 0) status = 'failing';
    else if (!enabled)
      status = 'ok'; // disabled jobs are not stale
    else if (staleThreshold === Infinity)
      status = 'ok'; // on-demand jobs are never stale
    else if (lastRunAge > staleThreshold) status = 'stale';
    return {
      name: j.job,
      lastRun: lastRunIso,
      failCount: j.fail_count,
      status,
    };
  });

  // Message bus pending — waiting:david tasks
  const pending = await getPendingApprovals();
  const oldestPending = pending.length > 0 ? pending[pending.length - 1].timestamp : null;

  return {
    dispatcher: { status: dispatcherStatus, lastHeartbeat, heartbeatAge },
    jobs,
    messageBus: {
      pendingCount: pending.length,
      pendingApprovals: pending.length,
      oldestPending,
    },
  };
}

export function getLastEventId(): number {
  const db = getDb();
  const row = db.prepare('SELECT MAX(id) as maxId FROM events').get() as { maxId: number | null };
  return row.maxId ?? 0;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
