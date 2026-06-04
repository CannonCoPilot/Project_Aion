/**
 * work-aggregator.ts — Standalone script that reads agent output files from
 * multiple Nexus sources, normalises them into WorkEvent objects, and upserts
 * them into dashboard.db's work_events table.
 *
 * Compiled to JS and invoked by the Nexus dispatcher every 5 minutes.
 *
 * Usage:  node dist/scripts/work-aggregator.js
 */

import { resolve } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { getDashboardDb } from '../services/dashboard-db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkEvent {
  timestamp: string;
  agent: string;
  actor: string;
  actor_type: string;
  action: string;
  task_id: string | null;
  task_title: string | null;
  summary: string | null;
  domain: string | null;
  project: string | null;
  confidence: number | null;
  value_rating: string | null;
  value_description: string | null;
  quantitative: string | null;
  stage_from: string | null;
  stage_to: string | null;
  source_key: string;
  source_file: string;
}

interface AggregatorState {
  source: string;
  last_file_processed: string | null;
  last_timestamp: string | null;
  events_total: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HOME = process.env.WORKSPACE_DIR || process.cwd();
const AI_PROJECTS = process.env.AIPROJECTS_DIR || resolve(HOME, process.env.DEFAULT_WORKSPACE || 'MyProject');
const AGENT_OUTPUT = process.env.AGENT_OUTPUT_DIR || resolve(AI_PROJECTS, '.claude/agent-output');

const SOURCES: Record<string, string> = {
  'task-reviewer': resolve(AGENT_OUTPUT, 'results/task-reviewer'),
  'task-executor': resolve(AGENT_OUTPUT, 'results/task-executor'),
  'infra-deployer': resolve(AGENT_OUTPUT, 'results/infrastructure-deployer'),
  'task-research': resolve(AGENT_OUTPUT, 'results/task-research'),
  aurora: resolve(AGENT_OUTPUT, 'aurora'),
};

// ---------------------------------------------------------------------------
// Domain lookup via Pulse API (degrades gracefully if unavailable)
// ---------------------------------------------------------------------------

interface TaskLabelMaps {
  domainMap: Map<string, string>;
  projectMap: Map<string, string>;
}

async function buildLabelMaps(): Promise<TaskLabelMaps> {
  const domainMap = new Map<string, string>();
  const projectMap = new Map<string, string>();
  try {
    // PULSE_API_URL includes /api/v1, PULSE_URL is just the base
    const pulseApiBase =
      process.env.PULSE_API_URL ||
      (process.env.PULSE_URL ? `${process.env.PULSE_URL}/api/v1` : null) ||
      'http://host.docker.internal:8700/api/v1';
    // Paginate — Pulse caps at 500 per request
    let offset = 0;
    const limit = 500;
    let hasMore = true;
    while (hasMore) {
      const url = `${pulseApiBase}/tasks?limit=${limit}&offset=${offset}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`Pulse API ${resp.status}`);
      const data = (await resp.json()) as {
        tasks: Array<{ id: string; labels: string[] }>;
        total: number;
      };
      for (const task of data.tasks) {
        for (const label of task.labels ?? []) {
          if (label.startsWith('domain:')) {
            domainMap.set(task.id, label.slice(7));
          } else if (label.startsWith('project:')) {
            projectMap.set(task.id, label.slice(8));
          }
        }
      }
      offset += data.tasks.length;
      hasMore = offset < data.total;
    }
  } catch (err) {
    console.error('[work-aggregator] Could not read labels from Pulse API:', err);
  }
  return { domainMap, projectMap };
}

function backfillNullDomains(domainMap: Map<string, string>): number {
  if (domainMap.size === 0) return 0;
  const db = getDashboardDb();
  const nullDomainRows = db
    .prepare(`SELECT id, task_id FROM work_events WHERE domain IS NULL AND task_id IS NOT NULL`)
    .all() as { id: number; task_id: string }[];
  if (nullDomainRows.length === 0) return 0;
  const updateStmt = db.prepare(`UPDATE work_events SET domain = ? WHERE id = ?`);
  let filled = 0;
  const runBatch = db.transaction(() => {
    for (const row of nullDomainRows) {
      const domain = domainMap.get(row.task_id);
      if (domain) {
        updateStmt.run(domain, row.id);
        filled++;
      }
    }
  });
  runBatch();
  return filled;
}

function backfillNullProjects(projectMap: Map<string, string>): number {
  if (projectMap.size === 0) return 0;
  const db = getDashboardDb();
  const nullProjectRows = db
    .prepare(
      `SELECT id, task_id FROM work_events WHERE (project IS NULL OR project = '') AND task_id IS NOT NULL`,
    )
    .all() as { id: number; task_id: string }[];
  if (nullProjectRows.length === 0) return 0;
  const updateStmt = db.prepare(`UPDATE work_events SET project = ? WHERE id = ?`);
  let filled = 0;
  const runBatch = db.transaction(() => {
    for (const row of nullProjectRows) {
      const project = projectMap.get(row.task_id);
      if (project) {
        updateStmt.run(project, row.id);
        filled++;
      }
    }
  });
  runBatch();
  return filled;
}

// ---------------------------------------------------------------------------
// Schema & DB helpers (inline — this script runs standalone)
// ---------------------------------------------------------------------------

function initWorkEventsSchema(): void {
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
      summary TEXT,
      domain TEXT,
      project TEXT,
      confidence REAL,
      value_rating TEXT,
      value_description TEXT,
      quantitative TEXT,
      source_key TEXT UNIQUE NOT NULL,
      source_file TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  ).run();

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_work_events_timestamp ON work_events(timestamp DESC)`,
  ).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_work_events_agent ON work_events(agent)`).run();
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_work_events_domain ON work_events(domain)`).run();

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
}

function upsertWorkEvents(events: WorkEvent[]): { inserted: number; skipped: number } {
  const db = getDashboardDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO work_events
      (timestamp, agent, actor, actor_type, action, task_id, task_title,
       summary, domain, project, confidence, value_rating, value_description,
       quantitative, stage_from, stage_to, source_key, source_file)
    VALUES
      (@timestamp, @agent, @actor, @actor_type, @action, @task_id, @task_title,
       @summary, @domain, @project, @confidence, @value_rating, @value_description,
       @quantitative, @stage_from, @stage_to, @source_key, @source_file)
  `);

  let inserted = 0;
  let skipped = 0;

  const runBatch = db.transaction((batch: WorkEvent[]) => {
    for (const ev of batch) {
      const info = stmt.run({
        timestamp: ev.timestamp,
        agent: ev.agent,
        actor: ev.actor,
        actor_type: ev.actor_type,
        action: ev.action,
        task_id: ev.task_id,
        task_title: ev.task_title,
        summary: ev.summary,
        domain: ev.domain,
        project: ev.project,
        confidence: ev.confidence,
        value_rating: ev.value_rating,
        value_description: ev.value_description,
        quantitative: ev.quantitative,
        stage_from: ev.stage_from,
        stage_to: ev.stage_to,
        source_key: ev.source_key,
        source_file: ev.source_file,
      });
      if (info.changes > 0) inserted++;
      else skipped++;
    }
  });

  runBatch(events);
  return { inserted, skipped };
}

function getAggregatorState(source: string): AggregatorState | undefined {
  const db = getDashboardDb();
  return db.prepare('SELECT * FROM aggregator_state WHERE source = ?').get(source) as
    | AggregatorState
    | undefined;
}

function updateAggregatorState(
  source: string,
  update: { last_file_processed?: string; last_timestamp?: string; events_total: number },
): void {
  const db = getDashboardDb();
  db.prepare(
    `
    INSERT INTO aggregator_state (source, last_file_processed, last_timestamp, last_run, events_total)
    VALUES (?, ?, ?, datetime('now'), ?)
    ON CONFLICT(source) DO UPDATE SET
      last_file_processed = COALESCE(excluded.last_file_processed, last_file_processed),
      last_timestamp = COALESCE(excluded.last_timestamp, last_timestamp),
      last_run = datetime('now'),
      events_total = excluded.events_total
  `,
  ).run(
    source,
    update.last_file_processed ?? null,
    update.last_timestamp ?? null,
    update.events_total,
  );
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function extractDomain(text: string): string | null {
  const m = text.match(/domain:(\w[\w-]*)/);
  return m ? m[1] : null;
}

function extractProject(text: string): string | null {
  const m = text.match(/project:(\w[\w-]*)/);
  return m ? m[1] : null;
}

function extractQuantitative(summary: string): string | null {
  // Match patterns like "27 unused Docker images", "38 GB reclaimed", "9 tasks verified"
  const patterns = [
    /(\d+(?:\.\d+)?\s*(?:GB|MB|KB|TB)\s+\w+)/i,
    /(\d+\s+(?:unused|removed|deleted|created|updated|verified|processed|completed|images?|tasks?|files?|containers?|volumes?)[\w\s]*)/i,
  ];
  for (const pat of patterns) {
    const m = summary.match(pat);
    if (m) return m[1].trim();
  }
  return null;
}

function safeJsonParse(line: string): unknown | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readJsonlLines(filePath: string): unknown[] {
  const content = readFileSync(filePath, 'utf-8');
  const results: unknown[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = safeJsonParse(trimmed);
    if (parsed !== null) results.push(parsed);
  }
  return results;
}

function readJsonFile(filePath: string): unknown | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function filesAfterWatermark(dir: string, pattern: RegExp, lastFile?: string): string[] {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => pattern.test(f))
      .sort();
  } catch {
    return [];
  }
  if (lastFile) {
    files = files.filter((f) => f > lastFile);
  }
  return files;
}

function extractStageLabel(labels: unknown): string | null {
  if (!Array.isArray(labels)) return null;
  const found = labels.find((l: unknown) => typeof l === 'string' && l.startsWith('stage:'));
  return found ? (found as string).replace('stage:', '') : null;
}

function mapConfidence(level: string | undefined): number | null {
  if (!level) return null;
  const map: Record<string, number> = { high: 0.9, medium: 0.7, low: 0.4 };
  return map[level.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseAiDavid(dir: string, lastFile?: string): WorkEvent[] {
  const files = filesAfterWatermark(dir, /^\d{4}-\d{2}-\d{2}\.jsonl$/, lastFile);
  const events: WorkEvent[] = [];

  const actionMap: Record<string, string> = {
    execute: 'approved',
    'execute-approved': 'approved',
    close: 'completed',
    defer: 'deferred',
    escalate: 'escalated',
    propose: 'proposed',
  };

  for (const file of files) {
    try {
      const lines = readJsonlLines(resolve(dir, file));
      for (const raw of lines) {
        const rec = raw as Record<string, unknown>;
        if (rec.action === 'skip') continue;
        if (rec.task_id === 'FEEDBACK') continue;

        const action = actionMap[rec.action as string] ?? (rec.action as string) ?? 'unknown';
        const reasoning = (rec.reasoning as string) ?? '';
        const timestamp = (rec.timestamp as string) ?? '';
        const taskId = (rec.task_id as string) ?? null;
        const taskTitle = (rec.task_title as string) ?? null;

        let valueRating: string = 'low';
        if (action === 'completed') valueRating = 'medium';
        else if (action === 'approved') valueRating = 'medium';
        else if (action === 'deferred') valueRating = 'low';
        else if (action === 'escalated') valueRating = 'medium';
        else if (action === 'proposed') valueRating = 'medium';

        // If source has explicit value field, check keywords
        if (rec.value && typeof rec.value === 'string') {
          const v = (rec.value as string).toLowerCase();
          if (v.includes('high') || v.includes('critical') || v.includes('important'))
            valueRating = 'high';
          else if (v.includes('low') || v.includes('minor')) valueRating = 'low';
          else valueRating = 'medium';
        }

        const stageFrom = extractStageLabel(rec.labels_removed);
        const stageTo = extractStageLabel(rec.labels_added);

        events.push({
          timestamp,
          agent: 'nexus',
          actor: 'task-reviewer',
          actor_type: 'ai-persona',
          action,
          task_id: taskId,
          task_title: taskTitle,
          summary: reasoning || null,
          domain: extractDomain(reasoning) ?? extractDomain(JSON.stringify(rec)),
          project: extractProject(reasoning) ?? extractProject(JSON.stringify(rec)),
          confidence: mapConfidence(rec.confidence as string | undefined),
          value_rating: valueRating,
          value_description: (rec.value as string) ?? (rec.recommendation as string) ?? null,
          quantitative: null,
          stage_from: stageFrom,
          stage_to: stageTo,
          source_key: `task-reviewer:${timestamp}:${taskId}:${rec.action}`,
          source_file: file,
        });
      }
    } catch (err) {
      console.error(`[work-aggregator] Error parsing task-reviewer/${file}:`, err);
    }
  }

  return events;
}

function parseTaskExecutor(dir: string, lastFile?: string): WorkEvent[] {
  const files = filesAfterWatermark(dir, /^\d{4}-\d{2}-\d{2}.*\.json$/, lastFile);
  const events: WorkEvent[] = [];

  for (const file of files) {
    try {
      const data = readJsonFile(resolve(dir, file)) as Record<string, unknown> | null;
      if (!data) continue;

      const timestamp = (data.timestamp as string) ?? (data.date as string) ?? '';
      const results = (data.results ?? []) as Record<string, unknown>[];
      const skipped = (data.skipped_tasks ?? []) as Record<string, unknown>[];

      for (const r of results) {
        const summary = (r.summary as string) ?? '';
        const status = (r.status as string) ?? 'unknown';
        const quant = extractQuantitative(summary);
        let valueRating = 'low';
        if (status === 'completed' && quant) valueRating = 'high';
        else if (status === 'completed') valueRating = 'medium';

        // Search full record for domain/project labels
        const fullText = JSON.stringify(r);

        events.push({
          timestamp,
          agent: 'nexus',
          actor: 'task-executor',
          actor_type: 'automated-job',
          action: status,
          task_id: (r.id as string) ?? null,
          task_title: (r.title as string) ?? null,
          summary: summary || null,
          domain: extractDomain(fullText),
          project: extractProject(fullText),
          confidence: null,
          value_rating: valueRating,
          value_description: summary || null,
          quantitative: quant,
          stage_from: null,
          stage_to: null,
          source_key: `task-executor:${timestamp}:${r.id}:${status}`,
          source_file: file,
        });
      }

      for (const s of skipped) {
        events.push({
          timestamp,
          agent: 'nexus',
          actor: 'task-executor',
          actor_type: 'automated-job',
          action: 'skipped',
          task_id: (s.id as string) ?? null,
          task_title: (s.title as string) ?? null,
          summary: (s.reason as string) ?? null,
          domain: null,
          project: null,
          confidence: null,
          value_rating: 'low',
          value_description: (s.reason as string) ?? null,
          quantitative: null,
          stage_from: null,
          stage_to: null,
          source_key: `task-executor:${timestamp}:${s.id}:skipped`,
          source_file: file,
        });
      }
    } catch (err) {
      console.error(`[work-aggregator] Error parsing task-executor/${file}:`, err);
    }
  }

  return events;
}

function parseInfraDeployer(dir: string, lastFile?: string): WorkEvent[] {
  const files = filesAfterWatermark(dir, /^\d{4}-\d{2}-\d{2}.*\.json$/, lastFile);
  const events: WorkEvent[] = [];

  for (const file of files) {
    try {
      const data = readJsonFile(resolve(dir, file)) as Record<string, unknown> | null;
      if (!data) continue;

      const timestamp = (data.timestamp as string) ?? (data.date as string) ?? '';
      const results = (data.results ?? []) as Record<string, unknown>[];
      const skipped = (data.skipped_tasks ?? []) as Record<string, unknown>[];

      for (const r of results) {
        const summary = (r.summary as string) ?? '';
        const status = (r.status as string) ?? 'unknown';
        const quant = extractQuantitative(summary);
        let valueRating = 'low';
        if (status === 'completed' && quant) valueRating = 'high';
        else if (status === 'completed') valueRating = 'medium';

        const fullText = JSON.stringify(r);

        events.push({
          timestamp,
          agent: 'nexus',
          actor: 'infra-deployer',
          actor_type: 'automated-job',
          action: status,
          task_id: (r.id as string) ?? null,
          task_title: (r.title as string) ?? null,
          summary: summary || null,
          domain: extractDomain(fullText) ?? 'infrastructure',
          project: extractProject(fullText),
          confidence: null,
          value_rating: valueRating,
          value_description: summary || null,
          quantitative: quant,
          stage_from: null,
          stage_to: null,
          source_key: `infra-deployer:${timestamp}:${r.id}:${status}`,
          source_file: file,
        });
      }

      for (const s of skipped) {
        events.push({
          timestamp,
          agent: 'nexus',
          actor: 'infra-deployer',
          actor_type: 'automated-job',
          action: 'skipped',
          task_id: (s.id as string) ?? null,
          task_title: (s.title as string) ?? null,
          summary: (s.reason as string) ?? null,
          domain: null,
          project: null,
          confidence: null,
          value_rating: 'low',
          value_description: (s.reason as string) ?? null,
          quantitative: null,
          stage_from: null,
          stage_to: null,
          source_key: `infra-deployer:${timestamp}:${s.id}:skipped`,
          source_file: file,
        });
      }
    } catch (err) {
      console.error(`[work-aggregator] Error parsing infra-deployer/${file}:`, err);
    }
  }

  return events;
}

function parseTaskResearch(dir: string, lastFile?: string): WorkEvent[] {
  const files = filesAfterWatermark(dir, /^\d{4}-\d{2}-\d{2}.*\.json$/, lastFile);
  const events: WorkEvent[] = [];

  for (const file of files) {
    try {
      const data = readJsonFile(resolve(dir, file)) as Record<string, unknown> | null;
      if (!data) continue;

      const timestamp = (data.date as string) ?? '';
      const results = (data.results ?? []) as Record<string, unknown>[];

      for (const r of results) {
        const reason = (r.reason as string) ?? '';
        const action = (r.action as string) ?? 'completed';

        events.push({
          timestamp,
          agent: 'nexus',
          actor: 'researcher',
          actor_type: 'automated-job',
          action,
          task_id: (r.id as string) ?? null,
          task_title: (r.title as string) ?? null,
          summary: reason || null,
          domain: extractDomain(reason),
          project: extractProject(reason),
          confidence: null,
          value_rating: 'medium',
          value_description: reason || null,
          quantitative: null,
          stage_from: null,
          stage_to: null,
          source_key: `task-research:${timestamp}:${r.id}:${action}`,
          source_file: file,
        });
      }
    } catch (err) {
      console.error(`[work-aggregator] Error parsing task-research/${file}:`, err);
    }
  }

  return events;
}

function parseAurora(dir: string, lastFile?: string): WorkEvent[] {
  const files = filesAfterWatermark(dir, /^action-.*\.json$/, lastFile);
  const events: WorkEvent[] = [];

  for (const file of files) {
    try {
      const data = readJsonFile(resolve(dir, file)) as Record<string, unknown> | null;
      if (!data) continue;

      const timestamp = (data.timestamp as string) ?? '';
      const tasks = (data.tasks_processed ?? []) as Record<string, unknown>[];

      for (const t of tasks) {
        const status = (t.status as string) ?? 'unknown';
        const mappedAction =
          status === 'completed' ? 'completed' : status === 'blocked' ? 'parked' : status;

        events.push({
          timestamp,
          agent: 'aurora',
          actor: 'aurora-action',
          actor_type: 'automated-job',
          action: mappedAction,
          task_id: (t.task_id as string) ?? null,
          task_title: (t.title as string) ?? null,
          summary: (t.work_done as string) ?? null,
          domain: 'aurora',
          project: 'aurora',
          confidence: null,
          value_rating: mappedAction === 'completed' ? 'medium' : 'low',
          value_description: (t.work_done as string) ?? null,
          quantitative: null,
          stage_from: null,
          stage_to: null,
          source_key: `aurora:${timestamp}:${t.task_id}:${status}`,
          source_file: file,
        });
      }
    } catch (err) {
      console.error(`[work-aggregator] Error parsing aurora/${file}:`, err);
    }
  }

  return events;
}

function parseInteractiveSessions(lastTimestamp?: string): WorkEvent[] {
  const since = lastTimestamp || '2026-03-01';
  let output: string;
  try {
    // Safe: `since` comes from our own DB state (ISO date string), not user input
    output = execSync(`git log --format='%H|%aI|%s' --since='${since}' -- .`, {
      cwd: process.env.GIT_LOG_DIR || AI_PROJECTS,
      encoding: 'utf-8',
      timeout: 10_000,
    });
  } catch {
    console.error('[work-aggregator] Failed to read git log for interactive sessions');
    return [];
  }

  const events: WorkEvent[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 3) continue;
    const commitHash = parts[0];
    const isoDate = parts[1];
    const message = parts.slice(2).join('|');

    // Filter out non-interactive commits
    if (/no interactive work/i.test(message)) continue;
    if (/clean exit/i.test(message)) continue;
    if (/^chore:\s*sync\b/i.test(message.trim())) continue;
    if (/^sync$/i.test(message.trim())) continue;

    // Extract session number if present
    const sessionMatch = message.match(/session\s+(\d+)/i);
    const sessionNum = sessionMatch ? sessionMatch[1] : null;

    // Try to extract domain from commit message keywords
    const domainKeywords: Record<string, string> = {
      infrastructure: 'infrastructure',
      infra: 'infrastructure',
      docker: 'infrastructure',
      nexus: 'nexus',
      dispatcher: 'nexus',
      executor: 'nexus',
      aurora: 'aurora',
      creative: 'creative',
      security: 'security',
      auth: 'security',
      coding: 'coding',
      dashboard: 'coding',
      pulse: 'coding',
    };

    let domain: string | null = null;
    const msgLower = message.toLowerCase();
    for (const [keyword, d] of Object.entries(domainKeywords)) {
      if (msgLower.includes(keyword)) {
        domain = d;
        break;
      }
    }

    events.push({
      timestamp: isoDate,
      agent: 'interactive',
      actor: 'david',
      actor_type: 'hybrid',
      action: 'completed',
      task_id: sessionNum ? `session-${sessionNum}` : null,
      task_title: sessionNum ? `Interactive session ${sessionNum}` : null,
      summary: message,
      domain,
      project: null,
      confidence: null,
      value_rating: 'medium',
      value_description: null,
      quantitative: null,
      stage_from: null,
      stage_to: null,
      source_key: `interactive:${commitHash}`,
      source_file: commitHash,
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Parser registry
// ---------------------------------------------------------------------------

const PARSERS: Record<string, (dir: string, lastFile?: string) => WorkEvent[]> = {
  'task-reviewer': parseAiDavid,
  'task-executor': parseTaskExecutor,
  'infra-deployer': parseInfraDeployer,
  'task-research': parseTaskResearch,
  aurora: parseAurora,
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runWorkAggregator() {
  initWorkEventsSchema();

  // Load label maps from Pulse API for enrichment (degrades gracefully if unavailable)
  const { domainMap, projectMap } = await buildLabelMaps();
  console.log(
    `[work-aggregator] Loaded ${domainMap.size} domain + ${projectMap.size} project labels from Pulse`,
  );

  let totalInserted = 0;
  let totalSkipped = 0;

  // Process each source
  for (const [source, dir] of Object.entries(SOURCES)) {
    const state = getAggregatorState(source);
    const parser = PARSERS[source];
    if (!parser || !existsSync(dir)) continue;

    try {
      const events = parser(dir, state?.last_file_processed ?? undefined);
      // Enrich null domain/project fields from Pulse label map
      for (const ev of events) {
        if (!ev.domain && ev.task_id) {
          ev.domain = domainMap.get(ev.task_id) ?? null;
        }
        if (!ev.project && ev.task_id) {
          ev.project = projectMap.get(ev.task_id) ?? null;
        }
      }
      const { inserted, skipped } = upsertWorkEvents(events);
      totalInserted += inserted;
      totalSkipped += skipped;

      // Update watermark
      if (events.length > 0) {
        const lastEvent = events[events.length - 1];
        updateAggregatorState(source, {
          last_file_processed: lastEvent.source_file,
          last_timestamp: lastEvent.timestamp,
          events_total: (state?.events_total ?? 0) + inserted,
        });
      }
    } catch (err) {
      console.error(`[work-aggregator] Error processing source "${source}":`, err);
    }
  }

  // Interactive sessions (git log based)
  try {
    const interactiveState = getAggregatorState('interactive');
    const interactiveEvents = parseInteractiveSessions(
      interactiveState?.last_timestamp ?? undefined,
    );
    const { inserted: iInserted, skipped: iSkipped } = upsertWorkEvents(interactiveEvents);
    totalInserted += iInserted;
    totalSkipped += iSkipped;
    if (interactiveEvents.length > 0) {
      updateAggregatorState('interactive', {
        last_timestamp: interactiveEvents[interactiveEvents.length - 1].timestamp,
        events_total: (interactiveState?.events_total ?? 0) + iInserted,
      });
    }
  } catch (err) {
    console.error('[work-aggregator] Error processing interactive sessions:', err);
  }

  // Backfill null domains/projects on existing rows using Pulse label map
  const backfilledDomains = backfillNullDomains(domainMap);
  if (backfilledDomains > 0) {
    console.log(`[work-aggregator] Backfilled domain on ${backfilledDomains} existing rows`);
  }
  const backfilledProjects = backfillNullProjects(projectMap);
  if (backfilledProjects > 0) {
    console.log(`[work-aggregator] Backfilled project on ${backfilledProjects} existing rows`);
  }

  console.log(
    `[work-aggregator] ${new Date().toISOString()} — inserted: ${totalInserted}, skipped (dedup): ${totalSkipped}`,
  );
}

// Run standalone when invoked directly (node work-aggregator.js)
const isMainModule = process.argv[1]?.endsWith('work-aggregator.js');
if (isMainModule) {
  runWorkAggregator().catch((err) => {
    console.error('[work-aggregator] Fatal error:', err);
    process.exit(1);
  });
}
