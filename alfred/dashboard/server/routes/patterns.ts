import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as yamlLoad, dump as yamlDump } from 'js-yaml';

const PERSONAS_DIR =
  process.env.PERSONAS_DIR ||
  resolve(process.env.HOME!, 'AIProjects/.claude/jobs/personas');

const RESULTS_DIR =
  process.env.TASK_REVIEWER_RESULTS_DIR ||
  resolve(
    process.env.HOME!,
    'AIProjects/.claude/agent-output/results/task-reviewer',
  );

interface PatternEntry {
  name: string;
  persona: string;
  description: string;
  conditions: string[];
  action: string;
  confidence: string;
  risk: string;
  note?: string;
  source?: string;
  enabled: boolean;
  defer_duration?: string;
}

interface NegativeRule {
  index: number;
  persona: string;
  rule: string;
  enabled: boolean;
}

interface PatternStats {
  pattern_name: string;
  hit_count: number;
  last_fired: string | null;
  agreed_count: number;
  wrong_count: number;
  adjust_count: number;
}

function loadPatternsForPersona(persona: string): {
  patterns: PatternEntry[];
  negativeRules: NegativeRule[];
  raw: Record<string, unknown>;
} {
  const filePath = resolve(PERSONAS_DIR, persona, 'learned-patterns.yaml');
  if (!existsSync(filePath)) {
    return { patterns: [], negativeRules: [], raw: {} };
  }

  const content = readFileSync(filePath, 'utf-8');
  const data = yamlLoad(content) as Record<string, unknown>;

  const patterns: PatternEntry[] = [];
  const rawPatterns = (data.patterns || {}) as Record<string, Record<string, unknown>>;
  for (const [name, p] of Object.entries(rawPatterns)) {
    patterns.push({
      name,
      persona,
      description: (p.description as string) || '',
      conditions: (p.conditions as string[]) || [],
      action: (p.action as string) || 'unknown',
      confidence: (p.confidence as string) || 'medium',
      risk: (p.risk as string) || 'safe',
      note: p.note as string | undefined,
      source: p.source as string | undefined,
      enabled: p.enabled !== false,
      defer_duration: p.defer_duration as string | undefined,
    });
  }

  const negativeRules: NegativeRule[] = [];
  const rawNegatives = (data.negative_rules || []) as (string | Record<string, unknown>)[];
  rawNegatives.forEach((rule, index) => {
    if (typeof rule === 'string') {
      negativeRules.push({ index, persona, rule, enabled: true });
    } else if (typeof rule === 'object' && rule !== null) {
      negativeRules.push({
        index,
        persona,
        rule: ((rule as Record<string, unknown>).rule as string) || String(rule),
        enabled: (rule as Record<string, unknown>).enabled !== false,
      });
    }
  });

  return { patterns, negativeRules, raw: data };
}

function savePatternsForPersona(persona: string, raw: Record<string, unknown>): void {
  const filePath = resolve(PERSONAS_DIR, persona, 'learned-patterns.yaml');
  const content = yamlDump(raw, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  writeFileSync(filePath, content);
}

function getDecisionStats(): Map<string, PatternStats> {
  const statsMap = new Map<string, PatternStats>();

  // Read all decision log files from last 30 days
  if (!existsSync(RESULTS_DIR)) return statsMap;

  const files = readdirSync(RESULTS_DIR)
    .filter(
      (f) =>
        f.endsWith('.jsonl') &&
        !f.startsWith('feedback') &&
        !f.startsWith('approved') &&
        !f.startsWith('summary'),
    )
    .sort()
    .slice(-30); // Last 30 daily files

  for (const file of files) {
    try {
      const content = readFileSync(resolve(RESULTS_DIR, file), 'utf-8');
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const entry = JSON.parse(line);
          const patternName = entry.pattern_matched;
          if (!patternName) continue;

          let stats = statsMap.get(patternName);
          if (!stats) {
            stats = {
              pattern_name: patternName,
              hit_count: 0,
              last_fired: null,
              agreed_count: 0,
              wrong_count: 0,
              adjust_count: 0,
            };
            statsMap.set(patternName, stats);
          }
          stats.hit_count++;
          if (!stats.last_fired || entry.timestamp > stats.last_fired) {
            stats.last_fired = entry.timestamp;
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Future: overlay feedback stats by cross-referencing task_id in feedback.jsonl
  // with pattern_matched in decision logs. Requires AI David to consistently log pattern_matched.

  return statsMap;
}

export async function patternRoutes(app: FastifyInstance) {
  // GET /api/patterns — list all patterns across all personas (or filtered)
  app.get('/api/patterns', async (request) => {
    const { persona } = request.query as { persona?: string };

    const allPatterns: PatternEntry[] = [];
    const allNegativeRules: NegativeRule[] = [];

    if (persona) {
      const result = loadPatternsForPersona(persona);
      allPatterns.push(...result.patterns);
      allNegativeRules.push(...result.negativeRules);
    } else {
      // Scan all persona directories for learned-patterns.yaml
      if (existsSync(PERSONAS_DIR)) {
        const dirs = readdirSync(PERSONAS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory() && d.name !== '_template')
          .map((d) => d.name);

        for (const dir of dirs) {
          const result = loadPatternsForPersona(dir);
          allPatterns.push(...result.patterns);
          allNegativeRules.push(...result.negativeRules);
        }
      }
    }

    return { patterns: allPatterns, negative_rules: allNegativeRules };
  });

  // GET /api/patterns/stats — pattern hit rates from decision logs
  app.get('/api/patterns/stats', async () => {
    const statsMap = getDecisionStats();
    return { stats: Array.from(statsMap.values()) };
  });

  // PUT /api/patterns/:persona/:name — update a pattern (enable/disable, edit fields)
  app.put('/api/patterns/:persona/:name', async (request, reply) => {
    const { persona, name } = request.params as { persona: string; name: string };
    const updates = request.body as Partial<PatternEntry>;

    const { raw } = loadPatternsForPersona(persona);
    const patterns = (raw.patterns || {}) as Record<string, Record<string, unknown>>;

    if (!patterns[name]) {
      return reply.status(404).send({ error: `Pattern "${name}" not found in ${persona}` });
    }

    // Apply updates
    if (updates.enabled !== undefined) patterns[name].enabled = updates.enabled;
    if (updates.description !== undefined) patterns[name].description = updates.description;
    if (updates.conditions !== undefined) patterns[name].conditions = updates.conditions;
    if (updates.action !== undefined) patterns[name].action = updates.action;
    if (updates.confidence !== undefined) patterns[name].confidence = updates.confidence;
    if (updates.risk !== undefined) patterns[name].risk = updates.risk;
    if (updates.note !== undefined) patterns[name].note = updates.note;

    raw.patterns = patterns;
    savePatternsForPersona(persona, raw);

    return { ok: true, pattern: patterns[name] };
  });

  // PUT /api/patterns/:persona/negative/:index — update a negative rule
  app.put('/api/patterns/:persona/negative/:index', async (request, reply) => {
    const { persona, index } = request.params as { persona: string; index: string };
    const updates = request.body as { enabled?: boolean; rule?: string };
    const idx = parseInt(index);

    const { raw } = loadPatternsForPersona(persona);
    const negatives = (raw.negative_rules || []) as (string | Record<string, unknown>)[];

    if (idx < 0 || idx >= negatives.length) {
      return reply.status(404).send({ error: `Negative rule index ${idx} out of range` });
    }

    // Convert string rule to object if needed for enable/disable
    const current = negatives[idx];
    if (typeof current === 'string') {
      negatives[idx] = {
        rule: current,
        enabled: updates.enabled !== undefined ? updates.enabled : true,
      };
    } else if (typeof current === 'object' && current !== null) {
      if (updates.enabled !== undefined)
        (current as Record<string, unknown>).enabled = updates.enabled;
      if (updates.rule !== undefined) (current as Record<string, unknown>).rule = updates.rule;
    }

    raw.negative_rules = negatives;
    savePatternsForPersona(persona, raw);

    return { ok: true };
  });

  // GET /api/patterns/feedback-summary — aggregate feedback from AI David
  app.get('/api/patterns/feedback-summary', async () => {
    // Read the feedback_summary from learned-patterns.yaml
    const { raw } = loadPatternsForPersona('task-reviewer');
    const summary = (raw.feedback_summary || {}) as Record<string, unknown>;
    return {
      total_agreed: summary.total_agreed || 0,
      total_wrong: summary.total_wrong || 0,
      total_adjusted: summary.total_adjusted || 0,
      last_feedback_date: summary.last_feedback_date || null,
    };
  });
}
