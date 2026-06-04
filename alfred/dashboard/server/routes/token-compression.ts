/**
 * Token-compression metrics routes.
 *
 * Reads from the JSONL metrics file written by the RTK token-compression
 * hook and exposes three read-only endpoints:
 *
 *   GET /api/token-compression/stats   — aggregate statistics
 *   GET /api/token-compression/events  — recent events (paginated)
 *   GET /api/token-compression/phases  — per-phase breakdown
 *
 * Data source: config.tokenCompressionMetricsPath (JSONL, one JSON object per line).
 */

import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'node:fs';
import { config } from '../config.js';
import type {
  TokenCompressionEvent,
  TokenCompressionStats,
  TokenCompressionPhaseMetrics,
} from '../types.js';

// ── File parsing ──────────────────────────────────────────────────────────────

function readEvents(): TokenCompressionEvent[] {
  const filePath = config.tokenCompressionMetricsPath;
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as TokenCompressionEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is TokenCompressionEvent => e !== null);
  } catch {
    return [];
  }
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function computeStats(events: TokenCompressionEvent[]): TokenCompressionStats {
  const byTechnique: Record<
    string,
    { events: number; savings: number; ratioSum: number }
  > = {};

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCompressedTokens = 0;
  let totalSavings = 0;
  let ratioSum = 0;

  for (const e of events) {
    totalInputTokens += e.input_tokens ?? 0;
    totalOutputTokens += e.output_tokens ?? 0;
    totalCompressedTokens += e.compressed_tokens ?? 0;
    totalSavings += e.savings ?? 0;
    ratioSum += e.compression_ratio ?? 0;

    const technique = e.technique ?? 'unknown';
    const acc = byTechnique[technique] ?? { events: 0, savings: 0, ratioSum: 0 };
    acc.events += 1;
    acc.savings += e.savings ?? 0;
    acc.ratioSum += e.compression_ratio ?? 0;
    byTechnique[technique] = acc;
  }

  const techniqueResult: TokenCompressionStats['byTechnique'] = {};
  for (const [technique, acc] of Object.entries(byTechnique)) {
    techniqueResult[technique] = {
      events: acc.events,
      savings: acc.savings,
      avgRatio: acc.events > 0 ? acc.ratioSum / acc.events : 0,
    };
  }

  return {
    totalEvents: events.length,
    totalInputTokens,
    totalOutputTokens,
    totalCompressedTokens,
    totalSavings,
    averageCompressionRatio: events.length > 0 ? ratioSum / events.length : 0,
    byTechnique: techniqueResult,
  };
}

function computePhases(events: TokenCompressionEvent[]): TokenCompressionPhaseMetrics[] {
  const byPhase: Record<
    string,
    { events: number; inputTokens: number; compressedTokens: number; savings: number; ratioSum: number }
  > = {};

  for (const e of events) {
    const phase = e.phase ?? 'unknown';
    const acc = byPhase[phase] ?? {
      events: 0,
      inputTokens: 0,
      compressedTokens: 0,
      savings: 0,
      ratioSum: 0,
    };
    acc.events += 1;
    acc.inputTokens += e.input_tokens ?? 0;
    acc.compressedTokens += e.compressed_tokens ?? 0;
    acc.savings += e.savings ?? 0;
    acc.ratioSum += e.compression_ratio ?? 0;
    byPhase[phase] = acc;
  }

  return Object.entries(byPhase)
    .map(([phase, acc]): TokenCompressionPhaseMetrics => ({
      phase,
      events: acc.events,
      totalInputTokens: acc.inputTokens,
      totalCompressedTokens: acc.compressedTokens,
      totalSavings: acc.savings,
      averageCompressionRatio: acc.events > 0 ? acc.ratioSum / acc.events : 0,
    }))
    .sort((a, b) => b.totalSavings - a.totalSavings);
}

// ── Route registration ────────────────────────────────────────────────────────

export async function tokenCompressionRoutes(app: FastifyInstance) {
  /**
   * GET /api/token-compression/stats
   *
   * Returns aggregate statistics across all recorded compression events.
   *
   * Response: TokenCompressionStats
   */
  app.get('/api/token-compression/stats', async (_request, reply) => {
    const events = readEvents();
    if (!existsSync(config.tokenCompressionMetricsPath) && events.length === 0) {
      return reply.status(404).send({ error: 'Token compression metrics file not found' });
    }
    return computeStats(events);
  });

  /**
   * GET /api/token-compression/events?limit=50&phase=<phase>&technique=<technique>
   *
   * Returns recent compression events, newest first.
   *
   * Query params:
   *   limit     — max events to return (default 50, max 500)
   *   phase     — optional filter by phase name
   *   technique — optional filter by compression technique
   */
  app.get('/api/token-compression/events', async (request) => {
    const { limit, phase, technique } = request.query as {
      limit?: string;
      phase?: string;
      technique?: string;
    };

    const maxEvents = Math.min(parseInt(limit ?? '50', 10), 500);
    let events = readEvents();

    if (phase) {
      events = events.filter((e) => e.phase === phase);
    }
    if (technique) {
      events = events.filter((e) => e.technique === technique);
    }

    // Most recent first
    const recent = events.slice(-maxEvents).reverse();

    return {
      events: recent,
      total: events.length,
      returned: recent.length,
    };
  });

  /**
   * GET /api/token-compression/phases
   *
   * Returns per-phase breakdown of compression metrics, sorted by total
   * token savings descending.
   *
   * Response: { phases: TokenCompressionPhaseMetrics[] }
   */
  app.get('/api/token-compression/phases', async () => {
    const events = readEvents();
    return { phases: computePhases(events) };
  });
}
