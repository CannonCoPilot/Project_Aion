import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const home = process.env.WORKSPACE_DIR || process.cwd();
const AI_PROJECTS = process.env.AIPROJECTS_DIR || resolve(home, process.env.DEFAULT_WORKSPACE || 'MyProject');
const MEMORY_DIR =
  process.env.MEMORY_DIR || resolve(home, '.claude/projects/-home-user-AIProjects/memory');
const CORTEX_RESULTS =
  process.env.CORTEX_RESULTS_DIR || resolve(AI_PROJECTS, '.claude/agent-output/results/cortex');
const TRAINING_INDEX_DIR = resolve(AI_PROJECTS, '.claude/data/training/index');

// --- Shared helpers (same pattern as findings.ts) ---

function safeReadJsonl(path: string, maxLines = 500): unknown[] {
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    return lines
      .slice(-maxLines)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// --- Staleness types ---

type StalenessTier = 'fresh' | 'aging' | 'stale' | 'critical';

interface StalenessFile {
  path: string;
  category: string;
  lastModified: string;
  stalenessTier: StalenessTier;
  ageInDays: number;
}

function getTier(ageInDays: number): StalenessTier {
  if (ageInDays < 7) return 'fresh';
  if (ageInDays < 30) return 'aging';
  if (ageInDays < 90) return 'stale';
  return 'critical';
}

function scanFiles(dir: string, category: string, pattern?: RegExp): StalenessFile[] {
  if (!existsSync(dir)) return [];
  const results: StalenessFile[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        // Recurse into subdirectories for context docs
        results.push(...scanFiles(fullPath, category, pattern));
      } else if (entry.isFile()) {
        if (pattern && !pattern.test(entry.name)) continue;
        try {
          const stat = statSync(fullPath);
          const ageMs = Date.now() - stat.mtimeMs;
          const ageInDays = Math.floor(ageMs / 86400000);
          results.push({
            path: relative(AI_PROJECTS, fullPath),
            category,
            lastModified: new Date(stat.mtimeMs).toISOString(),
            stalenessTier: getTier(ageInDays),
            ageInDays,
          });
        } catch {
          // skip unreadable files
        }
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return results;
}

function scanSingleFile(filePath: string, category: string): StalenessFile | null {
  if (!existsSync(filePath)) return null;
  try {
    const stat = statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageInDays = Math.floor(ageMs / 86400000);
    return {
      path: relative(AI_PROJECTS, filePath),
      category,
      lastModified: new Date(stat.mtimeMs).toISOString(),
      stalenessTier: getTier(ageInDays),
      ageInDays,
    };
  } catch {
    return null;
  }
}

function scanPersonaPrompts(): StalenessFile[] {
  const personasDir = resolve(AI_PROJECTS, '.claude/jobs/personas');
  if (!existsSync(personasDir)) return [];
  const results: StalenessFile[] = [];
  try {
    const dirs = readdirSync(personasDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory() || d.name.startsWith('_')) continue;
      const promptPath = resolve(personasDir, d.name, 'prompt.md');
      const file = scanSingleFile(promptPath, 'persona');
      if (file) results.push(file);
    }
  } catch {
    // skip
  }
  return results;
}

function scanSkills(): StalenessFile[] {
  const skillsDir = resolve(AI_PROJECTS, '.claude/skills');
  if (!existsSync(skillsDir)) return [];
  const results: StalenessFile[] = [];
  try {
    const dirs = readdirSync(skillsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      // Check SKILL.md first, then prompt.md
      for (const fname of ['SKILL.md', 'prompt.md']) {
        const fpath = resolve(skillsDir, d.name, fname);
        const file = scanSingleFile(fpath, 'skill');
        if (file) {
          results.push(file);
          break; // only count one per skill
        }
      }
    }
  } catch {
    // skip
  }
  return results;
}

function scanMemory(): StalenessFile[] {
  if (!existsSync(MEMORY_DIR)) return [];
  const results: StalenessFile[] = [];
  try {
    const files = readdirSync(MEMORY_DIR).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      const fullPath = resolve(MEMORY_DIR, f);
      try {
        const stat = statSync(fullPath);
        const ageMs = Date.now() - stat.mtimeMs;
        const ageInDays = Math.floor(ageMs / 86400000);
        results.push({
          path: `~/.claude/memory/${f}`,
          category: 'memory',
          lastModified: new Date(stat.mtimeMs).toISOString(),
          stalenessTier: getTier(ageInDays),
          ageInDays,
        });
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  return results;
}

// --- Training stats ---

interface TrainingCapture {
  capture_id: string;
  timestamp: string;
  job_name: string;
  persona: string;
  model_actual: string | null;
  cost_usd: number;
  record_type: string;
  persona_data: Record<string, unknown>;
  quality: {
    human_feedback: string | null;
  };
  input: {
    task_ids: string[];
  };
  result: {
    is_failure: boolean;
  };
}

function loadTrainingCaptures(days: number): TrainingCapture[] {
  if (!existsSync(TRAINING_INDEX_DIR)) return [];
  const all: TrainingCapture[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split('T')[0];
    const filePath = resolve(TRAINING_INDEX_DIR, `captures-${date}.jsonl`);
    const entries = safeReadJsonl(filePath, 2000) as TrainingCapture[];
    all.push(...entries);
  }
  return all;
}

// --- Velocity helpers ---

function countRecentlyModified(dir: string, pattern: RegExp, days: number): number {
  if (!existsSync(dir)) return 0;
  const cutoff = Date.now() - days * 86400000;
  let count = 0;
  try {
    const walk = (d: string) => {
      const entries = readdirSync(d, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = resolve(d, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          try {
            if (statSync(fullPath).mtimeMs > cutoff) count++;
          } catch {
            // skip
          }
        }
      }
    };
    walk(dir);
  } catch {
    // skip
  }
  return count;
}

// --- Route registration ---

export async function cortexRoutes(app: FastifyInstance) {
  // GET /api/cortex/staleness — Knowledge freshness scan
  app.get('/api/cortex/staleness', async () => {
    try {
      const files: StalenessFile[] = [];

      // Context docs
      files.push(...scanFiles(resolve(AI_PROJECTS, '.claude/context'), 'context', /\.md$/));

      // Project docs
      files.push(...scanFiles(resolve(AI_PROJECTS, 'knowledge/projects'), 'project', /\.md$/));

      // Persona prompts
      files.push(...scanPersonaPrompts());

      // Skills
      files.push(...scanSkills());

      // Memory
      files.push(...scanMemory());

      // Learned patterns
      const patternsFile = scanSingleFile(
        resolve(AI_PROJECTS, '.claude/jobs/personas/task-reviewer/learned-patterns.yaml'),
        'patterns',
      );
      if (patternsFile) files.push(patternsFile);

      // Sort by age descending (stalest first)
      files.sort((a, b) => b.ageInDays - a.ageInDays);

      const summary = {
        total: files.length,
        fresh: files.filter((f) => f.stalenessTier === 'fresh').length,
        aging: files.filter((f) => f.stalenessTier === 'aging').length,
        stale: files.filter((f) => f.stalenessTier === 'stale').length,
        critical: files.filter((f) => f.stalenessTier === 'critical').length,
      };

      return { files, summary };
    } catch (err) {
      app.log.warn({ err }, 'Failed to compute staleness');
      return {
        files: [],
        summary: { total: 0, fresh: 0, aging: 0, stale: 0, critical: 0 },
      };
    }
  });

  // GET /api/cortex/training-stats — Training data pipeline health
  app.get<{ Querystring: { days?: string } }>('/api/cortex/training-stats', async (req) => {
    const days = parseInt(req.query.days || '30', 10);

    try {
      const captures = loadTrainingCaptures(days);

      // Captures per day
      const perDay = new Map<string, number>();
      for (const c of captures) {
        const date = c.timestamp?.split('T')[0] || 'unknown';
        perDay.set(date, (perDay.get(date) || 0) + 1);
      }
      const capturesPerDay = Array.from(perDay.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // By persona
      const byPersona: Record<string, number> = {};
      for (const c of captures) {
        const p = c.persona || 'unknown';
        byPersona[p] = (byPersona[p] || 0) + 1;
      }

      // By model
      const byModel: Record<string, number> = {};
      for (const c of captures) {
        const m = c.model_actual || 'unknown';
        byModel[m] = (byModel[m] || 0) + 1;
      }

      // By record type
      const byRecordType: Record<string, number> = {};
      for (const c of captures) {
        const rt = c.record_type || 'unknown';
        byRecordType[rt] = (byRecordType[rt] || 0) + 1;
      }

      // Data health — what % of fields are actually populated
      let personaDataPopulated = 0;
      let humanFeedbackPopulated = 0;
      let taskIdsPopulated = 0;
      for (const c of captures) {
        if (c.persona_data && Object.keys(c.persona_data).length > 0) personaDataPopulated++;
        if (c.quality?.human_feedback) humanFeedbackPopulated++;
        if (c.input?.task_ids && c.input.task_ids.length > 0) taskIdsPopulated++;
      }

      return {
        totalCaptures: captures.length,
        capturesPerDay,
        byPersona,
        byModel,
        byRecordType,
        dataHealth: {
          personaDataPopulated,
          humanFeedbackPopulated,
          taskIdsPopulated,
          totalRecords: captures.length,
        },
        days,
      };
    } catch (err) {
      app.log.warn({ err }, 'Failed to compute training stats');
      return {
        totalCaptures: 0,
        capturesPerDay: [],
        byPersona: {},
        byModel: {},
        byRecordType: {},
        dataHealth: {
          personaDataPopulated: 0,
          humanFeedbackPopulated: 0,
          taskIdsPopulated: 0,
          totalRecords: 0,
        },
        days,
      };
    }
  });

  // GET /api/cortex/velocity — Learning velocity metrics
  app.get('/api/cortex/velocity', async () => {
    try {
      // Context files modified in last 7/14/30 days
      const contextDir = resolve(AI_PROJECTS, '.claude/context');
      const contextRefreshed7d = countRecentlyModified(contextDir, /\.md$/, 7);
      const contextRefreshed14d = countRecentlyModified(contextDir, /\.md$/, 14);
      const contextRefreshed30d = countRecentlyModified(contextDir, /\.md$/, 30);

      // Training capture volume: this week vs last week
      const thisWeek = loadTrainingCaptures(7).length;
      const lastTwoWeeks = loadTrainingCaptures(14).length;
      const lastWeek = lastTwoWeeks - thisWeek;

      // Learned patterns last modified
      const patternsPath = resolve(
        AI_PROJECTS,
        '.claude/jobs/personas/task-reviewer/learned-patterns.yaml',
      );
      let patternsLastModified: string | null = null;
      try {
        if (existsSync(patternsPath)) {
          patternsLastModified = new Date(statSync(patternsPath).mtimeMs).toISOString();
        }
      } catch {
        // skip
      }

      return {
        contextRefreshes: {
          last7d: contextRefreshed7d,
          last14d: contextRefreshed14d,
          last30d: contextRefreshed30d,
        },
        trainingCaptures: {
          thisWeek,
          lastWeek,
          trend:
            lastWeek > 0
              ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
              : thisWeek > 0
                ? 100
                : 0,
        },
        patternsLastModified,
      };
    } catch (err) {
      app.log.warn({ err }, 'Failed to compute velocity');
      return {
        contextRefreshes: { last7d: 0, last14d: 0, last30d: 0 },
        trainingCaptures: { thisWeek: 0, lastWeek: 0, trend: 0 },
        patternsLastModified: null,
      };
    }
  });

  // GET /api/cortex/recommendations — Cortex persona recommendations (Phase 3)
  app.get<{ Querystring: { include_history?: string } }>(
    '/api/cortex/recommendations',
    async (req) => {
      const recsPath = resolve(CORTEX_RESULTS, 'recommendations.jsonl');
      const recs = safeReadJsonl(recsPath) as Record<string, unknown>[];
      const includeHistory = req.query.include_history === 'true';

      if (includeHistory) {
        // Return resolved/acknowledged items for history view
        return recs
          .filter((r) => r.status === 'resolved' || r.status === 'acknowledged')
          .sort(
            (a, b) =>
              new Date((b.status_updated_at as string) || (b.timestamp as string)).getTime() -
              new Date((a.status_updated_at as string) || (a.timestamp as string)).getTime(),
          );
      }

      // Filter to active only (not dismissed, not resolved), sort by priority
      return recs
        .filter((r) => r.status !== 'dismissed' && r.status !== 'resolved')
        .sort((a, b) => ((a.priority as number) || 5) - ((b.priority as number) || 5));
    },
  );

  // POST /api/cortex/recommendations/:id/action — Update recommendation status
  app.post<{
    Params: { id: string };
    Body: { action: 'acknowledge' | 'dismiss' | 'convert' | 'resolve'; note?: string };
  }>('/api/cortex/recommendations/:id/action', async (req, reply) => {
    const recsPath = resolve(CORTEX_RESULTS, 'recommendations.jsonl');
    if (!existsSync(recsPath)) {
      return reply.status(404).send({ error: 'No recommendations file found' });
    }

    const { id } = req.params;
    const { action, note } = req.body;

    const statusMap: Record<string, string> = {
      acknowledge: 'acknowledged',
      dismiss: 'dismissed',
      convert: 'acted-on',
      resolve: 'resolved',
    };
    const newStatus = statusMap[action];
    if (!newStatus) {
      return reply
        .status(400)
        .send({ error: 'Invalid action. Use: acknowledge, dismiss, convert' });
    }

    try {
      const content = readFileSync(recsPath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      let found = false;
      let matchedRec: Record<string, unknown> = {};

      const updated = lines.map((line) => {
        try {
          const rec = JSON.parse(line) as Record<string, unknown>;
          if (rec.id === id) {
            found = true;
            rec.status = newStatus;
            rec.status_updated_at = new Date().toISOString();
            rec.status_updated_by = 'dashboard';
            if (note) rec.status_note = note;
            matchedRec = rec;
            return JSON.stringify(rec);
          }
          return line;
        } catch {
          return line;
        }
      });

      if (!found) {
        return reply.status(404).send({ error: `Recommendation ${id} not found` });
      }

      writeFileSync(recsPath, updated.join('\n') + '\n', 'utf-8');

      // If converting to task, create via Pulse API
      if (action === 'convert' && found) {
        try {
          const pulseUrl = process.env.PULSE_API_URL || 'http://pulse:8700/api/v1';
          const title = `Cortex: ${(matchedRec.title as string) || 'Recommendation'}`;
          const description = [
            (matchedRec.rationale as string) || '',
            '',
            `**Suggested action:** ${(matchedRec.suggested_action as string) || ''}`,
            '',
            `_Source: Cortex recommendation ${id}_`,
          ].join('\n');

          const priority = (matchedRec.priority as number) || 3;

          const res = await fetch(`${pulseUrl}/tasks`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.PULSE_DASHBOARD_TOKEN
                ? { Authorization: `Bearer ${process.env.PULSE_DASHBOARD_TOKEN}` }
                : {}),
            },
            body: JSON.stringify({
              title,
              description,
              priority: Math.min(priority, 4),
              labels: ['domain:nexus', 'project:aiprojects', 'source:cortex'],
            }),
          });

          if (res.ok) {
            const task = (await res.json()) as Record<string, unknown>;
            return { status: newStatus, task_id: task.id, task_title: task.title };
          }
          app.log.warn({ status: res.status }, 'Failed to create Pulse task from recommendation');
        } catch (err) {
          app.log.warn({ err }, 'Failed to create Pulse task from recommendation');
        }
      }

      return { status: newStatus, id };
    } catch (err) {
      app.log.error({ err }, 'Failed to update recommendation');
      return reply.status(500).send({ error: 'Failed to update recommendation' });
    }
  });
}
