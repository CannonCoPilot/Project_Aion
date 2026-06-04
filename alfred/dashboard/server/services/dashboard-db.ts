import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

let db: Database.Database | null = null;

export interface PushSubscription {
  id: number;
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
  created_at: string;
  label: string | null;
}

export type MinSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface NotificationPrefs {
  escalations: boolean;
  completions: boolean;
  health_critical: boolean;
  pipeline: boolean;
  min_severity: MinSeverity;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_weekend_start: string | null;
  quiet_hours_weekend_end: string | null;
  timezone: string;
  telegram_enabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  escalations: true,
  completions: false,
  health_critical: true,
  pipeline: true,
  min_severity: 'info',
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_weekend_start: null,
  quiet_hours_weekend_end: null,
  timezone: 'America/Denver',
  telegram_enabled: true,
};

export function getDashboardDb(): Database.Database {
  if (!db) {
    mkdirSync(dirname(config.dashboardDbPath), { recursive: true });
    db = new Database(config.dashboardDbPath);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      label TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS notification_prefs (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      escalations INTEGER NOT NULL DEFAULT 1,
      completions INTEGER NOT NULL DEFAULT 0,
      health_critical INTEGER NOT NULL DEFAULT 1,
      quiet_hours_start TEXT,
      quiet_hours_end TEXT
    )
  `,
  ).run();

  db.prepare('INSERT OR IGNORE INTO notification_prefs (id) VALUES (1)').run();

  // Migrations: add columns if missing
  const cols = db.prepare('PRAGMA table_info(notification_prefs)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'pipeline')) {
    db.prepare(
      'ALTER TABLE notification_prefs ADD COLUMN pipeline INTEGER NOT NULL DEFAULT 1',
    ).run();
  }
  if (!cols.some((c) => c.name === 'min_severity')) {
    db.prepare(
      "ALTER TABLE notification_prefs ADD COLUMN min_severity TEXT NOT NULL DEFAULT 'info'",
    ).run();
  }
  if (!cols.some((c) => c.name === 'quiet_hours_weekend_start')) {
    db.prepare('ALTER TABLE notification_prefs ADD COLUMN quiet_hours_weekend_start TEXT').run();
  }
  if (!cols.some((c) => c.name === 'quiet_hours_weekend_end')) {
    db.prepare('ALTER TABLE notification_prefs ADD COLUMN quiet_hours_weekend_end TEXT').run();
  }
  if (!cols.some((c) => c.name === 'timezone')) {
    db.prepare(
      "ALTER TABLE notification_prefs ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Denver'",
    ).run();
  }
  if (!cols.some((c) => c.name === 'telegram_enabled')) {
    db.prepare(
      'ALTER TABLE notification_prefs ADD COLUMN telegram_enabled INTEGER NOT NULL DEFAULT 1',
    ).run();
  }

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT,
      domain TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      correction TEXT NOT NULL,
      context TEXT,
      persona TEXT,
      job TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS rule_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      domain TEXT NOT NULL,
      condition_text TEXT NOT NULL,
      action_text TEXT NOT NULL,
      based_on_corrections TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS dashboard_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  ).run();

  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS notification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'pipeline',
      severity TEXT NOT NULL DEFAULT 'info',
      url TEXT,
      task_id TEXT,
      source TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  ).run();

  db.prepare(
    `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notification_history(read, created_at DESC)`,
  ).run();

  // Seed default settings
  db.prepare(
    `INSERT OR IGNORE INTO dashboard_settings (key, value) VALUES ('archive_days', '7')`,
  ).run();
}

export function addSubscription(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  label?: string,
): PushSubscription {
  const db = getDashboardDb();
  db.prepare(
    `INSERT OR REPLACE INTO push_subscriptions (endpoint, keys_p256dh, keys_auth, label, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
  ).run(endpoint, keys.p256dh, keys.auth, label ?? null);

  return db
    .prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?')
    .get(endpoint) as PushSubscription;
}

export function removeSubscription(endpoint: string): void {
  const db = getDashboardDb();
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

export function getAllSubscriptions(): PushSubscription[] {
  const db = getDashboardDb();
  return db
    .prepare('SELECT * FROM push_subscriptions ORDER BY created_at DESC')
    .all() as PushSubscription[];
}

export function getNotificationPrefs(): NotificationPrefs {
  const db = getDashboardDb();
  const row = db.prepare('SELECT * FROM notification_prefs WHERE id = 1').get() as
    | Record<string, unknown>
    | undefined;
  if (!row) return DEFAULT_PREFS;
  return {
    escalations: Boolean(row.escalations),
    completions: Boolean(row.completions),
    health_critical: Boolean(row.health_critical),
    pipeline: row.pipeline !== undefined ? Boolean(row.pipeline) : true,
    min_severity: (row.min_severity as MinSeverity) || 'info',
    quiet_hours_start: row.quiet_hours_start as string | null,
    quiet_hours_end: row.quiet_hours_end as string | null,
    quiet_hours_weekend_start: row.quiet_hours_weekend_start as string | null,
    quiet_hours_weekend_end: row.quiet_hours_weekend_end as string | null,
    timezone: (row.timezone as string) || 'America/Denver',
    telegram_enabled: row.telegram_enabled !== undefined ? Boolean(row.telegram_enabled) : true,
  };
}

export function updateNotificationPrefs(prefs: Partial<NotificationPrefs>): NotificationPrefs {
  const db = getDashboardDb();
  const current = getNotificationPrefs();
  const merged = { ...current, ...prefs };

  db.prepare(
    `UPDATE notification_prefs SET
      escalations = ?, completions = ?, health_critical = ?, pipeline = ?,
      min_severity = ?, quiet_hours_start = ?, quiet_hours_end = ?,
      quiet_hours_weekend_start = ?, quiet_hours_weekend_end = ?,
      timezone = ?, telegram_enabled = ?
     WHERE id = 1`,
  ).run(
    merged.escalations ? 1 : 0,
    merged.completions ? 1 : 0,
    merged.health_critical ? 1 : 0,
    merged.pipeline ? 1 : 0,
    merged.min_severity,
    merged.quiet_hours_start,
    merged.quiet_hours_end,
    merged.quiet_hours_weekend_start,
    merged.quiet_hours_weekend_end,
    merged.timezone,
    merged.telegram_enabled ? 1 : 0,
  );

  return merged;
}

// --- Corrections ---

export interface Correction {
  id: number;
  rule_id: string | null;
  domain: string;
  action_taken: string;
  correction: string;
  context: string | null;
  persona: string | null;
  job: string | null;
  created_at: string;
}

export function addCorrection(c: Omit<Correction, 'id' | 'created_at'>): Correction {
  const db = getDashboardDb();
  const info = db
    .prepare(
      `INSERT INTO corrections (rule_id, domain, action_taken, correction, context, persona, job)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(c.rule_id, c.domain, c.action_taken, c.correction, c.context, c.persona, c.job);
  return db
    .prepare('SELECT * FROM corrections WHERE id = ?')
    .get(info.lastInsertRowid) as Correction;
}

export function getCorrections(limit = 50, domain?: string): Correction[] {
  const db = getDashboardDb();
  if (domain) {
    return db
      .prepare('SELECT * FROM corrections WHERE domain = ? ORDER BY created_at DESC LIMIT ?')
      .all(domain, limit) as Correction[];
  }
  return db
    .prepare('SELECT * FROM corrections ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Correction[];
}

export function getCorrectionStats(): { domain: string; count: number }[] {
  const db = getDashboardDb();
  return db
    .prepare(
      'SELECT domain, COUNT(*) as count FROM corrections GROUP BY domain ORDER BY count DESC',
    )
    .all() as { domain: string; count: number }[];
}

// --- Rule Suggestions ---

export interface RuleSuggestion {
  id: number;
  title: string;
  domain: string;
  condition_text: string;
  action_text: string;
  based_on_corrections: string | null;
  confidence: number;
  status: string;
  created_at: string;
}

export function addRuleSuggestion(
  s: Omit<RuleSuggestion, 'id' | 'created_at' | 'status'>,
): RuleSuggestion {
  const db = getDashboardDb();
  const info = db
    .prepare(
      `INSERT INTO rule_suggestions (title, domain, condition_text, action_text, based_on_corrections, confidence)
     VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(s.title, s.domain, s.condition_text, s.action_text, s.based_on_corrections, s.confidence);
  return db
    .prepare('SELECT * FROM rule_suggestions WHERE id = ?')
    .get(info.lastInsertRowid) as RuleSuggestion;
}

export function getRuleSuggestions(status = 'pending'): RuleSuggestion[] {
  const db = getDashboardDb();
  if (status === 'all') {
    return db
      .prepare('SELECT * FROM rule_suggestions ORDER BY created_at DESC')
      .all() as RuleSuggestion[];
  }
  return db
    .prepare('SELECT * FROM rule_suggestions WHERE status = ? ORDER BY created_at DESC')
    .all(status) as RuleSuggestion[];
}

export function updateRuleSuggestionStatus(id: number, status: string): void {
  const db = getDashboardDb();
  db.prepare('UPDATE rule_suggestions SET status = ? WHERE id = ?').run(status, id);
}

// --- Dashboard Settings ---

export interface DashboardSettings {
  archive_days: number;
  work_aggregator_interval_minutes: number;
}

const SETTINGS_DEFAULTS: Record<string, string> = {
  archive_days: '7',
  work_aggregator_interval_minutes: '5',
};

export function getSetting(key: string): string {
  const db = getDashboardDb();
  const row = db.prepare('SELECT value FROM dashboard_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? SETTINGS_DEFAULTS[key] ?? '';
}

export function setSetting(key: string, value: string): void {
  const db = getDashboardDb();
  db.prepare(
    `INSERT INTO dashboard_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value);
}

export function getAllSettings(): DashboardSettings {
  return {
    archive_days: parseInt(getSetting('archive_days'), 10) || 7,
    work_aggregator_interval_minutes:
      parseInt(getSetting('work_aggregator_interval_minutes'), 10) || 5,
  };
}

export function updateSettings(settings: Partial<DashboardSettings>): DashboardSettings {
  if (settings.archive_days != null) {
    setSetting('archive_days', String(Math.max(1, Math.floor(settings.archive_days))));
  }
  if (settings.work_aggregator_interval_minutes != null) {
    setSetting(
      'work_aggregator_interval_minutes',
      String(Math.max(1, Math.floor(settings.work_aggregator_interval_minutes))),
    );
  }
  return getAllSettings();
}

// --- Notification History ---

export interface NotificationHistoryItem {
  id: number;
  title: string;
  body: string;
  category: string;
  severity: string;
  url: string | null;
  task_id: string | null;
  source: string | null;
  read: boolean;
  created_at: string;
}

export function addNotificationHistory(n: {
  title: string;
  body: string;
  category: string;
  severity?: string;
  url?: string;
  task_id?: string;
  source?: string;
}): NotificationHistoryItem {
  const db = getDashboardDb();
  const info = db
    .prepare(
      `INSERT INTO notification_history (title, body, category, severity, url, task_id, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      n.title,
      n.body,
      n.category,
      n.severity ?? 'info',
      n.url ?? null,
      n.task_id ?? null,
      n.source ?? null,
    );
  const row = db
    .prepare('SELECT * FROM notification_history WHERE id = ?')
    .get(info.lastInsertRowid) as Record<string, unknown>;
  return { ...row, read: Boolean(row.read) } as NotificationHistoryItem;
}

const SEVERITY_ORDER: Record<string, number> = { info: 0, warn: 1, error: 2, critical: 3 };
const SEVERITY_LEVELS = ['info', 'warn', 'error', 'critical'];

function getSeverityFilter(): string[] {
  const prefs = getNotificationPrefs();
  const minLevel = SEVERITY_ORDER[prefs.min_severity] ?? 0;
  return SEVERITY_LEVELS.filter((s) => (SEVERITY_ORDER[s] ?? 0) >= minLevel);
}

export function getNotificationHistory(limit = 50, unreadOnly = false): NotificationHistoryItem[] {
  const db = getDashboardDb();
  const allowed = getSeverityFilter();
  const placeholders = allowed.map(() => '?').join(',');
  const where = unreadOnly
    ? `WHERE read = 0 AND severity IN (${placeholders})`
    : `WHERE severity IN (${placeholders})`;
  const sql = `SELECT * FROM notification_history ${where} ORDER BY created_at DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...allowed, limit) as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, read: Boolean(r.read) }) as NotificationHistoryItem);
}

export function getUnreadCount(): number {
  const db = getDashboardDb();
  const allowed = getSeverityFilter();
  const placeholders = allowed.map(() => '?').join(',');
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM notification_history WHERE read = 0 AND severity IN (${placeholders})`,
    )
    .get(...allowed) as { count: number };
  return row.count;
}

export function markNotificationRead(id: number): void {
  const db = getDashboardDb();
  db.prepare('UPDATE notification_history SET read = 1 WHERE id = ?').run(id);
}

export function markAllNotificationsRead(): void {
  const db = getDashboardDb();
  db.prepare('UPDATE notification_history SET read = 1 WHERE read = 0').run();
}

export function closeDashboardDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
