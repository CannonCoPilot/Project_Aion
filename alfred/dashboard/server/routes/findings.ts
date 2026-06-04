import type { FastifyInstance } from 'fastify';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const home = process.env.WORKSPACE_DIR || process.cwd();
const AI_PROJECTS = process.env.AIPROJECTS_DIR || resolve(home, process.env.DEFAULT_WORKSPACE || 'MyProject');
const AGENT_OUTPUT = process.env.AGENT_OUTPUT_DIR || resolve(AI_PROJECTS, '.claude/agent-output');
const TASK_REVIEWER_RESULTS =
  process.env.TASK_REVIEWER_RESULTS_DIR || resolve(AGENT_OUTPUT, 'results/task-reviewer');

const PATHS = {
  healthLog: resolve(AI_PROJECTS, '.claude/data/health-check-log.jsonl'),
  pendingUpgrades: resolve(AI_PROJECTS, '.claude/skills/upgrade/data/pending-upgrades.json'),
  pipelineReviewer: resolve(AGENT_OUTPUT, 'results/pipeline-reviewer'),
  taskEvaluator: resolve(AGENT_OUTPUT, 'results/task-evaluator'),
  taskResearch: resolve(AGENT_OUTPUT, 'results/task-research'),
  aurora: resolve(AGENT_OUTPUT, 'aurora'),
  taskReviewer: TASK_REVIEWER_RESULTS,
};

interface FindingItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  first_seen?: string;
  occurrences?: number;
  related_task?: string;
  status?: string;
  last_checked?: string;
}

interface FindingSection {
  source: string;
  title: string;
  last_run: string | null;
  items: FindingItem[];
}

function safeReadJsonl(path: string, maxLines = 500): unknown[] {
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    // Take the last N lines (most recent)
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

function safeReadJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function recentFiles(dir: string, days: number, ext = '.json'): string[] {
  if (!existsSync(dir)) return [];
  try {
    // Sort by filename descending (filenames contain dates like 2026-03-16-123456)
    // This avoids O(n) stat calls on large directories like task-evaluator (2000+ files)
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(ext))
      .sort((a, b) => b.localeCompare(a));

    // Use filename-based date cutoff: extract YYYY-MM-DD from filename
    const cutoffDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const filtered = files.filter((f) => f.slice(0, 10) >= cutoffDate);

    return filtered.map((f) => resolve(dir, f));
  } catch {
    return [];
  }
}

function dirMtime(dir: string): string | null {
  if (!existsSync(dir)) return null;
  try {
    const files = readdirSync(dir).map((f) => resolve(dir, f));
    if (files.length === 0) return null;
    const latest = files.reduce((best, f) => {
      try {
        const mt = statSync(f).mtimeMs;
        return mt > best ? mt : best;
      } catch {
        return best;
      }
    }, 0);
    return latest > 0 ? new Date(latest).toISOString() : null;
  } catch {
    return null;
  }
}

function fileMtime(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return new Date(statSync(path).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

// --- Source readers ---

function readHealthFindings(days: number): FindingSection {
  const entries = safeReadJsonl(PATHS.healthLog) as Record<string, unknown>[];
  const cutoff = Date.now() - days * 86400000;

  // Health log entries are flat objects: { timestamp, finding_key, service, finding_summary, disposition, ... }
  // Group by finding_key to count occurrences
  const issueMap = new Map<string, FindingItem>();
  for (const entry of entries) {
    const ts = (entry.timestamp as string) || '';
    if (new Date(ts).getTime() < cutoff) continue;

    const disposition = (entry.disposition || '') as string;
    // Skip resolved/healthy entries
    if (disposition === 'ok' || disposition === 'healthy' || disposition === 'resolved') continue;

    const findingKey = (entry.finding_key || entry.service || 'unknown') as string;
    const service = (entry.service || '') as string;
    const summary = (entry.finding_summary || '') as string;
    const notes = (entry.investigation_notes || '') as string;

    const existing = issueMap.get(findingKey);
    if (existing) {
      existing.occurrences = (existing.occurrences || 1) + 1;
      // Update detail with latest summary
      existing.detail = summary;
    } else {
      issueMap.set(findingKey, {
        id: `health-${findingKey.replace(/[^a-z0-9-]/g, '-').slice(0, 40)}`,
        severity:
          disposition === 'issue' || disposition === 'critical'
            ? 'warning'
            : disposition === 'watch'
              ? 'info'
              : 'info',
        title: `${service}: ${findingKey.split(':').pop() || findingKey}`,
        detail: summary || notes,
        first_seen: ts,
        occurrences: 1,
        status: disposition,
      });
    }
  }

  return {
    source: 'health',
    title: 'Health Checks',
    last_run: fileMtime(PATHS.healthLog),
    items: Array.from(issueMap.values()).sort(
      (a, b) => (b.occurrences || 0) - (a.occurrences || 0),
    ),
  };
}

function readUpgradeFindings(): FindingSection {
  const raw = safeReadJson(PATHS.pendingUpgrades) as Record<string, unknown> | null;
  if (!raw) {
    return {
      source: 'upgrades',
      title: 'Pending Upgrades',
      last_run: fileMtime(PATHS.pendingUpgrades),
      items: [],
    };
  }

  // File has { version, last_discovery, upgrades: [...] } wrapper
  const upgrades = (Array.isArray(raw) ? raw : raw.upgrades || []) as Record<string, unknown>[];
  const lastDiscovery = (raw.last_discovery || '') as string;

  const items: FindingItem[] = upgrades
    .filter((u) => (u.status as string) !== 'applied' && (u.status as string) !== 'completed')
    .map((u: Record<string, unknown>) => ({
      id: (u.id || `up-${Math.random().toString(36).slice(2, 8)}`) as string,
      severity:
        u.status === 'critical'
          ? 'critical'
          : u.status === 'ready' || u.status === 'actionable' || u.status === 'pending'
            ? 'warning'
            : 'info',
      title: (u.title || u.name || u.component || 'Unknown upgrade') as string,
      detail: (u.summary || u.description || '') as string,
      status: (u.status || 'unknown') as string,
      last_checked: (u.discovered || '') as string,
      related_task: (u.task_id || '') as string,
    }));

  return {
    source: 'upgrades',
    title: 'Pending Upgrades',
    last_run: lastDiscovery || fileMtime(PATHS.pendingUpgrades),
    items,
  };
}

function readPipelineFindings(days: number): FindingSection {
  const files = recentFiles(PATHS.pipelineReviewer, days);
  const items: FindingItem[] = [];

  for (const file of files.slice(0, 10)) {
    const data = safeReadJson(file) as Record<string, unknown> | null;
    if (!data) continue;

    const findings = (data.findings || data.issues || data.recommendations || []) as Record<
      string,
      unknown
    >[];
    for (const f of findings) {
      items.push({
        id: `pipeline-${basename(file, '.json')}-${items.length}`,
        severity: (f.severity as 'critical' | 'warning' | 'info') || 'info',
        title: (f.title || f.finding || f.issue || 'Pipeline finding') as string,
        detail: (f.detail || f.recommendation || f.description || '') as string,
      });
    }

    // If the file has top-level summary fields, create a summary item
    if (findings.length === 0 && (data.summary || data.status)) {
      items.push({
        id: `pipeline-${basename(file, '.json')}`,
        severity: 'info',
        title: `Pipeline review: ${basename(file, '.json')}`,
        detail: (data.summary || data.status || '') as string,
      });
    }
  }

  return {
    source: 'pipeline',
    title: 'Pipeline Reviews',
    last_run: dirMtime(PATHS.pipelineReviewer),
    items,
  };
}

function readTaskEvaluatorFindings(days: number): FindingSection {
  const files = recentFiles(PATHS.taskEvaluator, days);
  const items: FindingItem[] = [];

  // Parse recent evaluations for aggregate stats
  let totalEvaluated = 0;
  let totalTasksFound = 0;

  for (const file of files.slice(0, 50)) {
    const data = safeReadJson(file) as Record<string, unknown> | null;
    if (!data) continue;
    totalEvaluated += (data.evaluated as number) || 0;
    totalTasksFound += (data.tasks_found as number) || 0;
  }

  items.push({
    id: 'eval-summary',
    severity: 'info',
    title: `${totalEvaluated} tasks evaluated across ${files.length} runs`,
    detail: `${totalTasksFound} tasks found at intake stage in the last ${days} days`,
  });

  // Show the most recent evaluation with results
  for (const file of files.slice(0, 5)) {
    const data = safeReadJson(file) as Record<string, unknown> | null;
    if (!data) continue;
    const results = (data.results || []) as Record<string, unknown>[];
    if (results.length === 0 && data.notes) {
      // Skip "nothing to do" runs unless recent
      continue;
    }
    for (const r of results) {
      items.push({
        id: `eval-${(r.id || basename(file, '.json')) as string}`,
        severity: 'info',
        title: (r.title || r.task_title || 'Evaluated task') as string,
        detail: (r.decision_reason || r.notes || r.action || '') as string,
        related_task: (r.id || r.task_id || '') as string,
      });
    }
  }

  return {
    source: 'evaluator',
    title: 'Task Evaluator',
    last_run: dirMtime(PATHS.taskEvaluator),
    items,
  };
}

function readTaskResearchFindings(days: number): FindingSection {
  const files = recentFiles(PATHS.taskResearch, days);
  const items: FindingItem[] = [];

  for (const file of files.slice(0, 10)) {
    const data = safeReadJson(file) as Record<string, unknown> | null;
    if (!data) continue;

    // Research files have a results array with per-task findings
    const results = (data.results || []) as Record<string, unknown>[];
    if (results.length > 0) {
      for (const r of results) {
        items.push({
          id: `research-${(r.id || basename(file, '.json')) as string}-${items.length}`,
          severity: 'info',
          title: (r.title || 'Research task') as string,
          detail: (r.reason || r.summary || '') as string,
          related_task: (r.id || '') as string,
        });
      }
    } else {
      // Fallback for different file formats
      items.push({
        id: `research-${basename(file, '.json')}`,
        severity: 'info',
        title: (data.task_title || data.title || basename(file, '.json')) as string,
        detail: (data.summary || data.findings || data.conclusion || '') as string,
        related_task: (data.task_id || '') as string,
      });
    }
  }

  return {
    source: 'research',
    title: 'Task Research',
    last_run: dirMtime(PATHS.taskResearch),
    items,
  };
}

function readAuroraFindings(): FindingSection {
  const items: FindingItem[] = [];
  const auroraDir = PATHS.aurora;

  // Read the most recent state file — it has the full pipeline status
  const stateFiles = recentFiles(auroraDir, 7)
    .filter((f) => basename(f).startsWith('state-'))
    .slice(0, 1);

  for (const file of stateFiles) {
    const data = safeReadJson(file) as Record<string, unknown> | null;
    if (!data) continue;

    const surpriseId = (data.surprise_id || '') as string;
    const date = (data.date || basename(file, '.json').replace('state-', '')) as string;

    // Parse stage statuses from sub-objects
    const stages = ['think', 'build', 'present'] as const;
    for (const stage of stages) {
      const stageData = data[stage] as Record<string, unknown> | undefined;
      if (!stageData) continue;

      const status = (stageData.status || 'unknown') as string;
      const output = (stageData.output || '') as string;

      items.push({
        id: `aurora-${stage}-${date}`,
        severity: status === 'failed' ? 'warning' : 'info',
        title: `${stage}: ${status}`,
        detail: output ? `Output: ${output}` : '',
        status,
      });
    }

    // Add overall surprise summary
    if (surpriseId) {
      items.unshift({
        id: `aurora-surprise-${date}`,
        severity: 'info',
        title: `Today's surprise: ${surpriseId}`,
        detail: stages
          .map((s) => {
            const sd = data[s] as Record<string, unknown> | undefined;
            return sd ? `${s}: ${sd.status || '?'}` : null;
          })
          .filter(Boolean)
          .join(' | '),
      });
    }
  }

  return {
    source: 'aurora',
    title: 'Aurora Creative Pipeline',
    last_run: dirMtime(auroraDir),
    items,
  };
}

function readAiDavidFindings(days: number): FindingSection {
  // Read decision JSONL files for the requested day range
  const allEntries: Record<string, unknown>[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() - d * 86400000).toISOString().split('T')[0];
    const entries = safeReadJsonl(resolve(PATHS.taskReviewer, `${date}.jsonl`)) as Record<
      string,
      unknown
    >[];
    allEntries.push(...entries);
  }

  // Aggregate decision stats
  const actionCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = {};
  for (const e of allEntries) {
    const action = (e.action || 'unknown') as string;
    actionCounts[action] = (actionCounts[action] || 0) + 1;
    const conf = (e.confidence || 'unknown') as string;
    confidenceCounts[conf] = (confidenceCounts[conf] || 0) + 1;
  }

  const items: FindingItem[] = [];
  if (allEntries.length > 0) {
    const period = days === 1 ? 'today' : `last ${days}d`;
    items.push({
      id: 'task-reviewer-summary',
      severity: 'info',
      title: `${allEntries.length} decisions ${period}`,
      detail: `Actions: ${Object.entries(actionCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')} | Confidence: ${Object.entries(confidenceCounts)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    });
  }

  // Also check for summary files
  const summaryFiles = recentFiles(PATHS.taskReviewer, days)
    .filter((f) => basename(f).startsWith('summary-'))
    .slice(0, 5);

  for (const file of summaryFiles) {
    const data = safeReadJson(file) as Record<string, unknown> | null;
    if (!data) continue;

    // Parse known summary fields rather than dumping raw JSON
    const total = (data.total_processed ?? '') as string | number;
    const executed = (data.executed ?? '') as string | number;
    const proposed = (data.proposed ?? '') as string | number;
    const escalated = (data.escalated ?? '') as string | number;
    const skipped = (data.skipped ?? '') as string | number;

    const parts: string[] = [];
    if (total) parts.push(`processed: ${total}`);
    if (executed) parts.push(`executed: ${executed}`);
    if (proposed) parts.push(`proposed: ${proposed}`);
    if (escalated) parts.push(`escalated: ${escalated}`);
    if (skipped) parts.push(`skipped: ${skipped}`);

    items.push({
      id: `task-reviewer-${basename(file, '.json')}`,
      severity: 'info',
      title: `Run: ${basename(file, '.json').replace('summary-', '')}`,
      detail: parts.length > 0 ? parts.join(' | ') : ((data.summary || '') as string),
    });
  }

  return {
    source: 'task-reviewer',
    title: 'AI David Decisions',
    last_run: dirMtime(PATHS.taskReviewer),
    items,
  };
}

export async function findingsRoutes(app: FastifyInstance) {
  app.get('/api/findings', async (request) => {
    const query = request.query as { days?: string; source?: string };
    const days = parseInt(query.days || '7', 10);
    const sourceFilter = query.source || 'all';

    const sectionReaders: Record<string, () => FindingSection> = {
      health: () => readHealthFindings(days),
      upgrades: () => readUpgradeFindings(),
      pipeline: () => readPipelineFindings(days),
      evaluator: () => readTaskEvaluatorFindings(days),
      research: () => readTaskResearchFindings(days),
      aurora: () => readAuroraFindings(),
      'task-reviewer': () => readAiDavidFindings(days),
    };

    const sections: FindingSection[] = [];
    for (const [key, reader] of Object.entries(sectionReaders)) {
      if (sourceFilter !== 'all' && sourceFilter !== key) continue;
      try {
        sections.push(reader());
      } catch (err) {
        app.log.warn({ err, source: key }, 'Failed to read findings source');
        sections.push({
          source: key,
          title: key,
          last_run: null,
          items: [
            {
              id: `error-${key}`,
              severity: 'warning',
              title: `Failed to read ${key}`,
              detail: String(err),
            },
          ],
        });
      }
    }

    const allItems = sections.flatMap((s) => s.items);
    const summary = {
      total_findings: allItems.length,
      by_severity: {
        critical: allItems.filter((i) => i.severity === 'critical').length,
        warning: allItems.filter((i) => i.severity === 'warning').length,
        info: allItems.filter((i) => i.severity === 'info').length,
      },
      last_updated: new Date().toISOString(),
    };

    return { summary, sections };
  });
}
