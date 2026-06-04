import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getTasks } from '../services/pulse-client.js';
import { getRecentEvents, getHealthStatus } from '../services/nexus-db.js';
import { BLOCKER_LABELS as CANONICAL_BLOCKERS } from '../services/constants.js';
import { config } from '../config.js';

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getLocksDir(): string {
  return resolve(config.nexusDbPath, '..', 'locks');
}

function readActiveLocks(): { job: string; pid: number; alive: boolean }[] {
  const locksDir = getLocksDir();
  try {
    const files = readdirSync(locksDir).filter((f) => f.endsWith('.lock'));
    return files.map((f) => {
      const job = f.replace(/\.lock$/, '');
      const raw = readFileSync(resolve(locksDir, f), 'utf-8').trim();
      const pid = parseInt(raw, 10);
      return { job, pid, alive: !isNaN(pid) && isPidAlive(pid) };
    });
  } catch {
    return [];
  }
}

export async function pipelineStatusRoutes(app: FastifyInstance) {
  app.get('/api/pipeline/status', async () => {
    const rawTasks = await getTasks();
    // Normalize: ensure labels is always an array
    const tasks = rawTasks.map((t) => ({ ...t, labels: t.labels || [] }));

    // Active locks
    const locks = readActiveLocks();

    // Queued tasks — stage:queue, not in_progress or closed
    const queued = tasks
      .filter(
        (t) =>
          t.labels.includes('stage:queue') && t.status !== 'in_progress' && t.status !== 'closed',
      )
      .map((t) => ({
        id: t.id,
        title: t.title,
        labels: t.labels,
        priority: t.priority,
        status: t.status,
      }));

    // Executing tasks — status: in_progress
    const executing = tasks
      .filter((t) => t.status === 'in_progress')
      .map((t) => ({
        id: t.id,
        title: t.title,
        labels: t.labels,
        priority: t.priority,
      }));

    // Needs approval — pipeline:needs-approval + status: open
    const needsApproval = tasks
      .filter((t) => t.labels.includes('pipeline:needs-approval') && t.status === 'open')
      .map((t) => {
        const riskLabel = t.labels.find((l) => l.startsWith('risk:'));
        return {
          id: t.id,
          title: t.title,
          labels: t.labels,
          priority: t.priority,
          status: t.status,
          notes: t.notes,
          question: t.question ?? null,
          risk: riskLabel ? riskLabel.replace('risk:', '') : null,
        };
      });

    // Blocked tasks — canonical blocker labels from constants.ts (derived from label-taxonomy.yaml)
    const isBlockedTask = (labels: string[]) =>
      labels.some(
        (l) => (CANONICAL_BLOCKERS as readonly string[]).includes(l) || l.startsWith('blocked:'),
      );
    const blocked = tasks
      .filter((t) => isBlockedTask(t.labels) && t.status === 'open')
      .map((t) => {
        const blockers = t.labels.filter(
          (l) => (CANONICAL_BLOCKERS as readonly string[]).includes(l) || l.startsWith('blocked:'),
        );
        return {
          id: t.id,
          title: t.title,
          labels: t.labels,
          priority: t.priority,
          question: t.question ?? null,
          blockers,
        };
      });

    // Recent executions — job_completed events, last 15
    let recentExecutions: {
      job: string | undefined;
      timestamp: string;
      summary: string | undefined;
      cost: number | undefined;
      duration: number | undefined;
      success: boolean;
    }[] = [];
    try {
      const events = getRecentEvents(50);
      recentExecutions = events
        .filter((e) => e.type === 'job_completed')
        .slice(0, 15)
        .map((e) => ({
          job: e.job,
          timestamp: e.timestamp,
          summary: e.summary,
          cost: e.cost,
          duration: e.duration,
          success:
            e.status !== 'failed' && (e.raw.exit_code === 0 || e.raw.exit_code === undefined),
        }));
    } catch (err) {
      app.log.warn({ err }, 'Failed to read recent events for pipeline status');
    }

    // Dispatcher status
    let dispatcher;
    try {
      dispatcher = (await getHealthStatus()).dispatcher;
    } catch (err) {
      dispatcher = { status: 'unknown', lastHeartbeat: null, heartbeatAge: null };
      app.log.warn({ err }, 'Failed to read dispatcher status');
    }

    return {
      timestamp: new Date().toISOString(),
      locks,
      queued,
      executing,
      needsApproval,
      blocked,
      recentExecutions,
      dispatcher,
    };
  });

  // Stage pipeline counts — tasks grouped by stage: label
  app.get('/api/pipeline/stages', async () => {
    const rawTasks = await getTasks();
    const tasks = rawTasks.map((t) => ({ ...t, labels: t.labels || [] }));
    const openTasks = tasks.filter((t) => t.status !== 'closed');

    const STAGE_ORDER = ['intake', 'evaluate', 'route', 'review', 'queue', 'execute'] as const;
    type StageName = (typeof STAGE_ORDER)[number];

    const stages: Record<
      StageName,
      { id: string; title: string; priority: number; labels: string[] }[]
    > = {
      intake: [],
      evaluate: [],
      route: [],
      review: [],
      queue: [],
      execute: [],
    };

    let unstaged = 0;

    for (const t of openTasks) {
      const stageLabel = t.labels.find((l) => l.startsWith('stage:'));
      if (!stageLabel) {
        unstaged++;
        continue;
      }
      const stage = stageLabel.replace('stage:', '') as StageName;
      if (stages[stage]) {
        stages[stage].push({ id: t.id, title: t.title, priority: t.priority, labels: t.labels });
      }
    }

    return {
      timestamp: new Date().toISOString(),
      stages: STAGE_ORDER.map((s) => ({
        stage: s,
        count: stages[s].length,
        tasks: stages[s].sort((a, b) => a.priority - b.priority),
      })),
      totalOpen: openTasks.length,
      unstaged,
    };
  });
}
