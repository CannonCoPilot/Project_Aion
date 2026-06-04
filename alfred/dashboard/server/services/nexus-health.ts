import { readFileSync } from 'node:fs';
import { config } from '../config.js';

/**
 * Nexus Health — per-persona model usage aggregated from cost-ledger.jsonl.
 *
 * Data source: `~/AIProjects/.claude/data/cost-ledger.jsonl` (one JSON line per
 * Nexus job run). Fields used: ts, persona, model, cost, router_overridden,
 * success, duration_s.
 *
 * Introduced 2026-04-08 (AIProjects-5wm6) to surface model router state on
 * the Pulse Dashboard after the u6uh Phase 1+2 router fix.
 */

export interface PersonaModelRow {
  persona: string;
  currentModel: string; // model used in the most recent run in window
  routerOverridden: boolean; // most recent run's flag — true = persona pin authoritative
  runs: number;
  totalCost: number;
  avgCost: number;
  avgDurationS: number;
  successRate: number; // 0..1
  lastRunTs: string;
  modelsUsed: Record<string, number>; // model -> run count in window
}

export interface NexusHealthResponse {
  windowHours: number;
  personas: PersonaModelRow[];
  summary: {
    totalRuns: number;
    totalCost: number;
    avgCostPerJob: number;
    modelMix: Record<string, number>;
    failedRuns: number;
  };
  lastRunTs: string | null;
  lastUpdated: string;
}

interface LedgerEntry {
  ts: string;
  job?: string;
  persona?: string;
  model?: string;
  cost?: number;
  router_overridden?: boolean;
  success?: boolean;
  duration_s?: number;
}

function readCostLedger(): LedgerEntry[] {
  try {
    const content = readFileSync(config.costLedgerPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const out: LedgerEntry[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line) as LedgerEntry);
      } catch {
        // skip malformed line — ledger is append-only, the writer may
        // still be mid-line when we read.
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Simple in-memory cache so dashboard polling doesn't re-parse on every hit.
let cached: { ts: number; windowHours: number; value: NexusHealthResponse } | null = null;
const CACHE_TTL_MS = 30_000;

export function getNexusHealth(windowHours = 24): NexusHealthResponse {
  const now = Date.now();
  if (cached && cached.windowHours === windowHours && now - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }

  const cutoffMs = now - windowHours * 3600 * 1000;
  const all = readCostLedger();

  const recent: LedgerEntry[] = [];
  for (const e of all) {
    if (!e.ts || !e.persona) continue;
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    if (t >= cutoffMs) recent.push(e);
  }

  // Aggregate per-persona
  const byPersona = new Map<string, LedgerEntry[]>();
  for (const e of recent) {
    const key = e.persona ?? 'unknown';
    const arr = byPersona.get(key) ?? [];
    arr.push(e);
    byPersona.set(key, arr);
  }

  const personas: PersonaModelRow[] = [];
  for (const [persona, rows] of byPersona) {
    // Newest first so rows[0] is most recent
    rows.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
    const latest = rows[0];
    const totalCost = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
    const successes = rows.filter((r) => r.success === true).length;
    const successRate = rows.length ? successes / rows.length : 0;
    const totalDuration = rows.reduce((s, r) => s + (r.duration_s ?? 0), 0);
    const avgDurationS = rows.length ? totalDuration / rows.length : 0;
    const modelsUsed: Record<string, number> = {};
    for (const r of rows) {
      const m = r.model ?? 'unknown';
      modelsUsed[m] = (modelsUsed[m] ?? 0) + 1;
    }
    personas.push({
      persona,
      currentModel: latest.model ?? 'unknown',
      routerOverridden: latest.router_overridden === true,
      runs: rows.length,
      totalCost,
      avgCost: totalCost / rows.length,
      avgDurationS,
      successRate,
      lastRunTs: latest.ts,
      modelsUsed,
    });
  }
  personas.sort((a, b) => b.totalCost - a.totalCost);

  // Summary
  const totalRuns = recent.length;
  const totalCost = recent.reduce((s, e) => s + (e.cost ?? 0), 0);
  const modelMix: Record<string, number> = {};
  for (const e of recent) {
    const m = e.model ?? 'unknown';
    modelMix[m] = (modelMix[m] ?? 0) + 1;
  }
  const failedRuns = recent.filter((e) => e.success === false).length;

  // Last run overall
  let lastRunTs: string | null = null;
  if (recent.length) {
    lastRunTs = recent.reduce((max, e) => ((e.ts || '') > (max || '') ? e.ts : max), recent[0].ts);
  }

  const value: NexusHealthResponse = {
    windowHours,
    personas,
    summary: {
      totalRuns,
      totalCost,
      avgCostPerJob: totalRuns ? totalCost / totalRuns : 0,
      modelMix,
      failedRuns,
    },
    lastRunTs,
    lastUpdated: new Date().toISOString(),
  };

  cached = { ts: now, windowHours, value };
  return value;
}
