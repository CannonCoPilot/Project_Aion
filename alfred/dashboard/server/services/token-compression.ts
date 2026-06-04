import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';

/**
 * Token Compression Metrics Service
 *
 * Parses session-metrics.jsonl, computes aggregated statistics,
 * and surfaces trend and phase-level details for API consumption.
 *
 * Caching: results are cached for 30 seconds (CACHE_TTL_MS) to avoid
 * re-parsing on every dashboard poll.
 *
 * Data source: session-metrics.jsonl (one JSON object per line).
 * Events: review_start, pipeline_health_check, compression_test,
 *         quality_validation, review_complete.
 */

// ---------------------------------------------------------------------------
// Raw JSONL types
// ---------------------------------------------------------------------------

export interface SessionMetric {
  timestamp: string;
  session_id?: string;
  task_id?: string;
  task_title?: string;
  phase?: string;
  event: string;
  reviewer?: string;
  project?: string;
  // pipeline_health_check
  pipeline_health_log_exists?: boolean;
  watchdog_data_available?: boolean;
  watchdog_data_period_hours?: number;
  // compression_test
  strategies_tested?: number;
  strategies_available?: number;
  strategies_planned?: number;
  implementation_complete?: boolean;
  baseline_tokens_estimated?: number;
  compression_ratio_measured?: number | null;
  compression_ratio_target?: number;
  // quality_validation
  pipeline_routing?: string;
  compression_quality?: string;
  label_integrity?: string;
  health_score?: number;
  issues_found?: number;
  issues_critical?: number;
  issues_high?: number;
  issues_medium?: number;
  // review_complete
  result?: string;
  report_path?: string;
  recommendation?: string;
}

// ---------------------------------------------------------------------------
// Aggregated stats types
// ---------------------------------------------------------------------------

export interface AggregatedStats {
  /** Number of unique session IDs in the file. */
  totalSessions: number;
  /** Total number of parsed metric events. */
  totalEvents: number;
  /** Unique project names observed across all events. */
  projects: string[];
  /** Average health_score across all quality_validation events (0 if none). */
  avgHealthScore: number;
  /** Average compression_ratio_measured across compression_test events, or null if unavailable. */
  avgCompressionRatio: number | null;
  /** Sum of issues_found across all quality_validation events. */
  totalIssuesFound: number;
  /** Issue counts broken out by severity. */
  issuesByLevel: { critical: number; high: number; medium: number };
  /** Sum of strategies_tested across all compression_test events. */
  strategiesTestedTotal: number;
  /** Sum of strategies_available across all compression_test events. */
  strategiesAvailableTotal: number;
  /** Count of review_complete events grouped by result value (e.g. "VALIDATED_INCOMPLETE"). */
  reviewResults: Record<string, number>;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Trend types
// ---------------------------------------------------------------------------

export interface TrendPoint {
  /** Local date string in YYYY-MM-DD format. */
  date: string;
  /** Number of review_start events on this date. */
  sessions: number;
  /** Average health_score from quality_validation events on this date (0 if none). */
  avgHealthScore: number;
  /** Total issues_found from quality_validation events on this date. */
  issuesFound: number;
  /** Average compression_ratio_measured from compression_test events on this date, or null. */
  compressionRatio: number | null;
}

// ---------------------------------------------------------------------------
// Phase detail types
// ---------------------------------------------------------------------------

export interface CompressionTestDetail {
  sessionId: string;
  taskId?: string;
  timestamp: string;
  strategiesTested: number;
  strategiesAvailable: number;
  strategiesPlanned: number;
  baselineTokensEstimated?: number;
  compressionRatioMeasured: number | null;
  compressionRatioTarget: number;
  implementationComplete: boolean;
}

export interface QualityValidationDetail {
  sessionId: string;
  taskId?: string;
  timestamp: string;
  pipelineRouting: string;
  compressionQuality: string;
  labelIntegrity: string;
  healthScore: number;
  issuesFound: number;
  issuesCritical: number;
  issuesHigh: number;
  issuesMedium: number;
}

export interface ReviewCompletionDetail {
  sessionId: string;
  taskId?: string;
  timestamp: string;
  result: string;
  reportPath?: string;
  recommendation?: string;
}

export interface PhaseDetails {
  /** Per-phase event counts and unique event type names. */
  phases: Record<string, { eventCount: number; eventTypes: string[] }>;
  /** Parsed compression_test events. */
  compressionTests: CompressionTestDetail[];
  /** Parsed quality_validation events. */
  qualityValidations: QualityValidationDetail[];
  /** Parsed review_complete events. */
  reviewCompletions: ReviewCompletionDetail[];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  ts: number;
  value: T;
}

const CACHE_TTL_MS = 30_000;

let statsCache: CacheEntry<AggregatedStats> | null = null;
let trendsCache: CacheEntry<TrendPoint[]> | null = null;
let phaseCache: CacheEntry<PhaseDetails> | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read and parse session-metrics.jsonl.
 *
 * Accepts an optional `filePath` override (useful in tests). Defaults to
 * `config.sessionMetricsPath`.
 *
 * Malformed lines are silently skipped — the file is append-only and a
 * mid-write line may not be valid JSON.
 *
 * @returns Array of parsed SessionMetric objects. Empty array on read failure.
 */
export function readMetricsFile(filePath?: string): SessionMetric[] {
  const path = filePath ?? config.sessionMetricsPath;
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const out: SessionMetric[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line) as SessionMetric);
      } catch {
        // skip malformed / partial line
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Compute aggregated statistics across all metrics events.
 *
 * Results are cached for CACHE_TTL_MS (30 s). Pass a pre-loaded `metrics`
 * array (e.g. from tests) to bypass file I/O and the cache.
 *
 * @param metrics Optional pre-loaded metrics array. When omitted the service
 *   reads from disk and applies caching.
 */
export function aggregateStats(metrics?: SessionMetric[]): AggregatedStats {
  const now = Date.now();

  // Use cache only when called without an explicit metrics array (production path).
  if (!metrics && statsCache && now - statsCache.ts < CACHE_TTL_MS) {
    return statsCache.value;
  }

  const data = metrics ?? readMetricsFile();
  const value = _computeAggregateStats(data);

  if (!metrics) {
    statsCache = { ts: now, value };
  }
  return value;
}

/**
 * Compute per-day trend data.
 *
 * @param days  Number of calendar days to include (default: 30). Events
 *   outside this window are excluded.
 * @param metrics Optional pre-loaded metrics array (bypasses cache).
 */
export function computeTrends(days = 30, metrics?: SessionMetric[]): TrendPoint[] {
  const now = Date.now();

  if (!metrics && trendsCache && now - trendsCache.ts < CACHE_TTL_MS) {
    return trendsCache.value;
  }

  const data = metrics ?? readMetricsFile();
  const value = _computeTrends(data, days);

  if (!metrics) {
    trendsCache = { ts: now, value };
  }
  return value;
}

/**
 * Return structured details for each pipeline phase.
 *
 * @param metrics Optional pre-loaded metrics array (bypasses cache).
 */
export function getPhaseDetails(metrics?: SessionMetric[]): PhaseDetails {
  const now = Date.now();

  if (!metrics && phaseCache && now - phaseCache.ts < CACHE_TTL_MS) {
    return phaseCache.value;
  }

  const data = metrics ?? readMetricsFile();
  const value = _computePhaseDetails(data);

  if (!metrics) {
    phaseCache = { ts: now, value };
  }
  return value;
}

// ---------------------------------------------------------------------------
// Private computation helpers
// ---------------------------------------------------------------------------

function _computeAggregateStats(metrics: SessionMetric[]): AggregatedStats {
  const sessionIds = new Set<string>();
  const projects = new Set<string>();
  const reviewResults: Record<string, number> = {};

  let healthScoreSum = 0;
  let healthScoreCount = 0;
  let compressionRatioSum = 0;
  let compressionRatioCount = 0;
  let totalIssuesFound = 0;
  let issuesCritical = 0;
  let issuesHigh = 0;
  let issuesMedium = 0;
  let strategiesTestedTotal = 0;
  let strategiesAvailableTotal = 0;

  for (const m of metrics) {
    if (m.session_id) sessionIds.add(m.session_id);
    if (m.project) projects.add(m.project);

    switch (m.event) {
      case 'quality_validation':
        if (m.health_score != null) {
          healthScoreSum += m.health_score;
          healthScoreCount++;
        }
        totalIssuesFound += m.issues_found ?? 0;
        issuesCritical += m.issues_critical ?? 0;
        issuesHigh += m.issues_high ?? 0;
        issuesMedium += m.issues_medium ?? 0;
        break;

      case 'compression_test':
        if (m.compression_ratio_measured != null) {
          compressionRatioSum += m.compression_ratio_measured;
          compressionRatioCount++;
        }
        strategiesTestedTotal += m.strategies_tested ?? 0;
        strategiesAvailableTotal += m.strategies_available ?? 0;
        break;

      case 'review_complete':
        if (m.result) {
          reviewResults[m.result] = (reviewResults[m.result] ?? 0) + 1;
        }
        break;
    }
  }

  return {
    totalSessions: sessionIds.size,
    totalEvents: metrics.length,
    projects: [...projects].sort(),
    avgHealthScore: healthScoreCount > 0 ? healthScoreSum / healthScoreCount : 0,
    avgCompressionRatio: compressionRatioCount > 0 ? compressionRatioSum / compressionRatioCount : null,
    totalIssuesFound,
    issuesByLevel: { critical: issuesCritical, high: issuesHigh, medium: issuesMedium },
    strategiesTestedTotal,
    strategiesAvailableTotal,
    reviewResults,
    lastUpdated: new Date().toISOString(),
  };
}

function _computeTrends(metrics: SessionMetric[], days: number): TrendPoint[] {
  const cutoffMs = Date.now() - days * 24 * 3600 * 1000;

  // Filter to the requested window
  const windowed = metrics.filter((m) => {
    const t = Date.parse(m.timestamp);
    return Number.isFinite(t) && t >= cutoffMs;
  });

  interface DayAccumulator {
    sessions: number;
    healthScoreSum: number;
    healthScoreCount: number;
    issuesFound: number;
    compressionRatioSum: number;
    compressionRatioCount: number;
  }

  const byDate = new Map<string, DayAccumulator>();

  for (const m of windowed) {
    const date = toDateStr(m.timestamp);
    const acc = byDate.get(date) ?? {
      sessions: 0,
      healthScoreSum: 0,
      healthScoreCount: 0,
      issuesFound: 0,
      compressionRatioSum: 0,
      compressionRatioCount: 0,
    };

    if (m.event === 'review_start') {
      acc.sessions++;
    } else if (m.event === 'quality_validation') {
      if (m.health_score != null) {
        acc.healthScoreSum += m.health_score;
        acc.healthScoreCount++;
      }
      acc.issuesFound += m.issues_found ?? 0;
    } else if (m.event === 'compression_test' && m.compression_ratio_measured != null) {
      acc.compressionRatioSum += m.compression_ratio_measured;
      acc.compressionRatioCount++;
    }

    byDate.set(date, acc);
  }

  return [...byDate.entries()]
    .map(([date, acc]) => ({
      date,
      sessions: acc.sessions,
      avgHealthScore: acc.healthScoreCount > 0 ? acc.healthScoreSum / acc.healthScoreCount : 0,
      issuesFound: acc.issuesFound,
      compressionRatio:
        acc.compressionRatioCount > 0 ? acc.compressionRatioSum / acc.compressionRatioCount : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function _computePhaseDetails(metrics: SessionMetric[]): PhaseDetails {
  const phases: Record<string, { eventCount: number; eventTypes: Set<string> }> = {};
  const compressionTests: CompressionTestDetail[] = [];
  const qualityValidations: QualityValidationDetail[] = [];
  const reviewCompletions: ReviewCompletionDetail[] = [];

  for (const m of metrics) {
    const phase = m.phase ?? 'unknown';
    if (!phases[phase]) {
      phases[phase] = { eventCount: 0, eventTypes: new Set() };
    }
    phases[phase].eventCount++;
    phases[phase].eventTypes.add(m.event);

    if (m.event === 'compression_test') {
      compressionTests.push({
        sessionId: m.session_id ?? '',
        taskId: m.task_id,
        timestamp: m.timestamp,
        strategiesTested: m.strategies_tested ?? 0,
        strategiesAvailable: m.strategies_available ?? 0,
        strategiesPlanned: m.strategies_planned ?? 0,
        baselineTokensEstimated: m.baseline_tokens_estimated,
        compressionRatioMeasured: m.compression_ratio_measured ?? null,
        compressionRatioTarget: m.compression_ratio_target ?? 0.5,
        implementationComplete: m.implementation_complete ?? false,
      });
    } else if (m.event === 'quality_validation') {
      qualityValidations.push({
        sessionId: m.session_id ?? '',
        taskId: m.task_id,
        timestamp: m.timestamp,
        pipelineRouting: m.pipeline_routing ?? '',
        compressionQuality: m.compression_quality ?? '',
        labelIntegrity: m.label_integrity ?? '',
        healthScore: m.health_score ?? 0,
        issuesFound: m.issues_found ?? 0,
        issuesCritical: m.issues_critical ?? 0,
        issuesHigh: m.issues_high ?? 0,
        issuesMedium: m.issues_medium ?? 0,
      });
    } else if (m.event === 'review_complete') {
      reviewCompletions.push({
        sessionId: m.session_id ?? '',
        taskId: m.task_id,
        timestamp: m.timestamp,
        result: m.result ?? '',
        reportPath: m.report_path,
        recommendation: m.recommendation,
      });
    }
  }

  // Convert eventTypes Sets to sorted arrays for serialisation
  const phasesOut: PhaseDetails['phases'] = {};
  for (const [phase, data] of Object.entries(phases)) {
    phasesOut[phase] = {
      eventCount: data.eventCount,
      eventTypes: [...data.eventTypes].sort(),
    };
  }

  return { phases: phasesOut, compressionTests, qualityValidations, reviewCompletions };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function toDateStr(ts: string): string {
  return new Date(ts).toISOString().slice(0, 10);
}
