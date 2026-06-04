import type { FastifyInstance } from 'fastify';
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  closeTask,
  executeTransition,
  createWatchTrigger,
  getWatchTriggers,
  cancelWatchTrigger,
  addLabel,
  removeLabel,
} from '../services/pulse-client.js';
import { getSetting } from '../services/dashboard-db.js';
import { isBlocked, isDeferred } from '../services/constants.js';
import {
  getCompanyProjects,
  getCompanyTags,
  getAllCompanyProjects,
  getAllCompanyTags,
} from '../services/company-registry.js';

const workspace = process.env.WORKSPACE_DIR || process.cwd();

export async function taskRoutes(app: FastifyInstance) {
  // List tasks with filters
  app.get('/api/tasks', async (request) => {
    const query = request.query as Record<string, string>;
    let tasks = await getTasks();

    if (query.status && query.status !== 'all') {
      const statuses = query.status.split(',');
      tasks = tasks.filter((t) => statuses.includes(t.status));
    }
    if (query.priority) {
      const priorities = query.priority.split(',').map(Number);
      tasks = tasks.filter((t) => priorities.includes(t.priority));
    }
    if (query.domain) {
      tasks = tasks.filter((t) => (t.labels ?? []).includes(`domain:${query.domain}`));
    }
    if (query.project) {
      if (query.project === '_none') {
        tasks = tasks.filter((t) => !(t.labels ?? []).some((l) => l.startsWith('project:')));
      } else {
        tasks = tasks.filter((t) => (t.labels ?? []).includes(`project:${query.project}`));
      }
    }
    if (query.workspace) {
      tasks = tasks.filter((t) => (t.workspace || process.env.DEFAULT_WORKSPACE || 'MyProject') === query.workspace);
    }
    if (query.source) {
      tasks = tasks.filter((t) => (t.labels ?? []).includes(`source:${query.source}`));
    }
    if (query.assignee) {
      if (query.assignee === '_unassigned') {
        tasks = tasks.filter((t) => !t.assignee);
      } else {
        tasks = tasks.filter((t) => t.assignee === query.assignee);
      }
    }
    if (query.label) {
      const requiredLabels = query.label.split(',');
      tasks = tasks.filter((t) => {
        const taskLabels = t.labels ?? [];
        return requiredLabels.every((l) => taskLabels.includes(l));
      });
    }
    if (query.stage) {
      tasks = tasks.filter((t) => (t.labels ?? []).includes(`stage:${query.stage}`));
    }
    if (query.ready === 'true') {
      // Canonical: auto:ready or stage:queue + no blockers + not deferred (matches taxonomy)
      tasks = tasks.filter((t) => {
        const labels = t.labels ?? [];
        return (
          (labels.includes('auto:ready') || labels.includes('stage:queue')) &&
          !isBlocked(labels) &&
          !isDeferred(t) &&
          t.status !== 'closed'
        );
      });
    }
    if (query.excludeLabel) {
      const excluded = query.excludeLabel.split(',');
      tasks = tasks.filter((t) => !(t.labels ?? []).some((l) => excluded.includes(l)));
    }
    if (query.blockedReason) {
      // Computed filter — derive blocked reason from existing labels
      const REASON_LABELS: Record<string, { exact: string[]; prefixes: string[] }> = {
        decision: { exact: ['waiting:david'], prefixes: [] },
        input: { exact: ['needs-input'], prefixes: [] },
        dependency: {
          exact: ['waiting:subtasks', 'blocked:dependency'],
          prefixes: ['depends:', 'blocked:'],
        },
        external: { exact: ['waiting:external'], prefixes: [] },
        manual: { exact: ['manual-action'], prefixes: [] },
        approval: { exact: ['pipeline:needs-approval'], prefixes: [] },
        parked: { exact: ['parked'], prefixes: [] },
      };
      const reasons = query.blockedReason.split(',');
      tasks = tasks.filter((t) => {
        const labels = t.labels ?? [];
        return reasons.some((reason) => {
          const rule = REASON_LABELS[reason];
          if (!rule) return false;
          return (
            rule.exact.some((l) => labels.includes(l)) ||
            rule.prefixes.some((p) => labels.some((l) => l.startsWith(p)))
          );
        });
      });

      // Match classifyTask() precedence: closed → deferred → blocked
      // Closed and deferred tasks aren't "blocked" even if they have blocker labels
      tasks = tasks.filter((t) => t.status !== 'closed' && !isDeferred(t));
    }
    // Archive filter — split closed tasks into recent ("done") vs archived
    if (query.archived === 'true' || query.archived === 'false') {
      const archiveDays = parseInt(getSetting('archive_days'), 10) || 7;
      const thresholdMs = Date.now() - archiveDays * 86400000;
      if (query.archived === 'true') {
        tasks = tasks.filter(
          (t) =>
            t.status === 'closed' && t.closed_at && new Date(t.closed_at).getTime() < thresholdMs,
        );
      } else {
        // archived=false means recent closed only (exclude archived)
        tasks = tasks.filter((t) => {
          if (t.status !== 'closed') return true;
          if (!t.closed_at) return true;
          return new Date(t.closed_at).getTime() >= thresholdMs;
        });
      }
    }
    if (query.company) {
      const company = query.company;
      if (company === 'platform') {
        // Platform = tasks not matching ANY company's projects or tags
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
    // Date-based filters
    if (query.updatedAfter) {
      const threshold = new Date(query.updatedAfter).getTime();
      tasks = tasks.filter((t) => new Date(t.updated_at).getTime() >= threshold);
    }
    if (query.updatedBefore) {
      const threshold = new Date(query.updatedBefore).getTime();
      tasks = tasks.filter((t) => new Date(t.updated_at).getTime() < threshold);
    }
    if (query.createdAfter) {
      const threshold = new Date(query.createdAfter).getTime();
      tasks = tasks.filter((t) => new Date(t.created_at).getTime() >= threshold);
    }
    if (query.createdBefore) {
      const threshold = new Date(query.createdBefore).getTime();
      tasks = tasks.filter((t) => new Date(t.created_at).getTime() < threshold);
    }
    if (query.closedAfter) {
      const threshold = new Date(query.closedAfter).getTime();
      tasks = tasks.filter((t) => t.closed_at && new Date(t.closed_at).getTime() >= threshold);
    }
    if (query.staleDays) {
      const days = parseInt(query.staleDays, 10);
      if (days > 0) {
        const threshold = Date.now() - days * 86400000;
        tasks = tasks.filter(
          (t) => t.status !== 'closed' && new Date(t.updated_at).getTime() < threshold,
        );
      }
    }
    if (query.search) {
      const s = query.search.toLowerCase();
      tasks = tasks.filter(
        (t) =>
          t.id.toLowerCase().includes(s) ||
          t.title.toLowerCase().includes(s) ||
          t.description?.toLowerCase().includes(s) ||
          t.notes?.toLowerCase().includes(s) ||
          (t.labels ?? []).some((l) => l.toLowerCase().includes(s)),
      );
    }

    // Sort
    const sortField = query.sort || 'priority';
    const order = query.order === 'desc' ? -1 : 1;
    tasks.sort((a, b) => {
      switch (sortField) {
        case 'priority':
          return (a.priority - b.priority) * order;
        case 'updated_at':
          return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * order;
        case 'created_at':
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * order;
        case 'title':
          return a.title.localeCompare(b.title) * order;
        default:
          return (a.priority - b.priority) * order;
      }
    });

    return { tasks, total: tasks.length };
  });

  // Get single task
  app.get('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });
    return task;
  });

  // Create task
  app.post('/api/tasks', async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      priority?: number;
      labels?: string[];
      assignee?: string;
    };
    if (!body.title) return reply.status(400).send({ error: 'Title is required' });
    try {
      const result = await createTask(body);
      return reply.status(201).send({ message: result });
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Update task
  app.patch('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: string;
      priority?: number;
      assignee?: string;
      notes?: string;
      append_notes?: string;
      claim?: boolean;
    };
    try {
      const result = await updateTask(id, body);
      return { message: result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Execute a named transition (approve, claim, complete, pause, etc.)
  app.post('/api/tasks/:id/transition', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { scenario: string; source?: string; actor?: string };
    if (!body.scenario) return reply.status(400).send({ error: 'scenario is required' });
    try {
      const result = await executeTransition(id, body.scenario, body.source || 'dashboard');
      return { message: result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Watch for change — smart one-click watch trigger creation
  app.post('/api/tasks/:id/watch', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      condition?: string;
      file_patterns?: string[];
      source_type?: string;
      expires_days?: number;
    };

    // Fetch task details for smart defaults
    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    const labels = task.labels ?? [];

    // Smart condition: use provided, or task question, or task title
    const condition = body.condition?.trim() || task.question || `Sir addresses: ${task.title}`;

    // Smart file patterns: use provided, or derive from domain + keywords
    const filePatterns = body.file_patterns ?? [];
    if (filePatterns.length === 0) {
      const domainPatterns: string[] = [];

      // Domain-based root folders — check domain labels, workspace, and project context
      const isDnD =
        labels.some(
          (l: string) =>
            l.startsWith('domain:dnd') ||
            l.startsWith('domain:creative') ||
            l.startsWith('workspace:') ||
            l === 'type:prep',
        ) || task.workspace?.startsWith('CreativeProjects');

      if (isDnD) domainPatterns.push('01-DnD/**');
      else if (labels.some((l: string) => l.startsWith('domain:research')))
        domainPatterns.push('08-Research/**');
      else if (labels.some((l: string) => l.startsWith('domain:ai')))
        domainPatterns.push('05-AI/**');
      else if (labels.some((l: string) => l.startsWith('domain:security')))
        domainPatterns.push('Threat-Intel/**');
      else domainPatterns.push('**'); // Watch everything as fallback

      // Extract keywords from title for more specific patterns
      const keywords = task.title
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length > 3)
        .filter(
          (w: string) =>
            ![
              'determine',
              'document',
              'update',
              'review',
              'create',
              'define',
              'address',
              'needs',
              'should',
              'would',
              'could',
              'about',
              'when',
              'what',
              'where',
              'with',
              'from',
              'that',
              'this',
              'have',
              'been',
              'will',
              'task',
              'open',
            ].includes(w.toLowerCase()),
        )
        .slice(0, 3);

      if (keywords.length > 0) {
        // Add keyword-specific patterns within the domain folder
        for (const base of domainPatterns) {
          const root = base.replace('/**', '');
          for (const kw of keywords) {
            filePatterns.push(`${root}/**/*${kw}*`);
          }
        }
      }

      // Always include the broad domain pattern as fallback
      filePatterns.push(...domainPatterns);
    }

    // Create the watch trigger
    let triggerId: number | null = null;
    try {
      const trigger = await createWatchTrigger({
        task_id: id,
        condition,
        file_patterns: filePatterns,
        source_type: body.source_type || 'obsidian',
        expires_days: body.expires_days ?? 30,
        created_by: 'dashboard',
      });
      triggerId = trigger.id;
    } catch (err) {
      console.error('Failed to create watch trigger:', err);
      return reply.status(500).send({ error: 'Failed to create watch trigger' });
    }

    // Execute label transition
    try {
      await executeTransition(id, 'defer-with-trigger', 'dashboard');
    } catch (err) {
      console.warn('defer-with-trigger transition failed, falling back to manual labels:', err);
      try {
        await addLabel(id, 'waiting:trigger');
        await addLabel(id, 'stage:review');
        await removeLabel(id, 'waiting:david').catch(() => {});
        await removeLabel(id, 'needs-input').catch(() => {});
      } catch (labelErr) {
        console.warn('Fallback label update also failed:', labelErr);
      }
    }

    // Append notes
    try {
      await updateTask(id, {
        append_notes: `## Deferred with Watch Trigger (${new Date().toISOString().split('T')[0]})\n**Condition**: ${condition}\n**File patterns**: ${filePatterns.join(', ')}\n**Source**: ${body.source_type || 'obsidian'}\n**Expires**: ${body.expires_days ?? 30} days\n**Trigger ID**: ${triggerId}`,
      });
    } catch (err) {
      console.warn('Failed to append watch trigger notes:', err);
    }

    return {
      message: 'Watch trigger created',
      trigger_id: triggerId,
      condition,
      file_patterns: filePatterns,
    };
  });

  // Get active watch triggers for a task
  app.get('/api/tasks/:id/watch', async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await getWatchTriggers({ task_id: id, status: 'active' });
    } catch {
      return [];
    }
  });

  // Cancel a watch trigger
  app.post('/api/tasks/:id/watch/:triggerId/cancel', async (request, reply) => {
    const { id, triggerId } = request.params as { id: string; triggerId: string };
    try {
      await cancelWatchTrigger(Number(triggerId));
      // Return task to Sir's queue
      await executeTransition(id, 'trigger-cancel', 'dashboard').catch(() => {
        addLabel(id, 'waiting:david').catch(() => {});
        removeLabel(id, 'waiting:trigger').catch(() => {});
      });
      return { message: 'Watch trigger cancelled' };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Close task
  app.post('/api/tasks/:id/close', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { reason: string };
    if (!body.reason) return reply.status(400).send({ error: 'Reason is required' });
    try {
      const result = await closeTask(id, body.reason);
      return { message: result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
}
