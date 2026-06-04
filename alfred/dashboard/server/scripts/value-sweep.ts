/**
 * value-sweep.ts — Enrich work_events.value_rating using Ollama
 *
 * Queries work_events with missing or low value ratings, sends each event
 * to a local Ollama model for scoring, and writes the score + rationale back.
 *
 * Usage: npx tsx server/scripts/value-sweep.ts [--limit N] [--dry-run]
 *
 * Task: AIProjects-j63d (Phase 2 — AI David Value Sweep Job)
 */

import { getDashboardDb } from '../services/dashboard-db.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const OLLAMA_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 50;

interface WorkEventRow {
  id: number;
  timestamp: string;
  agent: string;
  actor: string;
  action: string;
  task_title?: string;
  summary?: string;
  value_description?: string;
  value_rating?: string;
  domain?: string;
  project?: string;
}

interface SweepResult {
  id: number;
  score: number;
  rationale: string;
}

function buildScoringPrompt(event: WorkEventRow): string {
  const parts = [
    `You are evaluating the value of a software development work event.`,
    `Rate the value of the following event on a scale from 0.0 to 1.0, where:`,
    `  0.0 = no meaningful value (noise, trivial, or failed)`,
    `  0.5 = moderate value (progress but not impactful)`,
    `  1.0 = high value (ships features, fixes bugs, improves infrastructure meaningfully)`,
    ``,
    `Event details:`,
    `  Action: ${event.action}`,
    `  Agent: ${event.agent}`,
    event.task_title ? `  Task: ${event.task_title}` : null,
    event.domain ? `  Domain: ${event.domain}` : null,
    event.summary ? `  Summary: ${event.summary}` : null,
    event.value_description ? `  Value description: ${event.value_description}` : null,
    ``,
    `Respond with exactly two lines:`,
    `SCORE: <number between 0.0 and 1.0>`,
    `RATIONALE: <one sentence explaining the score>`,
  ]
    .filter(Boolean)
    .join('\n');
  return parts;
}

function parseOllamaResponse(raw: string): { score: number; rationale: string } | null {
  const scoreMatch = raw.match(/SCORE:\s*([0-9.]+)/i);
  const rationaleMatch = raw.match(/RATIONALE:\s*(.+)/i);
  if (!scoreMatch || !rationaleMatch) return null;
  const score = parseFloat(scoreMatch[1]);
  if (isNaN(score) || score < 0 || score > 1) return null;
  return { score: Math.round(score * 100) / 100, rationale: rationaleMatch[1].trim() };
}

async function queryOllama(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: 128 },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { response: string };
    return data.response.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function scoreEvent(event: WorkEventRow): Promise<SweepResult | null> {
  const prompt = buildScoringPrompt(event);
  try {
    const raw = await queryOllama(prompt);
    const parsed = parseOllamaResponse(raw);
    if (!parsed) {
      console.warn(
        `  [WARN] Could not parse Ollama response for id=${event.id}: ${raw.slice(0, 80)}`,
      );
      return null;
    }
    return { id: event.id, score: parsed.score, rationale: parsed.rationale };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('abort') || msg.includes('timeout')) {
      console.warn(`  [WARN] Ollama timeout for id=${event.id} — skipping`);
    } else {
      console.warn(`  [WARN] Ollama error for id=${event.id}: ${msg}`);
    }
    return null;
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : DEFAULT_LIMIT;

  const db = getDashboardDb();

  // Ensure value_notes column exists (idempotent migration)
  try {
    db.prepare('ALTER TABLE work_events ADD COLUMN value_notes TEXT').run();
  } catch {
    /* already exists */
  }

  const rows = db
    .prepare(
      `
    SELECT id, timestamp, agent, actor, action, task_title, summary,
           value_description, value_rating, domain, project
    FROM work_events
    WHERE value_rating IS NULL OR CAST(value_rating AS REAL) < 0.5
    ORDER BY timestamp DESC
    LIMIT ?
  `,
    )
    .all(limit) as WorkEventRow[];

  console.log(
    `value-sweep: found ${rows.length} events to score (limit=${limit}, dry-run=${isDryRun})`,
  );

  if (rows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const updateStmt = db.prepare(
    'UPDATE work_events SET value_rating = ?, value_notes = ? WHERE id = ?',
  );

  let scored = 0;
  let skipped = 0;

  for (const event of rows) {
    process.stdout.write(`  Scoring id=${event.id} (${event.action})... `);
    const result = await scoreEvent(event);
    if (!result) {
      skipped++;
      continue;
    }
    console.log(`score=${result.score} — ${result.rationale}`);
    if (!isDryRun) {
      updateStmt.run(String(result.score), result.rationale, event.id);
    }
    scored++;
  }

  console.log(
    `\nDone: ${scored} scored, ${skipped} skipped${isDryRun ? ' (dry-run, no writes)' : ''}.`,
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
