import type { FastifyInstance } from 'fastify';
import { getTasks } from '../services/pulse-client.js';
import { getSetting } from '../services/dashboard-db.js';
import { isBlocked, isDeferred } from '../services/constants.js';
import type { Task, TaskStats } from '../types.js';
import {
  getCompanyProjects,
  getCompanyTags,
  getAllCompanyProjects,
  getAllCompanyTags,
} from '../services/company-registry.js';

// Must match frontend lib/board.ts classifyTask exactly
// Priority order per label-taxonomy.yaml board_classification
function classifyTask(task: Task, archiveDays?: number): string {
  const labels = task.labels ?? [];
  if (task.status === 'closed') {
    if (archiveDays != null && task.closed_at) {
      const closedMs = new Date(task.closed_at).getTime();
      const thresholdMs = Date.now() - archiveDays * 86400000;
      if (closedMs < thresholdMs) return 'archived';
    }
    return 'done';
  }
  if (isDeferred(task)) return 'deferred';
  if (labels.includes('review:research')) return 'review';
  if (labels.includes('pipeline:needs-approval')) return 'approvals';
  if (isBlocked(labels)) return 'blocked';
  if (task.status === 'in_progress') return 'in_progress';
  if (labels.includes('stage:queue')) return 'ready';
  return 'backlog';
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function statsRoutes(app: FastifyInstance) {
  app.get('/api/stats', async (request): Promise<TaskStats> => {
    const query = request.query as Record<string, string>;
    let tasks = await getTasks();
    const archiveDays = parseInt(getSetting('archive_days'), 10) || 7;

    // Company filter — scope all stats to a single company
    if (query.company) {
      const company = query.company;
      if (company === 'platform') {
        const allProjects = getAllCompanyProjects();
        const allTags = getAllCompanyTags();
        tasks = tasks.filter((t) => {
          const labels = t.labels ?? [];
          const matchesProject = labels.some(
            (l) => l.startsWith('project:') && allProjects.includes(l.slice(8)),
          );
          const matchesDomain = labels.some(
            (l) => l.startsWith('domain:') && allTags.includes(l.slice(7)),
          );
          return !matchesProject && !matchesDomain;
        });
      } else {
        const companyProjects = getCompanyProjects(company);
        const companyTags = getCompanyTags(company);
        tasks = tasks.filter((t) => {
          const labels = t.labels ?? [];
          const matchesProject = labels.some(
            (l) => l.startsWith('project:') && companyProjects.includes(l.slice(8)),
          );
          const matchesDomain = labels.some(
            (l) => l.startsWith('domain:') && companyTags.includes(l.slice(7)),
          );
          return matchesProject || matchesDomain;
        });
      }
    }

    const byStatus: Record<string, number> = {};
    const byPriority: Record<number, number> = {};
    const byDomain: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byAssignee: Record<string, number> = {};
    let noProject = 0;

    // Only count non-closed tasks for filter dropdowns
    const activeTasks = tasks.filter((t) => t.status !== 'closed');

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    }

    for (const task of activeTasks) {
      byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
      const assignee = task.assignee || '_unassigned';
      byAssignee[assignee] = (byAssignee[assignee] || 0) + 1;

      const labels = task.labels ?? [];
      let hasProject = false;
      for (const label of labels) {
        const [prefix, value] = label.split(':', 2);
        if (!value) continue;
        switch (prefix) {
          case 'domain':
            byDomain[value] = (byDomain[value] || 0) + 1;
            break;
          case 'project':
            byProject[value] = (byProject[value] || 0) + 1;
            hasProject = true;
            break;
          case 'source':
            bySource[value] = (bySource[value] || 0) + 1;
            break;
        }
      }
      if (!hasProject) noProject++;
    }

    // Board column counts (matches frontend classifyTask) — computed first so
    // individual stats can be derived from it, guaranteeing badge == filter.
    const byBoard: Record<string, number> = {};
    for (const task of tasks) {
      const col = classifyTask(task, archiveDays);
      byBoard[col] = (byBoard[col] || 0) + 1;
    }

    // Derive badge-facing stats from byBoard so they always match the filter
    const blocked = byBoard['blocked'] ?? 0;
    const ready = byBoard['ready'] ?? 0;
    const inProgress = byBoard['in_progress'] ?? 0;

    // Needs input = tasks with any blocker label (canonical set from taxonomy)
    // Intentionally includes deferred — this is a responsibility metric, not a board column
    const needsInput = activeTasks.filter((t) => isBlocked(t.labels ?? [])).length;

    // Responsibility buckets
    const waitingDavid = activeTasks.filter((t) => {
      const labels = t.labels ?? [];
      return labels.includes('waiting:david') && !labels.includes('parked');
    }).length;

    const waitingNexus = activeTasks.filter((t) => {
      const labels = t.labels ?? [];
      return (
        (labels.includes('auto:ready') || labels.includes('stage:queue')) &&
        !isBlocked(labels) &&
        !isDeferred(t)
      );
    }).length;

    const parked = activeTasks.filter((t) => isDeferred(t)).length;

    const researchAll = activeTasks.filter((t) => (t.labels ?? []).includes('review:research'));
    const researchQueue = researchAll.length;
    const researchActionRequired = researchAll.filter((t) =>
      (t.labels ?? []).includes('waiting:david'),
    ).length;
    const researchFyi = researchQueue - researchActionRequired;

    // Stage counts — from stage: labels on active tasks
    const byStage: Record<string, number> = {};
    for (const task of activeTasks) {
      for (const label of task.labels ?? []) {
        if (label.startsWith('stage:')) {
          const stage = label.slice(6);
          byStage[stage] = (byStage[stage] || 0) + 1;
        }
      }
    }

    // Archive aggregate stats
    const archivedTasks = tasks.filter((t) => classifyTask(t, archiveDays) === 'archived');
    const archiveByDomain: Record<string, number> = {};
    const archiveByProject: Record<string, number> = {};
    const archiveByWeek: Record<string, number> = {};
    for (const task of archivedTasks) {
      for (const label of task.labels ?? []) {
        const [prefix, value] = label.split(':', 2);
        if (!value) continue;
        if (prefix === 'domain') archiveByDomain[value] = (archiveByDomain[value] || 0) + 1;
        if (prefix === 'project') archiveByProject[value] = (archiveByProject[value] || 0) + 1;
      }
      if (task.closed_at) {
        const week = getWeekKey(task.closed_at);
        archiveByWeek[week] = (archiveByWeek[week] || 0) + 1;
      }
    }

    return {
      total: tasks.length,
      byStatus,
      byPriority,
      byDomain,
      byProject,
      bySource,
      noProject,
      byAssignee,
      ready,
      needsInput,
      waitingDavid,
      waitingNexus,
      parked,
      researchQueue,
      researchActionRequired,
      researchFyi,
      inProgress,
      blocked,
      byBoard,
      byStage,
      archived: archivedTasks.length,
      archiveStats: {
        byDomain: archiveByDomain,
        byProject: archiveByProject,
        byWeek: archiveByWeek,
        total: archivedTasks.length,
      },
    };
  });
}
