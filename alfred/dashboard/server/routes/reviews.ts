import type { FastifyInstance } from 'fastify';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import {
  updateTask,
  addLabel,
  removeLabel,
  submitFeedback as pulseFeedback,
  createApprovedAction,
  executeTransition,
  createWatchTrigger,
  getWatchTriggers,
  getFilteredTasks,
} from '../services/pulse-client.js';

const RESULTS_DIR =
  process.env.TASK_REVIEWER_RESULTS_DIR ||
  resolve(
    process.env.HOME!,
    'AIProjects/.claude/agent-output/results/task-reviewer',
  );
const FEEDBACK_FILE = resolve(RESULTS_DIR, 'feedback.jsonl');
const APPROVED_ACTIONS_FILE = resolve(RESULTS_DIR, 'approved-actions.jsonl');
const FEEDBACK_SYNC_ERRORS_FILE = resolve(RESULTS_DIR, 'feedback-sync-errors.jsonl');

interface DecisionLogEntry {
  timestamp: string;
  task_id: string;
  task_title: string;
  action: 'execute' | 'propose' | 'escalate' | 'close' | 'execute-approved';
  confidence: 'high' | 'medium' | 'low';
  risk: 'safe' | 'moderate' | 'destructive';
  pattern_matched: string | null;
  pattern_source: string | null;
  reasoning: string;
  reversible: boolean;
  stage?: string;
  labels_added: string[];
  labels_removed: string[];
  value?: string;
  effort?: string;
  recommendation?: string;
}

interface FeedbackEntry {
  id: string;
  timestamp: string;
  decision_timestamp: string;
  task_id: string;
  task_title: string;
  action: string;
  feedback: 'agreed' | 'wrong' | 'adjust';
  comment: string;
  processed: boolean;
}

function readDecisionLogs(days = 7): DecisionLogEntry[] {
  if (!existsSync(RESULTS_DIR)) return [];

  const entries: DecisionLogEntry[] = [];
  const files = readdirSync(RESULTS_DIR)
    .filter((f) => f.match(/^\d{4}-\d{2}-\d{2}\.jsonl$/))
    .sort()
    .reverse()
    .slice(0, days);

  for (const file of files) {
    try {
      const content = readFileSync(resolve(RESULTS_DIR, file), 'utf-8');
      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          // Skip summary/non-decision entries
          if (!parsed.task_id || !parsed.action) continue;
          entries.push(parsed);
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // skip unreadable files
    }
  }

  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function readFeedback(): FeedbackEntry[] {
  if (!existsSync(FEEDBACK_FILE)) return [];
  try {
    const content = readFileSync(FEEDBACK_FILE, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as FeedbackEntry[];
  } catch {
    return [];
  }
}

export async function reviewRoutes(app: FastifyInstance) {
  // Get all decisions for review
  app.get('/api/reviews', async (request) => {
    const query = request.query as { days?: string };
    const days = parseInt(query.days || '7', 10);
    const decisions = readDecisionLogs(days);
    const feedback = readFeedback();

    // Mark decisions that already have feedback
    const feedbackByKey = new Map<string, FeedbackEntry>();
    for (const fb of feedback) {
      feedbackByKey.set(`${fb.task_id}:${fb.decision_timestamp}`, fb);
    }

    const reviews = decisions.map((d) => {
      const key = `${d.task_id}:${d.timestamp}`;
      const fb = feedbackByKey.get(key);
      return {
        ...d,
        feedback: fb?.feedback ?? null,
        feedback_comment: fb?.comment ?? null,
        feedback_timestamp: fb?.timestamp ?? null,
      };
    });

    // Stats
    const stats = {
      total: decisions.length,
      executed: decisions.filter((d) => d.action === 'execute').length,
      proposed: decisions.filter((d) => d.action === 'propose').length,
      escalated: decisions.filter((d) => d.action === 'escalate').length,
      closed: decisions.filter((d) => d.action === 'close').length,
      pending_review: reviews.filter((r) => !r.feedback).length,
      agreed: feedback.filter((f) => f.feedback === 'agreed').length,
      wrong: feedback.filter((f) => f.feedback === 'wrong').length,
      adjusted: feedback.filter((f) => f.feedback === 'adjust').length,
    };

    // Compute blocking counts and task created dates
    const blockingCounts: Record<string, number> = {};
    const taskCreatedDates: Record<string, string> = {};
    const reviewTaskIds = new Set(reviews.map((r) => r.task_id));
    if (reviewTaskIds.size > 0) {
      try {
        const { tasks: openTasks } = await getFilteredTasks({ status: 'open', limit: '1000' });

        // Build created_at lookup from open tasks that are in the review set
        for (const task of openTasks) {
          if (reviewTaskIds.has(task.id)) {
            taskCreatedDates[task.id] = task.created_at;
          }
        }

        // Count how many open tasks each review task is blocking
        for (const task of openTasks) {
          const text = `${task.description ?? ''} ${task.notes ?? ''}`;
          const dependsOn: string[] =
            ((task.metadata as Record<string, unknown>)?.depends_on as string[]) ?? [];
          for (const refId of reviewTaskIds) {
            if (task.id === refId) continue; // skip self
            if (
              text.includes(refId) ||
              dependsOn.includes(refId) ||
              task.labels.some(
                (l: string) => l === `blocked_by:${refId}` || l === `depends:${refId}`,
              )
            ) {
              blockingCounts[refId] = (blockingCounts[refId] ?? 0) + 1;
            }
          }
        }
      } catch {
        // Non-critical — proceed without enrichment
      }

      // Fetch non-open tasks (closed, in_progress) for created_at dates
      const missingIds = [...reviewTaskIds].filter((id) => !taskCreatedDates[id]);
      if (missingIds.length > 0) {
        try {
          const { tasks: allStatusTasks } = await getFilteredTasks({ limit: '1000' });
          for (const task of allStatusTasks) {
            if (reviewTaskIds.has(task.id) && !taskCreatedDates[task.id]) {
              taskCreatedDates[task.id] = task.created_at;
            }
          }
        } catch {
          // skip — frontend falls back to decision timestamp
        }
      }
    }

    // Cost-by-task attribution (v1.3 §6.1 #3 — Reviewer Dash cost column).
    // Pulls from Pulse cost_events, aggregates by task_id, attaches to each review.
    const costByTask: Record<string, { cost_usd_total: number; runs_count: number; models: string[]; total_duration_s: number; last_run_ts: string | null }> = {};
    if (reviewTaskIds.size > 0) {
      try {
        const { getCostByTask } = await import('../services/pulse-events.js');
        const costMap = await getCostByTask(Math.max(days * 24, 168));
        for (const tid of reviewTaskIds) {
          if (costMap[tid]) costByTask[tid] = costMap[tid];
        }
      } catch {
        // Non-critical — proceed without cost enrichment
      }
    }

    return { reviews, stats, blockingCounts, taskCreatedDates, costByTask };
  });

  // Get approved proposals pending execution
  app.get('/api/reviews/approved-actions', async () => {
    if (!existsSync(APPROVED_ACTIONS_FILE)) return { actions: [] };
    try {
      const content = readFileSync(APPROVED_ACTIONS_FILE, 'utf-8');
      const actions = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return { actions };
    } catch {
      return { actions: [] };
    }
  });

  // Mark an approved action as executed (called by AI David after execution)
  app.post('/api/reviews/approved-actions/mark-executed', async (request, reply) => {
    const body = request.body as { id: string; execution_result?: string };
    if (!body.id) {
      return reply.status(400).send({ error: 'id is required' });
    }

    if (!existsSync(APPROVED_ACTIONS_FILE)) {
      return reply.status(404).send({ error: 'No approved actions file' });
    }

    const content = readFileSync(APPROVED_ACTIONS_FILE, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    let found = false;
    const updated = lines.map((line) => {
      try {
        const entry = JSON.parse(line);
        if (entry.id === body.id) {
          found = true;
          return JSON.stringify({
            ...entry,
            executed: true,
            executed_at: new Date().toISOString(),
            execution_result: body.execution_result || '',
          });
        }
        return line;
      } catch {
        return line;
      }
    });

    if (!found) {
      return reply.status(404).send({ error: 'Action not found' });
    }

    writeFileSync(APPROVED_ACTIONS_FILE, updated.join('\n') + '\n');
    return { message: 'Marked as executed' };
  });

  // Submit bulk feedback on multiple decisions
  app.post('/api/reviews/feedback/bulk', async (request, reply) => {
    const body = request.body as {
      items: Array<{
        task_id: string;
        task_title: string;
        decision_timestamp: string;
        action: string;
        feedback: 'agreed' | 'wrong' | 'adjust';
        comment: string;
      }>;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return reply.status(400).send({ error: 'items array is required and must not be empty' });
    }

    // Ensure directory exists
    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }

    // Pre-validate all items
    const batchTs = Date.now();
    const validItems: Array<{
      item: (typeof body.items)[number];
      entry: FeedbackEntry;
    }> = [];

    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];
      if (!item.feedback || !item.task_id || !item.decision_timestamp) continue;
      if (!['agreed', 'wrong', 'adjust'].includes(item.feedback)) continue;

      validItems.push({
        item,
        entry: {
          id: `fb-${batchTs}-${i}`,
          timestamp: new Date().toISOString(),
          decision_timestamp: item.decision_timestamp,
          task_id: item.task_id,
          task_title: item.task_title,
          action: item.action,
          feedback: item.feedback,
          comment: item.comment || '',
          processed: false,
        },
      });
    }

    // Write all feedback entries to JSONL in one atomic batch (synchronous, no interleaving)
    const feedbackLines = validItems.map((v) => JSON.stringify(v.entry)).join('\n') + '\n';
    appendFileSync(FEEDBACK_FILE, feedbackLines);

    // Write approved-action entries for proposals/escalations
    const approvalLines = validItems
      .filter(
        (v) =>
          v.item.feedback === 'agreed' &&
          (v.item.action === 'propose' || v.item.action === 'escalate'),
      )
      .map((v, j) =>
        JSON.stringify({
          id: `aa-${batchTs}-${j}`,
          timestamp: new Date().toISOString(),
          task_id: v.item.task_id,
          task_title: v.item.task_title,
          feedback_id: v.entry.id,
          comment: v.item.comment || '',
          executed: false,
        }),
      )
      .join('\n');
    if (approvalLines) {
      appendFileSync(APPROVED_ACTIONS_FILE, approvalLines + '\n');
    }

    // Now run async Pulse API calls in parallel (no file writes in this phase)
    const results = await Promise.allSettled(
      validItems.map(async ({ item, entry }) => {
        // Submit to Pulse API
        try {
          await pulseFeedback({
            task_id: item.task_id,
            verdict: item.feedback,
            comment: item.comment || '',
          });
        } catch (err) {
          console.warn(`Bulk feedback: Pulse sync failed for ${item.task_id}:`, err);
          const syncError = {
            id: entry.id,
            timestamp: new Date().toISOString(),
            entry,
            error: String(err),
            reconciled: false,
          };
          appendFileSync(FEEDBACK_SYNC_ERRORS_FILE, JSON.stringify(syncError) + '\n');
        }

        // Handle proposal/escalation approval
        if (
          item.feedback === 'agreed' &&
          (item.action === 'propose' || item.action === 'escalate')
        ) {
          try {
            await executeTransition(item.task_id, 'approve', 'dashboard');
          } catch (err) {
            console.warn(`Bulk feedback: approve transition failed for ${item.task_id}:`, err);
            const taskId = item.task_id.replace(/^AIProjects-/, '');
            try {
              await addLabel(taskId, 'pipeline:approved');
              await addLabel(taskId, 'auto:ready');
              await removeLabel(taskId, 'pipeline:needs-approval').catch(() => {});
              await removeLabel(taskId, 'waiting:david').catch(() => {});
            } catch (labelErr) {
              console.warn('Fallback label update also failed:', labelErr);
            }
          }

          try {
            await createApprovedAction({
              task_id: item.task_id,
              action_type: 'execute',
              action_data: {
                task_title: item.task_title,
                feedback_id: entry.id,
                comment: item.comment,
              },
            });
          } catch (err) {
            console.warn(`Bulk feedback: Pulse approved action failed for ${item.task_id}:`, err);
          }
        }

        // Handle adjust feedback
        if (item.feedback === 'adjust') {
          try {
            await updateTask(item.task_id, {
              status: 'open',
              append_notes: `## Refinement requested (${new Date().toISOString().split('T')[0]})\n${item.comment || 'Adjust feedback — re-queued for execution with guidance.'}`,
            });
            await executeTransition(item.task_id, 'approve', 'dashboard');
          } catch (err) {
            console.warn(`Bulk feedback: re-route failed for ${item.task_id}:`, err);
            try {
              await addLabel(item.task_id, 'auto:ready');
              await removeLabel(item.task_id, 'auto:candidate').catch(() => {});
            } catch (labelErr) {
              console.warn('Fallback label update also failed:', labelErr);
            }
          }
        }

        return entry.id;
      }),
    );

    const processed = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason));

    return { processed, failed, errors };
  });

  // Submit feedback on a decision
  app.post('/api/reviews/feedback', async (request, reply) => {
    const body = request.body as {
      task_id: string;
      task_title: string;
      decision_timestamp: string;
      action: string;
      feedback: 'agreed' | 'wrong' | 'adjust';
      comment: string;
    };

    if (!body.feedback || !body.task_id || !body.decision_timestamp) {
      return reply
        .status(400)
        .send({ error: 'feedback, task_id, and decision_timestamp are required' });
    }

    if (!['agreed', 'wrong', 'adjust'].includes(body.feedback)) {
      return reply.status(400).send({ error: 'feedback must be agreed, wrong, or adjust' });
    }

    // Ensure directory exists
    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }

    const entry: FeedbackEntry = {
      id: `fb-${Date.now()}`,
      timestamp: new Date().toISOString(),
      decision_timestamp: body.decision_timestamp,
      task_id: body.task_id,
      task_title: body.task_title,
      action: body.action,
      feedback: body.feedback,
      comment: body.comment || '',
      processed: false,
    };

    // Write feedback to JSONL (legacy — AI David decision logs still read from files)
    appendFileSync(FEEDBACK_FILE, JSON.stringify(entry) + '\n');

    // Also submit to Pulse API for the feedback loop
    try {
      await pulseFeedback({
        task_id: body.task_id,
        verdict: body.feedback,
        comment: body.comment || '',
      });
    } catch (err) {
      console.warn('Failed to submit feedback to Pulse — recording sync error:', err);
      // Track failed Pulse write so it can be reconciled later
      const syncError = {
        id: entry.id,
        timestamp: new Date().toISOString(),
        entry,
        error: String(err),
        reconciled: false,
      };
      appendFileSync(FEEDBACK_SYNC_ERRORS_FILE, JSON.stringify(syncError) + '\n');
    }

    // When a proposal is approved ("agreed"), execute the approve transition and queue for AI David
    if (body.feedback === 'agreed' && (body.action === 'propose' || body.action === 'escalate')) {
      const approvedAction = {
        id: `aa-${Date.now()}`,
        timestamp: new Date().toISOString(),
        task_id: body.task_id,
        task_title: body.task_title,
        feedback_id: entry.id,
        comment: body.comment || '',
        executed: false,
      };
      appendFileSync(APPROVED_ACTIONS_FILE, JSON.stringify(approvedAction) + '\n');

      // Execute the approve transition (sets pipeline:approved, auto:ready, stage:queue; removes pipeline:needs-approval, waiting:david, etc.)
      try {
        await executeTransition(body.task_id, 'approve', 'dashboard');
      } catch (err) {
        // Fallback: manually set labels if transition fails (e.g., missing precondition on older tasks)
        console.warn('Approve transition failed, falling back to manual labels:', err);
        const taskId = body.task_id.replace(/^AIProjects-/, '');
        try {
          await addLabel(taskId, 'pipeline:approved');
          await addLabel(taskId, 'auto:ready');
          await removeLabel(taskId, 'pipeline:needs-approval').catch(() => {});
          await removeLabel(taskId, 'waiting:david').catch(() => {});
        } catch (labelErr) {
          console.warn('Fallback label update also failed:', labelErr);
        }
      }

      // Also create in Pulse approved-actions
      try {
        await createApprovedAction({
          task_id: body.task_id,
          action_type: 'execute',
          action_data: {
            task_title: body.task_title,
            feedback_id: entry.id,
            comment: body.comment,
          },
        });
      } catch (err) {
        console.warn('Failed to create approved action in Pulse (non-fatal):', err);
      }
    }

    // When feedback is "adjust" (refine), re-route the task for Nexus pickup.
    // Append feedback as notes so executor sees the refinement guidance.
    // Preserve existing risk level — do NOT override with risk:safe.
    // Re-queue via approve transition (sets pipeline:approved, auto:ready, stage:queue).
    if (body.feedback === 'adjust') {
      try {
        // Append feedback as notes so executor sees the refinement guidance
        await updateTask(body.task_id, {
          status: 'open',
          append_notes: `## Refinement requested (${new Date().toISOString().split('T')[0]})\n${body.comment || 'Adjust feedback — re-queued for execution with guidance.'}`,
        });
        // Re-queue via approve transition (preserves existing risk level)
        await executeTransition(body.task_id, 'approve', 'dashboard');
      } catch (err) {
        console.warn(`Failed to re-route task ${body.task_id} after adjust feedback:`, err);
        // Fallback: manually set auto:ready without changing risk
        try {
          await addLabel(body.task_id, 'auto:ready');
          await removeLabel(body.task_id, 'auto:candidate').catch(() => {});
        } catch (labelErr) {
          console.warn('Fallback label update also failed:', labelErr);
        }
      }
    }

    return { message: 'Feedback recorded', id: entry.id };
  });

  // Report sync status between JSONL and Pulse API
  app.get('/api/reviews/feedback/sync-status', async () => {
    const jsonlEntries = readFeedback();

    let syncErrors: Array<{
      id: string;
      timestamp: string;
      entry: FeedbackEntry;
      error: string;
      reconciled: boolean;
    }> = [];
    if (existsSync(FEEDBACK_SYNC_ERRORS_FILE)) {
      try {
        const content = readFileSync(FEEDBACK_SYNC_ERRORS_FILE, 'utf-8');
        syncErrors = content
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      } catch {
        // file unreadable — treat as empty
      }
    }

    const unreconciled = syncErrors.filter((e) => !e.reconciled);
    return {
      jsonl_count: jsonlEntries.length,
      sync_error_count: syncErrors.length,
      unreconciled_count: unreconciled.length,
      in_sync: unreconciled.length === 0,
      unreconciled_ids: unreconciled.map((e) => e.id),
    };
  });

  // Replay failed Pulse writes (reconcile JSONL → Pulse API)
  app.post('/api/reviews/feedback/reconcile', async () => {
    if (!existsSync(FEEDBACK_SYNC_ERRORS_FILE)) {
      return { reconciled: 0, failed: 0, message: 'No sync errors on record' };
    }

    let syncErrors: Array<{
      id: string;
      timestamp: string;
      entry: FeedbackEntry;
      error: string;
      reconciled: boolean;
    }> = [];
    try {
      const content = readFileSync(FEEDBACK_SYNC_ERRORS_FILE, 'utf-8');
      syncErrors = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return { reconciled: 0, failed: 0, message: 'Could not read sync error file' };
    }

    let reconciled = 0;
    let failed = 0;
    const updated = await Promise.all(
      syncErrors.map(async (syncErr) => {
        if (syncErr.reconciled) return syncErr;
        try {
          await pulseFeedback({
            task_id: syncErr.entry.task_id,
            verdict: syncErr.entry.feedback,
            comment: syncErr.entry.comment || '',
          });
          reconciled++;
          return { ...syncErr, reconciled: true, reconciled_at: new Date().toISOString() };
        } catch {
          failed++;
          return syncErr;
        }
      }),
    );

    writeFileSync(
      FEEDBACK_SYNC_ERRORS_FILE,
      updated.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
    return { reconciled, failed, total: syncErrors.length };
  });

  // Defer task with a watch trigger — creates trigger + transitions labels
  app.post('/api/reviews/defer-with-trigger', async (request, reply) => {
    const body = request.body as {
      task_id: string;
      task_title: string;
      decision_timestamp: string;
      action: string;
      condition: string;
      file_patterns: string[];
      source_type: string;
      expires_days: number;
    };

    if (!body.task_id || !body.condition) {
      return reply.status(400).send({ error: 'task_id and condition are required' });
    }

    // Ensure results directory exists
    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }

    // 1. Create watch trigger in Pulse
    let triggerId: number | null = null;
    try {
      const trigger = await createWatchTrigger({
        task_id: body.task_id,
        condition: body.condition,
        file_patterns: body.file_patterns || [],
        source_type: body.source_type || 'obsidian',
        expires_days: body.expires_days || 30,
        created_by: 'dashboard',
      });
      triggerId = trigger.id;
    } catch (err) {
      console.error('Failed to create watch trigger:', err);
      return reply.status(500).send({ error: 'Failed to create watch trigger' });
    }

    // 2. Execute label transition (defer-with-trigger)
    try {
      await executeTransition(body.task_id, 'defer-with-trigger', 'dashboard');
    } catch (err) {
      console.warn('defer-with-trigger transition failed, falling back to manual labels:', err);
      try {
        await addLabel(body.task_id, 'waiting:trigger');
        await addLabel(body.task_id, 'stage:review');
        await removeLabel(body.task_id, 'waiting:david').catch(() => {});
        await removeLabel(body.task_id, 'needs-input').catch(() => {});
      } catch (labelErr) {
        console.warn('Fallback label update also failed:', labelErr);
      }
    }

    // 3. Write feedback entry (audit trail)
    const entry = {
      id: `fb-${Date.now()}`,
      timestamp: new Date().toISOString(),
      decision_timestamp: body.decision_timestamp,
      task_id: body.task_id,
      task_title: body.task_title,
      action: body.action,
      feedback: 'defer-with-trigger',
      comment: `Watching: ${body.condition}. Patterns: ${(body.file_patterns || []).join(', ')}`,
      processed: true,
      watch_trigger_id: triggerId,
    };
    appendFileSync(FEEDBACK_FILE, JSON.stringify(entry) + '\n');

    // 4. Add task notes about the watch trigger
    try {
      await updateTask(body.task_id, {
        append_notes: `## Deferred with Watch Trigger (${new Date().toISOString().split('T')[0]})\n**Condition**: ${body.condition}\n**File patterns**: ${(body.file_patterns || []).join(', ') || 'none'}\n**Source**: ${body.source_type || 'obsidian'}\n**Expires**: ${body.expires_days || 30} days\n**Trigger ID**: ${triggerId}`,
      });
    } catch (err) {
      console.warn('Failed to append watch trigger notes to task:', err);
    }

    return { message: 'Task deferred with watch trigger', trigger_id: triggerId };
  });

  // List watch triggers (proxy to Pulse)
  app.get('/api/reviews/watch-triggers', async (request) => {
    const query = request.query as { task_id?: string; status?: string };
    try {
      return await getWatchTriggers({
        task_id: query.task_id,
        status: query.status,
      });
    } catch (err) {
      console.error('Failed to fetch watch triggers:', err);
      return [];
    }
  });
}
