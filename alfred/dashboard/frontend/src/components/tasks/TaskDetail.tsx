import { useState } from 'react';
import type { Task } from '../../api/tasks';
import { useUpdateTask, useCloseTask, useSummarizeTask } from '../../api/mutations';
import {
  useCreateTaskWatch,
  useCancelTaskWatch,
  useTaskWatchTriggers,
} from '../../api/watch-triggers';
import { post, del } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';
import { LabelManager } from '../labels/LabelManager';
import { RelatedTasks } from './RelatedTasks';
import { ActivityTimeline } from './ActivityTimeline';
import { ExecutionStream } from './ExecutionStream';
import { DependencyChain } from './DependencyChain';
import { StaleBadge, isStale } from './StaleBadge';
import { parseExternalRef } from '../../lib/externalRef';

function getStage(labels: string[]): string | null {
  const stageLabel = labels.find((l) => l.startsWith('stage:'));
  return stageLabel ? stageLabel.replace('stage:', '') : null;
}

function hasLabel(labels: string[], label: string): boolean {
  return labels.includes(label);
}

type RoutingOption = 'none' | 'david' | 'nexus' | 'execute' | 'session' | 'parked' | 'watch';

const ROUTES: {
  key: RoutingOption;
  label: string;
  transition: string;
  hint: string;
  color: string;
  activeColor: string;
}[] = [
  {
    key: 'none',
    label: 'Unrouted',
    transition: '',
    hint: 'No routing — will appear in Uncategorized',
    color: 'border-subtle text-faint',
    activeColor: 'border-b-muted bg-surface-muted/10 text-tertiary',
  },
  {
    key: 'david',
    label: 'Waiting on Me',
    transition: 'route-to-david',
    hint: 'Needs your input, decision, or manual action',
    color: 'border-orange-500/30 text-orange-400/70',
    activeColor: 'border-orange-500 bg-orange-500/10 text-orange-400',
  },
  {
    key: 'nexus',
    label: 'Send to Nexus',
    transition: 'route-to-queue',
    hint: 'Queue for automated evaluation',
    color: 'border-accent/30 text-accent-text/70',
    activeColor: 'border-accent-border bg-accent/10 text-accent-text',
  },
  {
    key: 'execute',
    label: 'Execute Now',
    transition: '',
    hint: 'Skip evaluator — run on next executor cycle',
    color: 'border-green-500/30 text-green-400/70',
    activeColor: 'border-green-500 bg-green-500/10 text-green-400',
  },
  {
    key: 'session',
    label: 'Route to Session',
    transition: 'route-to-session',
    hint: 'Needs interactive CLI session',
    color: 'border-purple-500/30 text-purple-400/70',
    activeColor: 'border-purple-500 bg-purple-500/10 text-purple-400',
  },
  {
    key: 'parked',
    label: 'Park',
    transition: 'pause',
    hint: 'On hold — blocked or deliberately shelved',
    color: 'border-b-muted text-muted/70',
    activeColor: 'border-b-muted bg-surface-muted/10 text-muted',
  },
  {
    key: 'watch',
    label: 'Watching',
    transition: 'defer-with-trigger',
    hint: 'Watching for Obsidian changes — advances automatically',
    color: 'border-cyan-500/30 text-cyan-400/70',
    activeColor: 'border-cyan-500 bg-cyan-500/10 text-cyan-400',
  },
];

function getCurrentRouting(labels: string[]): RoutingOption {
  if (labels.includes('waiting:trigger')) return 'watch';
  if (labels.includes('waiting:owner')) return 'david';
  if (labels.includes('waiting:session')) return 'session';
  if (labels.includes('auto:ready') && labels.includes('pipeline:approved') && labels.includes('stage:queue')) return 'execute';
  if (labels.includes('auto:candidate') || labels.includes('auto:ready')) return 'nexus';
  if (labels.includes('parked')) return 'parked';
  return 'none';
}

function RoutingButtons({ taskId, labels }: { taskId: string; labels: string[] }) {
  const [pending, setPending] = useState(false);
  const qc = useQueryClient();
  const current = getCurrentRouting(labels);

  const handleRoute = async (route: (typeof ROUTES)[number]) => {
    if (route.key === current || pending) return;
    setPending(true);
    try {
      // Special case: "none" (unrouted) — just remove routing labels manually
      if (route.key === 'none') {
        for (const rl of [
          'waiting:owner',
          'waiting:session',
          'waiting:external',
          'parked',
          'auto:candidate',
          'auto:ready',
          'needs-input',
          'pipeline:needs-approval',
          'pipeline:approved',
          'stage:queue',
        ]) {
          if (labels.includes(rl)) {
            await del(`/tasks/${taskId}/labels/${encodeURIComponent(rl)}`);
          }
        }
      } else if (route.key === 'execute') {
        // Fast-track: stamp labels for immediate executor pickup
        // First remove any conflicting routing labels
        for (const rl of ['waiting:owner', 'waiting:session', 'parked', 'auto:candidate', 'needs-input', 'pipeline:needs-approval']) {
          if (labels.includes(rl)) {
            await del(`/tasks/${taskId}/labels/${encodeURIComponent(rl)}`);
          }
        }
        // Then add execution labels
        const execLabels = ['auto:ready', 'risk:safe', 'stage:queue', 'pipeline:approved'];
        for (const el of execLabels) {
          if (!labels.includes(el)) {
            await post(`/tasks/${taskId}/labels`, { labels: [el], actor: 'dashboard' });
          }
        }
      } else {
        // Use named transition
        await post(`/tasks/${taskId}/transition`, {
          scenario: route.transition,
          source: 'dashboard',
          actor: 'david',
        });
      }
    } finally {
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      setPending(false);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-muted mb-2">Routing</h2>
      <div className="grid grid-cols-7 gap-2">
        {ROUTES.map((r) => (
          <button
            key={r.key}
            onClick={() => handleRoute(r)}
            disabled={pending}
            title={r.hint}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
              current === r.key ? r.activeColor : `${r.color} hover:bg-surface-2`
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-disabled mt-1.5">
        {ROUTES.find((r) => r.key === current)?.hint}
      </p>
    </div>
  );
}

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task }: TaskDetailProps) {
  const [closeReason, setCloseReason] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [showSendBack, setShowSendBack] = useState(false);
  const [sendBackNote, setSendBackNote] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(task.notes ?? '');
  const [summaryPreview, setSummaryPreview] = useState<string | null>(null);
  const [showWatchConfirm, setShowWatchConfirm] = useState(false);
  const [watchCondition, setWatchCondition] = useState('');
  const update = useUpdateTask(task.id);
  const close = useCloseTask(task.id);
  const summarize = useSummarizeTask(task.id);
  const qc = useQueryClient();
  const stale = task.status !== 'closed' && isStale(task.updated_at);
  const labels = task.labels ?? [];
  const stage = getStage(labels);
  const projectLabel = labels.find((l) => l.startsWith('project:'))?.replace('project:', '');
  const yamlTaskId = task.description?.match(/\*{0,2}yaml_task_id\*{0,2}:\s*(\S+)/)?.[1];
  const createWatch = useCreateTaskWatch(task.id);
  const cancelWatch = useCancelTaskWatch(task.id);
  const { data: activeWatches } = useTaskWatchTriggers(
    hasLabel(labels, 'waiting:trigger') ? task.id : undefined,
  );

  const handleStatusChange = (status: string) => {
    if (status === 'closed') {
      setShowClose(true);
      return;
    }
    update.mutate({ status });
  };

  const handleClose = () => {
    if (!closeReason.trim()) return;
    close.mutate(
      { reason: closeReason },
      {
        onSuccess: () => {
          setShowClose(false);
          setCloseReason('');
        },
      },
    );
  };

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['task', task.id] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const removeLabel = async (label: string) => {
    if (labels.includes(label)) {
      await del(`/tasks/${task.id}/labels/${encodeURIComponent(label)}`);
    }
  };

  const addLabel = async (label: string) => {
    if (!labels.includes(label)) {
      await post(`/tasks/${task.id}/labels`, { label });
    }
  };

  const stageAction = async (action: () => Promise<void>) => {
    if (actionPending) return;
    setActionPending(true);
    try {
      await action();
    } finally {
      invalidateAll();
      setActionPending(false);
    }
  };

  const handleApproveToQueue = () =>
    stageAction(async () => {
      // Remove current stage label (whatever it is)
      if (stage) await removeLabel(`stage:${stage}`);
      await removeLabel('review:pending');
      await removeLabel('review:escalated');
      await removeLabel('waiting:owner');
      await removeLabel('needs-input');
      await addLabel('stage:queue');
      await addLabel('pipeline:approved');
    });

  const handleClaimAndStart = () =>
    stageAction(async () => {
      const currentStage = stage;
      if (currentStage) await removeLabel(`stage:${currentStage}`);
      await removeLabel('review:pending');
      await removeLabel('waiting:owner');
      await addLabel('stage:execute');
      await addLabel('waiting:session');
      update.mutate({ status: 'in_progress' });
    });

  const handleSendBack = () =>
    stageAction(async () => {
      if (sendBackNote.trim()) {
        const existingNotes = task.notes ?? '';
        const timestamp = new Date().toISOString().split('T')[0];
        const appendedNote = existingNotes
          ? `${existingNotes}\n\n[${timestamp}] Send-back: ${sendBackNote.trim()}`
          : `[${timestamp}] Send-back: ${sendBackNote.trim()}`;
        update.mutate({ notes: appendedNote });
      }
      if (stage) await removeLabel(`stage:${stage}`);
      await removeLabel('review:pending');
      await removeLabel('waiting:owner');
      await addLabel('stage:evaluate');
      setShowSendBack(false);
      setSendBackNote('');
    });

  const handleDefer = () =>
    stageAction(async () => {
      await addLabel('parked');
    });

  const handleRelease = () =>
    stageAction(async () => {
      if (stage) await removeLabel(`stage:${stage}`);
      await removeLabel('waiting:session');
      await addLabel('stage:evaluate');
      update.mutate({ status: 'open' });
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-sm text-faint">{task.id}</span>
          {projectLabel && (
            <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-purple-500/20 text-purple-300">
              {projectLabel}
            </span>
          )}
          {yamlTaskId && (
            <span className="rounded px-1.5 py-0.5 text-xs font-bold bg-teal-500/20 text-teal-300">
              {yamlTaskId}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-primary">{task.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PriorityBadge level={task.priority} />
          <StatusBadge status={task.status} />
          {task.assignee && <span className="text-sm text-muted">Assigned to {task.assignee}</span>}
          {stale && <StaleBadge updatedAt={task.updated_at} />}
        </div>
      </div>

      {/* Conflicting label banner — approved but still has a blocker */}
      {task.status !== 'closed' &&
        hasLabel(labels, 'pipeline:approved') &&
        (hasLabel(labels, 'waiting:owner') || hasLabel(labels, 'needs-input')) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-400">Conflicting state detected</p>
              <p className="text-xs text-muted mt-0.5">
                Task is approved but still has a blocker label (
                {hasLabel(labels, 'waiting:owner') ? 'waiting:owner' : 'needs-input'}) — it won't be
                picked up until the blocker is removed.
              </p>
            </div>
            <button
              onClick={() =>
                stageAction(async () => {
                  await removeLabel('waiting:owner');
                  await removeLabel('needs-input');
                })
              }
              disabled={actionPending}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50 flex-shrink-0"
            >
              {actionPending ? 'Fixing...' : 'Remove blocker'}
            </button>
          </div>
        )}

      {/* Action buttons — all always rendered, grayed out when current state */}
      {task.status !== 'closed' && (
        <div>
          <div className="flex flex-wrap gap-2">
            {/* Approve → Queue */}
            {(() => {
              const isQueued = stage === 'queue' && hasLabel(labels, 'pipeline:approved');
              return (
                <button
                  onClick={isQueued ? undefined : handleApproveToQueue}
                  disabled={actionPending || isQueued}
                  title={
                    isQueued
                      ? 'Already approved and queued'
                      : 'Routes to executor for automated processing'
                  }
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    isQueued
                      ? 'bg-emerald-600/20 text-emerald-600 cursor-default'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50'
                  }`}
                >
                  Approve → Queue
                </button>
              );
            })()}

            {/* Claim & Start */}
            {(() => {
              const isClaimed =
                task.status === 'in_progress' && hasLabel(labels, 'waiting:session');
              return (
                <button
                  onClick={isClaimed ? undefined : handleClaimAndStart}
                  disabled={actionPending || isClaimed}
                  title={
                    isClaimed
                      ? 'Already claimed — working in CLI session'
                      : "You'll work on this in a CLI session"
                  }
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    isClaimed
                      ? 'bg-accent-hover/20 text-accent-hover cursor-default'
                      : 'bg-accent-hover text-white hover:bg-accent disabled:opacity-50'
                  }`}
                >
                  Claim & Start
                </button>
              );
            })()}

            {/* Release */}
            {(() => {
              const isReleased = task.status === 'open' && stage !== 'execute';
              return (
                <button
                  onClick={isReleased ? undefined : handleRelease}
                  disabled={actionPending || isReleased}
                  title={
                    isReleased
                      ? 'Already in open queue'
                      : 'Return to open queue — task-evaluator will re-evaluate'
                  }
                  className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isReleased
                      ? 'border-subtle text-disabled cursor-default'
                      : 'border-b-muted text-muted hover:bg-surface-3 disabled:opacity-50'
                  }`}
                >
                  Release
                </button>
              );
            })()}

            {/* Send Back */}
            {(() => {
              const isSentBack =
                stage === 'evaluate' &&
                !hasLabel(labels, 'waiting:owner') &&
                !hasLabel(labels, 'review:pending') &&
                !hasLabel(labels, 'review:escalated');
              return (
                <button
                  onClick={isSentBack ? undefined : () => setShowSendBack(true)}
                  disabled={actionPending || isSentBack}
                  title={
                    isSentBack ? 'Already in evaluation' : 'Return to evaluation with your feedback'
                  }
                  className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isSentBack
                      ? 'border-amber-500/10 text-amber-700 cursor-default'
                      : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50'
                  }`}
                >
                  Send Back
                </button>
              );
            })()}

            {/* Defer */}
            {(() => {
              const isDeferred = hasLabel(labels, 'parked');
              return (
                <button
                  onClick={isDeferred ? undefined : handleDefer}
                  disabled={actionPending || isDeferred}
                  title={isDeferred ? 'Already parked' : 'Park until ready to revisit'}
                  className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                    isDeferred
                      ? 'border-subtle text-disabled cursor-default'
                      : 'border-b-muted text-muted hover:bg-surface-3 disabled:opacity-50'
                  }`}
                >
                  Defer
                </button>
              );
            })()}

            {/* Watch for Change */}
            {(() => {
              const isWatching = hasLabel(labels, 'waiting:trigger');
              return (
                <button
                  onClick={isWatching ? undefined : () => setShowWatchConfirm(true)}
                  disabled={actionPending || isWatching}
                  title={
                    isWatching
                      ? 'Already watching for Obsidian changes'
                      : 'Watch for changes in Obsidian — task advances automatically when condition is met'
                  }
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    isWatching
                      ? 'bg-cyan-600/20 text-cyan-600 cursor-default'
                      : 'bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600/30 disabled:opacity-50'
                  }`}
                >
                  {isWatching ? '\u{1F441} Watching' : '\u{1F441} Watch for Change'}
                </button>
              );
            })()}

            {/* Close */}
            <button
              onClick={() => handleStatusChange('closed')}
              disabled={actionPending}
              title="Mark complete or won't-do"
              className="rounded bg-surface-muted px-3 py-1.5 text-sm font-medium text-white hover:bg-surface-muted disabled:opacity-50"
            >
              Close
            </button>
          </div>

          {/* Trust override */}
          {(() => {
            const currentTrust = labels.find(l => l.startsWith('trust:'));
            const hasPipelineApproval = hasLabel(labels, 'pipeline:approved');
            const needsApproval = hasLabel(labels, 'pipeline:needs-approval');

            if (hasPipelineApproval && !needsApproval) return null; // already approved, no need

            const trustOptions = [
              { key: 'none', label: 'Default', desc: 'Normal trust cascade', trustLabel: null },
              { key: 'auto-approve', label: 'Auto-Approve', desc: 'Skip approval gates', trustLabel: 'trust:auto-approve' },
              { key: 'high', label: 'High Trust', desc: 'Auto-approve risk:safe', trustLabel: 'trust:high' },
            ];

            const handleTrustChange = async (trustLabel: string | null) => {
              await stageAction(async () => {
                // Remove any existing trust label
                if (currentTrust) await removeLabel(currentTrust);
                // Add new trust label
                if (trustLabel) await addLabel(trustLabel);
                // If auto-approve, also stamp pipeline:approved and re-route to queue
                if (trustLabel === 'trust:auto-approve') {
                  await removeLabel('pipeline:needs-approval');
                  await removeLabel('waiting:owner');
                  await removeLabel('waiting:human');
                  await removeLabel('needs-input');
                  await addLabel('pipeline:approved');
                  await addLabel('auto:ready');
                  if (stage && stage !== 'queue') {
                    await removeLabel(`stage:${stage}`);
                    await addLabel('stage:queue');
                  }
                }
              });
            };

            return (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted">Approval:</span>
                {trustOptions.map(opt => {
                  const isActive = opt.trustLabel ? currentTrust === opt.trustLabel : !currentTrust;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleTrustChange(opt.trustLabel)}
                      disabled={actionPending || isActive}
                      title={opt.desc}
                      className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                        isActive
                          ? opt.key === 'auto-approve' ? 'border-green-500/50 bg-green-500/10 text-green-400 cursor-default'
                            : opt.key === 'high' ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400 cursor-default'
                            : 'border-subtle bg-surface-2 text-secondary cursor-default'
                          : 'border-subtle text-muted hover:border-b-muted hover:text-tertiary disabled:opacity-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Send Back dialog */}
      {showSendBack && (
        <div className="rounded-lg border border-amber-500/20 bg-surface-2 p-4">
          <h3 className="text-sm font-medium text-secondary mb-2">Send Back — Add feedback note</h3>
          <textarea
            value={sendBackNote}
            onChange={(e) => setSendBackNote(e.target.value)}
            className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-amber-500 focus:outline-none"
            rows={2}
            placeholder="Why is this being sent back? (optional)"
            autoFocus
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleSendBack}
              disabled={actionPending}
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {actionPending ? 'Sending...' : 'Confirm Send Back'}
            </button>
            <button
              onClick={() => {
                setShowSendBack(false);
                setSendBackNote('');
              }}
              className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Close dialog */}
      {showClose && (
        <div className="rounded-lg border border-subtle bg-surface-2 p-4">
          <h3 className="text-sm font-medium text-secondary mb-2">Close reason</h3>
          <textarea
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
            rows={2}
            placeholder="Why is this being closed?"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleClose}
              disabled={!closeReason.trim() || close.isPending}
              className="rounded bg-surface-muted px-3 py-1.5 text-sm font-medium text-white hover:bg-surface-muted disabled:opacity-50"
            >
              {close.isPending ? 'Closing...' : 'Confirm Close'}
            </button>
            <button
              onClick={() => setShowClose(false)}
              className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Watch for Change — one-click confirmation */}
      {showWatchConfirm && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 text-sm font-semibold">
              {'\u{1F441}'} Watch for Change
            </span>
            <span className="text-xs text-faint">
              Task advances when condition is met in Obsidian
            </span>
          </div>
          <div>
            <label className="text-xs text-faint block mb-1">
              Condition (optional — auto-generated if empty)
            </label>
            <textarea
              value={watchCondition}
              onChange={(e) => setWatchCondition(e.target.value)}
              placeholder={task.question || `David addresses: ${task.title}`}
              rows={2}
              className="w-full rounded bg-surface-2 border border-subtle px-3 py-2 text-sm text-secondary placeholder-faint focus:border-cyan-500 focus:outline-none resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                createWatch.mutate(
                  watchCondition.trim() ? { condition: watchCondition.trim() } : {},
                  {
                    onSuccess: () => {
                      setShowWatchConfirm(false);
                      setWatchCondition('');
                    },
                  },
                );
              }}
              disabled={createWatch.isPending}
              className="rounded bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
            >
              {createWatch.isPending ? 'Creating...' : 'Start Watching'}
            </button>
            <button
              onClick={() => {
                setShowWatchConfirm(false);
                setWatchCondition('');
              }}
              className="rounded px-4 py-2 text-sm text-muted hover:text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active watch trigger status */}
      {hasLabel(labels, 'waiting:trigger') && activeWatches && activeWatches.length > 0 && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse flex-shrink-0" />
              <span className="text-sm font-medium text-cyan-300">
                Watching for Obsidian changes
              </span>
            </div>
          </div>
          {activeWatches.map((trigger) => (
            <div key={trigger.id} className="px-4 pb-3 space-y-1.5">
              <p className="text-sm text-secondary">{trigger.condition}</p>
              {trigger.file_patterns && trigger.file_patterns.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {trigger.file_patterns.map((p) => (
                    <span
                      key={p}
                      className="text-xs font-mono bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 text-cyan-400"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-faint">
                {trigger.expires_at && (
                  <span>Expires {new Date(trigger.expires_at).toLocaleDateString()}</span>
                )}
                {trigger.check_count > 0 && <span>Checked {trigger.check_count}x</span>}
                <button
                  onClick={() => cancelWatch.mutate(trigger.id)}
                  disabled={cancelWatch.isPending}
                  className="text-red-400/70 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  Cancel watch
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Description */}
      {task.description && (
        <div>
          <h2 className="text-sm font-medium text-muted mb-1">Description</h2>
          <pre className="whitespace-pre-wrap rounded-lg bg-surface-1 border border-default p-4 text-sm text-secondary font-sans">
            {task.description}
          </pre>
        </div>
      )}

      {/* Labels */}
      <div>
        <h2 className="text-sm font-medium text-muted mb-2">Labels</h2>
        <LabelManager taskId={task.id} labels={task.labels ?? []} />
      </div>

      {/* Routing */}
      {task.status !== 'closed' && <RoutingButtons taskId={task.id} labels={task.labels ?? []} />}

      {/* Dependencies & Chain */}
      <DependencyChain task={task} />

      {/* Pipeline Activity Timeline */}
      <ActivityTimeline taskId={task.id} />

      {/* Execution Output Stream */}
      <ExecutionStream
        taskId={task.id}
        isActive={hasLabel(labels, 'active:running') || hasLabel(labels, 'active:claiming')}
      />

      {/* Related Tasks */}
      <RelatedTasks labels={task.labels ?? []} />

      {/* AI Summary */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-muted">AI Summary</h2>
          <button
            onClick={() => {
              setSummaryPreview(null);
              summarize.mutate(
                { save: false },
                {
                  onSuccess: (data) => setSummaryPreview(data.summary),
                },
              );
            }}
            disabled={summarize.isPending}
            className="rounded bg-purple-600/20 border border-purple-500/30 px-2.5 py-1 text-xs text-purple-400 hover:bg-purple-600/30 hover:border-purple-500/50 transition-colors disabled:opacity-50"
          >
            {summarize.isPending ? 'Generating...' : 'Generate Summary'}
          </button>
        </div>
        {summarize.isError && (
          <p className="text-xs text-red-400 mb-2">
            Failed to generate summary: {summarize.error?.message ?? 'Unknown error'}
          </p>
        )}
        {summaryPreview && (
          <div className="rounded-lg border border-purple-500/20 bg-surface-1 p-4 space-y-3">
            <pre className="whitespace-pre-wrap text-sm text-secondary font-sans">
              {summaryPreview}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  summarize.mutate(
                    { save: true },
                    {
                      onSuccess: () => setSummaryPreview(null),
                    },
                  );
                }}
                disabled={summarize.isPending}
                className="rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {summarize.isPending ? 'Saving...' : 'Save to Notes'}
              </button>
              <button
                onClick={() => setSummaryPreview(null)}
                className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notes (editable) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium text-muted">Notes</h2>
          {!editingNotes && (
            <button
              onClick={() => {
                setEditingNotes(true);
                setNotesValue(task.notes ?? '');
              }}
              title={task.notes ? 'Edit the notes on this task' : 'Add notes to this task'}
              className="rounded bg-surface-2 border border-subtle px-2.5 py-1 text-xs text-muted hover:text-accent-text hover:border-b-muted transition-colors"
            >
              {task.notes ? 'Edit Notes' : '+ Add Notes'}
            </button>
          )}
        </div>
        {editingNotes ? (
          <div>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              className="w-full rounded-lg bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none font-sans"
              rows={4}
              autoFocus
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  update.mutate(
                    { notes: notesValue },
                    {
                      onSuccess: () => setEditingNotes(false),
                    },
                  );
                }}
                disabled={update.isPending}
                className="rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50"
              >
                {update.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingNotes(false)}
                className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : task.notes ? (
          <pre
            className="whitespace-pre-wrap rounded-lg bg-surface-1 border border-default p-4 text-sm text-secondary font-sans cursor-pointer hover:border-subtle transition-colors"
            onClick={() => {
              setEditingNotes(true);
              setNotesValue(task.notes ?? '');
            }}
          >
            {task.notes}
          </pre>
        ) : null}
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-faint">Created</span>
          <p className="text-tertiary">{new Date(task.created_at).toLocaleString()}</p>
        </div>
        <div>
          <span className="text-faint">Updated</span>
          <p className="text-tertiary">{new Date(task.updated_at).toLocaleString()}</p>
        </div>
        {task.closed_at && (
          <div>
            <span className="text-faint">Closed</span>
            <p className="text-tertiary">{new Date(task.closed_at).toLocaleString()}</p>
          </div>
        )}
        {task.close_reason && (
          <div>
            <span className="text-faint">Close Reason</span>
            <p className="text-tertiary">{task.close_reason}</p>
          </div>
        )}
        {task.company_id && (
          <div>
            <span className="text-faint">Company</span>
            <p className="text-tertiary">
              {task.company_id}
              {task.objective_id && <span className="text-faint ml-2">→ {task.objective_id}</span>}
            </p>
          </div>
        )}
        {task.external_ref && (
          <div>
            <span className="text-faint">External Ref</span>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {parseExternalRef(task.external_ref).map((link, i) =>
                link.href ? (
                  <a
                    key={i}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={link.href}
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-mono transition-colors ${
                      link.type === 'commit'
                        ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                        : link.type === 'pr'
                          ? 'bg-accent/10 text-accent-text hover:bg-accent/20 border border-accent/20'
                          : 'bg-surface-3 text-tertiary hover:bg-surface-muted border border-b-muted'
                    }`}
                  >
                    {link.type === 'commit' && <span className="text-amber-500/60 text-xs">@</span>}
                    {link.type === 'pr' && <span className="text-accent/60 text-xs">PR</span>}
                    {link.label}
                  </a>
                ) : (
                  <span
                    key={i}
                    className="inline-flex items-center rounded px-2 py-0.5 text-sm font-mono bg-surface-2 text-muted border border-subtle"
                    title={
                      link.type === 'commit' || link.type === 'pr'
                        ? 'Set VITE_GITHUB_REPO to enable link'
                        : undefined
                    }
                  >
                    {link.label}
                  </span>
                ),
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
