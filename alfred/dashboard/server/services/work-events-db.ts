import { getDashboardDb } from './dashboard-db.js';

// --- Interfaces ---

export interface WorkEvent {
  timestamp: string;
  agent: string;
  actor: string;
  actor_type: string;
  action: string;
  task_id?: string;
  task_title?: string;
  domain?: string;
  project?: string;
  summary?: string;
  value_description?: string;
  value_rating?: string;
  quantitative?: string;
  confidence?: number;
  stage_from?: string;
  stage_to?: string;
  source_file: string;
  source_key: string;
}

export interface WorkEventRow extends WorkEvent {
  id: number;
  ingested_at: string;
}

export interface WorkEventFilters {
  from?: string;
  to?: string;
  agent?: string;
  actor?: string;
  actor_type?: string;
  action?: string;
  domain?: string;
  project?: string;
  value_rating?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sort?: string; // 'timestamp_asc' | 'timestamp_desc'
}

export interface AggregatorState {
  source: string;
  last_file_processed: string | null;
  last_timestamp: string | null;
  last_run: string | null;
  events_total: number;
}

export interface WorkEventsSummary {
  total_events: number;
  by_action: Record<string, number>;
  by_agent: Record<string, number>;
  by_actor: Record<string, number>;
  by_domain: Record<string, number>;
  by_project: Record<string, number>;
  by_actor_type: Record<string, number>;
  value_breakdown: { high: number; medium: number; low: number; unrated: number };
}

export interface ChartDataPoint {
  label: string;
  value: number;
  group?: string;
}

// --- Schema Init ---

let schemaInitialized = false;

export function initWorkEventsSchema(): void {
  if (schemaInitialized) return;
  const db = getDashboardDb();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS work_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      agent TEXT NOT NULL,
      actor TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      action TEXT NOT NULL,
      task_id TEXT,
      task_title TEXT,
      domain TEXT,
      project TEXT,
      summary TEXT,
      value_description TEXT,
      value_rating TEXT,
      quantitative TEXT,
      confidence REAL,
      source_file TEXT,
      source_key TEXT UNIQUE NOT NULL,
      ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS aggregator_state (
      source TEXT PRIMARY KEY,
      last_file_processed TEXT,
      last_timestamp TEXT,
      last_run TEXT,
      events_total INTEGER DEFAULT 0
    )
  `,
  ).run();

  db.prepare(
    'CREATE INDEX IF NOT EXISTS idx_work_events_timestamp ON work_events(timestamp)',
  ).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_work_events_agent ON work_events(agent)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_work_events_actor ON work_events(actor)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_work_events_action ON work_events(action)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_work_events_domain ON work_events(domain)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_work_events_task_id ON work_events(task_id)').run();

  // Migration: add stage columns to existing tables
  try {
    db.prepare('ALTER TABLE work_events ADD COLUMN stage_from TEXT').run();
  } catch {
    /* column already exists */
  }
  try {
    db.prepare('ALTER TABLE work_events ADD COLUMN stage_to TEXT').run();
  } catch {
    /* column already exists */
  }

  schemaInitialized = true;
}

// --- Upsert ---

export function upsertWorkEvent(event: WorkEvent): boolean {
  initWorkEventsSchema();
  const db = getDashboardDb();
  const result = db
    .prepare(
      `
    INSERT OR IGNORE INTO work_events
      (timestamp, agent, actor, actor_type, action, task_id, task_title, domain, project,
       summary, value_description, value_rating, quantitative, confidence, stage_from, stage_to, source_file, source_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      event.timestamp,
      event.agent,
      event.actor,
      event.actor_type,
      event.action,
      event.task_id ?? null,
      event.task_title ?? null,
      event.domain ?? null,
      event.project ?? null,
      event.summary ?? null,
      event.value_description ?? null,
      event.value_rating ?? null,
      event.quantitative ?? null,
      event.confidence ?? null,
      event.stage_from ?? null,
      event.stage_to ?? null,
      event.source_file,
      event.source_key,
    );
  return result.changes > 0;
}

export function upsertWorkEvents(events: WorkEvent[]): { inserted: number; skipped: number } {
  initWorkEventsSchema();
  const db = getDashboardDb();
  let inserted = 0;
  let skipped = 0;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO work_events
      (timestamp, agent, actor, actor_type, action, task_id, task_title, domain, project,
       summary, value_description, value_rating, quantitative, confidence, stage_from, stage_to, source_file, source_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const runAll = db.transaction((evts: WorkEvent[]) => {
    for (const event of evts) {
      const result = stmt.run(
        event.timestamp,
        event.agent,
        event.actor,
        event.actor_type,
        event.action,
        event.task_id ?? null,
        event.task_title ?? null,
        event.domain ?? null,
        event.project ?? null,
        event.summary ?? null,
        event.value_description ?? null,
        event.value_rating ?? null,
        event.quantitative ?? null,
        event.confidence ?? null,
        event.stage_from ?? null,
        event.stage_to ?? null,
        event.source_file,
        event.source_key,
      );
      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }
  });

  runAll(events);
  return { inserted, skipped };
}

// --- Aggregator State ---

export function getAggregatorState(source: string): AggregatorState | null {
  initWorkEventsSchema();
  const db = getDashboardDb();
  const row = db.prepare('SELECT * FROM aggregator_state WHERE source = ?').get(source) as
    | AggregatorState
    | undefined;
  return row ?? null;
}

export function updateAggregatorState(source: string, state: Partial<AggregatorState>): void {
  initWorkEventsSchema();
  const db = getDashboardDb();
  const existing = getAggregatorState(source);

  if (!existing) {
    db.prepare(
      `
      INSERT INTO aggregator_state (source, last_file_processed, last_timestamp, last_run, events_total)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(
      source,
      state.last_file_processed ?? null,
      state.last_timestamp ?? null,
      state.last_run ?? null,
      state.events_total ?? 0,
    );
  } else {
    const merged = { ...existing, ...state };
    db.prepare(
      `
      UPDATE aggregator_state
      SET last_file_processed = ?, last_timestamp = ?, last_run = ?, events_total = ?
      WHERE source = ?
    `,
    ).run(
      merged.last_file_processed,
      merged.last_timestamp,
      merged.last_run,
      merged.events_total,
      source,
    );
  }
}

// --- Helpers ---

/** If value is a bare date (YYYY-MM-DD), append end-of-day so <= comparison includes the full day */
function endOfDay(value: string): string {
  return value.length === 10 ? `${value}T23:59:59.999` : value;
}

/** Build WHERE clause from date range + optional cross-filters */
function buildWhereClause(
  from: string,
  to: string,
  filters?: WorkEventFilters,
): { where: string; params: unknown[] } {
  const conditions: string[] = ['timestamp >= ?', 'timestamp <= ?'];
  const params: unknown[] = [from, endOfDay(to)];

  if (filters?.agent) {
    conditions.push('agent = ?');
    params.push(filters.agent);
  }
  if (filters?.actor) {
    conditions.push('actor = ?');
    params.push(filters.actor);
  }
  if (filters?.actor_type) {
    conditions.push('actor_type = ?');
    params.push(filters.actor_type);
  }
  if (filters?.action) {
    conditions.push('action = ?');
    params.push(filters.action);
  }
  if (filters?.domain) {
    conditions.push('domain = ?');
    params.push(filters.domain);
  }
  if (filters?.project) {
    conditions.push('project = ?');
    params.push(filters.project);
  }
  if (filters?.value_rating) {
    conditions.push('value_rating = ?');
    params.push(filters.value_rating);
  }
  if (filters?.search) {
    conditions.push('(summary LIKE ? OR task_title LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

// --- Query Functions ---

export function getWorkEvents(filters: WorkEventFilters): {
  events: WorkEventRow[];
  total: number;
} {
  initWorkEventsSchema();
  const db = getDashboardDb();

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.from) {
    conditions.push('timestamp >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push('timestamp <= ?');
    params.push(endOfDay(filters.to));
  }
  if (filters.agent) {
    conditions.push('agent = ?');
    params.push(filters.agent);
  }
  if (filters.actor) {
    conditions.push('actor = ?');
    params.push(filters.actor);
  }
  if (filters.actor_type) {
    conditions.push('actor_type = ?');
    params.push(filters.actor_type);
  }
  if (filters.action) {
    conditions.push('action = ?');
    params.push(filters.action);
  }
  if (filters.domain) {
    conditions.push('domain = ?');
    params.push(filters.domain);
  }
  if (filters.project) {
    conditions.push('project = ?');
    params.push(filters.project);
  }
  if (filters.value_rating) {
    conditions.push('value_rating = ?');
    params.push(filters.value_rating);
  }
  if (filters.search) {
    conditions.push('(summary LIKE ? OR task_title LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM work_events ${where}`)
    .get(...params) as { count: number };
  const total = countRow.count;

  const orderBy =
    filters.sort === 'timestamp_asc' ? 'ORDER BY timestamp ASC' : 'ORDER BY timestamp DESC';
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;

  const events = db
    .prepare(`SELECT * FROM work_events ${where} ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as WorkEventRow[];

  return { events, total };
}

export function getWorkEventsSummary(
  from: string,
  to: string,
  filters?: WorkEventFilters,
): WorkEventsSummary {
  initWorkEventsSchema();
  const db = getDashboardDb();

  const { where, params } = buildWhereClause(from, to, filters);

  const totalRow = db
    .prepare(`SELECT COUNT(*) as count FROM work_events ${where}`)
    .get(...params) as { count: number };

  const byAction = groupCount(db, 'action', where, params);
  const byAgent = groupCount(db, 'agent', where, params);
  const byActor = groupCount(db, 'actor', where, params);
  const byDomain = groupCount(db, 'domain', where, params);
  const byProject = groupCount(db, 'project', where, params);
  const byActorType = groupCount(db, 'actor_type', where, params);

  const valueRows = db
    .prepare(
      `
    SELECT
      COALESCE(value_rating, 'unrated') as rating,
      COUNT(*) as count
    FROM work_events ${where}
    GROUP BY rating
  `,
    )
    .all(...params) as { rating: string; count: number }[];

  const value_breakdown = { high: 0, medium: 0, low: 0, unrated: 0 };
  for (const row of valueRows) {
    if (row.rating in value_breakdown) {
      value_breakdown[row.rating as keyof typeof value_breakdown] = row.count;
    } else {
      value_breakdown.unrated += row.count;
    }
  }

  return {
    total_events: totalRow.count,
    by_action: byAction,
    by_agent: byAgent,
    by_actor: byActor,
    by_domain: byDomain,
    by_project: byProject,
    by_actor_type: byActorType,
    value_breakdown,
  };
}

function groupCount(
  db: ReturnType<typeof getDashboardDb>,
  column: string,
  where: string,
  params: unknown[],
): Record<string, number> {
  const rows = db
    .prepare(
      `SELECT ${column} as key, COUNT(*) as count FROM work_events ${where} GROUP BY ${column}`,
    )
    .all(...params) as { key: string | null; count: number }[];
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (row.key != null) {
      result[row.key] = row.count;
    }
  }
  return result;
}

export function getWorkEventsChartData(
  from: string,
  to: string,
  groupBy: string,
  filters?: WorkEventFilters,
): ChartDataPoint[] {
  initWorkEventsSchema();
  const db = getDashboardDb();

  const { where, params } = buildWhereClause(from, to, filters);

  if (groupBy === 'date') {
    const rows = db
      .prepare(
        `
      SELECT DATE(timestamp) as label, COUNT(*) as value
      FROM work_events ${where}
      GROUP BY DATE(timestamp)
      ORDER BY label ASC
    `,
      )
      .all(...params) as ChartDataPoint[];
    return rows;
  }

  // Validate column name against allowlist to prevent SQL injection
  const allowedColumns = [
    'agent',
    'actor',
    'actor_type',
    'action',
    'domain',
    'project',
    'value_rating',
    'stage_from',
    'stage_to',
  ];
  if (!allowedColumns.includes(groupBy)) {
    return [];
  }

  const rows = db
    .prepare(
      `
    SELECT ${groupBy} as label, COUNT(*) as value
    FROM work_events ${where}
    GROUP BY ${groupBy}
    ORDER BY value DESC
  `,
    )
    .all(...params) as ChartDataPoint[];

  return rows.filter((r) => r.label != null);
}
