import { execFile } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import {
  getTaskById,
  updateTask,
  closeTask,
  createTask,
  executeTransition,
  addLabel,
  removeLabel,
} from '../services/pulse-client.js';
import { sendNotification } from '../services/push.js';
import { config } from '../config.js';

/** Trigger the appropriate executor for a task based on its labels (fire-and-forget) */
function triggerExecutor(app: FastifyInstance, taskId: string, labels: string[]): void {
  const job = labels.includes('capability:infrastructure')
    ? 'task-executor-infra'
    : labels.includes('type:research')
      ? 'task-research'
      : 'task-executor';

  app.log.info({ job, taskId }, 'Triggering executor after approval');
  execFile(
    config.dispatcherPath,
    ['--run', job, '--param', `task_id=${taskId}`],
    {
      timeout: 60000,
    },
    (error, _stdout, stderr) => {
      if (error) {
        app.log.warn({ job, taskId, err: stderr || error.message }, 'Executor trigger failed');
      }
    },
  );
}

/**
 * Pipeline approval routes — handles task-to-execution pipeline actions.
 * These are distinct from the existing approval routes (which handle Nexus job questions).
 */
export async function pipelineRoutes(app: FastifyInstance) {
  // Approve a task for execution
  app.post('/api/pipeline/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { comment?: string };
    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    try {
      const labels = task.labels ?? [];
      if (labels.includes('pipeline:approved')) {
        // Already approved (e.g. by AI David) — clean up stale labels
        const staleLabels = [
          'waiting:david',
          'stage:review',
          'needs-input',
          'auto:candidate',
          'pipeline:needs-approval',
        ].filter((l) => labels.includes(l));
        const isAlreadyQueued = labels.some((l) => l.startsWith('stage:') && l !== 'stage:review');
        const missingLabels = isAlreadyQueued
          ? []
          : ['stage:queue', 'auto:ready'].filter((l) => !labels.includes(l));
        await Promise.allSettled([
          ...staleLabels.map((l) => removeLabel(id, l)),
          ...missingLabels.map((l) => addLabel(id, l)),
        ]);
      } else {
        // Atomic transition — removes blocking labels, adds approval + stage:queue
        await executeTransition(id, 'approve', 'dashboard');
      }

      if (body.comment) {
        await updateTask(id, {
          append_notes: `\n## Approval (${new Date().toISOString().split('T')[0]})\nApproved by Sir.\n${body.comment}`,
        });
      }

      await sendNotification({
        title: 'Task Approved',
        body: `${task.title} — approved for execution`,
        category: 'completion',
        url: `/tasks/${id}`,
        tag: `pipeline-${id}`,
      });

      // Trigger executor immediately — re-fetch labels post-transition for correct routing
      const updatedTask = await getTaskById(id);
      triggerExecutor(app, id, updatedTask?.labels ?? labels);

      return { message: 'Task approved and executor triggered', id };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Modify — send feedback back for re-evaluation
  app.post('/api/pipeline/:id/modify', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { comment: string };
    if (!body.comment)
      return reply.status(400).send({ error: 'Comment is required for modification' });

    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    try {
      await executeTransition(id, 'modify', 'dashboard');
      await updateTask(id, {
        append_notes: `\n## Modification Request (${new Date().toISOString().split('T')[0]})\n${body.comment}\n\nRe-evaluation needed.`,
      });

      return { message: 'Modification requested — task queued for re-evaluation', id };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Pause — shelve the task
  app.post('/api/pipeline/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { comment?: string };
    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    try {
      await executeTransition(id, 'pause', 'dashboard');

      if (body.comment) {
        await updateTask(id, {
          append_notes: `\n## Paused (${new Date().toISOString().split('T')[0]})\n${body.comment}`,
        });
      }

      return { message: 'Task paused', id };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Cancel — close the task
  app.post('/api/pipeline/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { comment?: string };
    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    try {
      const reason = body.comment
        ? `Cancelled at pipeline approval: ${body.comment}`
        : 'Cancelled at pipeline approval';
      await closeTask(id, reason);

      return { message: 'Task cancelled', id };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Action research — create follow-up implementation task from completed research
  app.post('/api/pipeline/:id/action-research', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      title: string;
      description?: string;
      priority?: number;
      labels?: string[];
    };
    if (!body.title) return reply.status(400).send({ error: 'Title is required' });

    const task = await getTaskById(id);
    if (!task) return reply.status(404).send({ error: 'Task not found' });

    try {
      // Build follow-up labels
      const followUpLabels = [`follow-up:${id}`, 'source:session', ...(body.labels ?? [])];

      // Extract domain from research task labels
      const domainLabel = (task.labels ?? []).find((l) => l.startsWith('domain:'));
      if (domainLabel && !followUpLabels.some((l) => l.startsWith('domain:'))) {
        followUpLabels.push(domainLabel);
      }

      // Create the follow-up task
      const result = await createTask({
        title: body.title,
        description:
          body.description ?? `Follow-up implementation from research task ${id} (${task.title}).`,
        priority: body.priority ?? 2,
        labels: followUpLabels,
      });

      // Close the research task
      await closeTask(id, `Actioned: created follow-up task. ${body.title}`);

      return { message: 'Research actioned — follow-up task created', id, followUp: result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Replay a specific event (re-triggers its handler)
  app.post('/api/pipeline/replay/:eventId', async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    try {
      const eventWatcherPath = config.dispatcherPath.replace('dispatcher.sh', 'event-watcher.sh');
      const result = await new Promise<string>((resolve, reject) => {
        execFile(
          eventWatcherPath,
          ['--replay', eventId],
          {
            timeout: 30000,
            env: { ...process.env },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(stderr.trim() || error.message));
            } else {
              resolve(stdout.trim());
            }
          },
        );
      });

      return { message: `Event ${eventId} replayed`, output: result };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // Send pipeline notification (called by msg-relay, event-watcher, or evaluator)
  app.post('/api/pipeline/notify', async (request, reply) => {
    const body = request.body as {
      title: string;
      body: string;
      category?: 'escalation' | 'completion' | 'health_critical' | 'pipeline';
      severity?: string;
      url?: string;
      taskId?: string;
      source?: string;
    };
    if (!body.title || !body.body) {
      return reply.status(400).send({ error: 'title and body are required' });
    }

    try {
      const sent = await sendNotification({
        title: body.title,
        body: body.body,
        category: body.category ?? 'pipeline',
        severity: body.severity ?? 'info',
        url:
          body.url ??
          (body.taskId ? `/nexus-ops?task_id=${encodeURIComponent(body.taskId)}` : '/nexus-ops'),
        tag: body.taskId ? `pipeline-${body.taskId}` : 'pipeline',
        task_id: body.taskId,
        source: body.source,
      });
      return { sent, message: `Notification sent to ${sent} device(s)` };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });
}
