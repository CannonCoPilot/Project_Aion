import { useState, useEffect, useCallback } from 'react';
import { useTaskList, useTaskEvents } from '../api/tasks';
import { useUpdateTask, useCloseTask } from '../api/mutations';
import { useCompany } from '../hooks/useCompany';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '../api/client';
import { Header } from '../components/layout/Header';
import { PriorityBadge } from '../components/tasks/PriorityBadge';
import { StatusBadge } from '../components/tasks/StatusBadge';
import { LabelChip } from '../components/tasks/LabelChip';
import { RelatedTasks } from '../components/tasks/RelatedTasks';
import { EventTimeline } from '../components/events/EventTimeline';
import { Link } from 'react-router-dom';

type TriageAction = 'claim' | 'defer' | 'close' | 'skip' | 'action';

function isCompletedResearch(labels: string[]): boolean {
  return labels.includes('type:research') && labels.includes('review:pending');
}

function useActionResearch(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      priority?: number;
      labels?: string[];
    }) => post<{ message: string; followUp: string }>(`/pipeline/${id}/action-research`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}

export default function TriagePage() {
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<'ready' | 'all'>('ready');
  const [closeReason, setCloseReason] = useState('');
  const [showClose, setShowClose] = useState(false);
  const [showAction, setShowAction] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [actionDesc, setActionDesc] = useState('');
  const [actionPending, setActionPending] = useState(false);

  const { company: companySlug, isFiltered: companyFiltered } = useCompany();
  const companyFilter = companyFiltered ? companySlug : undefined;

  const readyFilters =
    mode === 'ready'
      ? { ready: 'true', sort: 'priority', order: 'asc' as const, company: companyFilter }
      : {
          status: 'open,in_progress',
          sort: 'priority',
          order: 'asc' as const,
          company: companyFilter,
        };

  const { data: tasks, isLoading } = useTaskList(readyFilters);
  const taskList = tasks ?? [];
  const task = taskList[index];

  const update = useUpdateTask(task?.id ?? '');
  const close = useCloseTask(task?.id ?? '');
  const actionResearch = useActionResearch(task?.id ?? '');
  const { data: events } = useTaskEvents(task?.id);
  const isResearch = task ? isCompletedResearch(task.labels ?? []) : false;

  const total = taskList.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));

  useEffect(() => {
    if (index !== safeIndex) setIndex(safeIndex); // eslint-disable-line react-hooks/set-state-in-effect
  }, [index, safeIndex]);

  const advance = useCallback(() => {
    setShowClose(false);
    setShowAction(false);
    setCloseReason('');
    setActionTitle('');
    setActionDesc('');
    setActionPending(false);
  }, []);

  const handleAction = useCallback(
    (action: TriageAction) => {
      if (!task || actionPending) return;

      if (action === 'skip') {
        setIndex((i) => Math.min(i + 1, total - 1));
        return;
      }

      if (action === 'close') {
        setShowClose(true);
        setShowAction(false);
        return;
      }

      if (action === 'action') {
        setShowAction(true);
        setShowClose(false);
        return;
      }

      setActionPending(true);

      if (action === 'claim') {
        update.mutate(
          { status: 'in_progress' },
          {
            onSettled: advance,
          },
        );
      } else if (action === 'defer') {
        update.mutate(
          { priority: 4 },
          {
            onSettled: advance,
          },
        );
      }
    },
    [task, actionPending, total, update, advance],
  );

  const handleActionResearch = useCallback(() => {
    if (!actionTitle.trim() || !task) return;
    setActionPending(true);
    actionResearch.mutate(
      { title: actionTitle.trim(), description: actionDesc.trim() || undefined },
      { onSettled: advance },
    );
  }, [actionTitle, actionDesc, task, actionResearch, advance]);

  const handleClose = useCallback(() => {
    if (!closeReason.trim() || !task) return;
    setActionPending(true);
    close.mutate(
      { reason: closeReason },
      {
        onSettled: advance,
      },
    );
  }, [closeReason, task, close, advance]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't capture when typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          setShowClose(false);
          setShowAction(false);
          setCloseReason('');
          setActionTitle('');
          setActionDesc('');
        }
        return;
      }

      switch (e.key) {
        case '1':
        case 'c':
          handleAction(isResearch ? 'action' : 'claim');
          break;
        case '2':
        case 'd':
          handleAction('defer');
          break;
        case '3':
        case 'x':
          handleAction('close');
          break;
        case '4':
        case 's':
        case 'ArrowRight':
          handleAction('skip');
          break;
        case 'ArrowLeft':
          setIndex((i) => Math.max(i - 1, 0));
          break;
        case '?':
          e.preventDefault();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleAction, isResearch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-faint">Loading tasks...</div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="space-y-4">
        <Header title="Triage" />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-xl font-bold text-primary mb-2">All caught up!</h2>
          <p className="text-faint">
            {mode === 'ready' ? 'No ready tasks to triage.' : 'No open tasks to triage.'}
          </p>
          {mode === 'ready' && (
            <button
              onClick={() => {
                setMode('all');
                setIndex(0);
              }}
              className="mt-4 rounded bg-surface-3 px-4 py-2 text-sm text-secondary hover:bg-surface-muted"
            >
              Triage all open tasks
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header with progress */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primary">Triage</h2>
          <p className="text-sm text-faint mt-0.5">
            Task {safeIndex + 1} of {total} {mode === 'ready' ? 'ready' : 'open'}
          </p>
          <p className="text-[10px] font-mono text-ghost mt-0.5">
            {mode === 'ready'
              ? 'auto:ready + no blocker labels + not deferred'
              : 'status = open | in_progress'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setMode(mode === 'ready' ? 'all' : 'ready');
              setIndex(0);
            }}
            className="rounded bg-surface-2 px-3 py-1.5 text-xs text-muted hover:text-secondary hover:bg-surface-3 border border-subtle"
          >
            {mode === 'ready' ? 'Show all open' : 'Ready only'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${((safeIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Task card */}
      <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
        {/* Task header */}
        <div className="p-6 border-b border-default">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Link
                to={`/tasks/${task.id}`}
                className="font-mono text-xs text-faint hover:text-accent-text transition-colors"
              >
                {task.id}
              </Link>
              <h2 className="text-lg font-bold text-primary mt-1">{task.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <PriorityBadge level={task.priority} />
                <StatusBadge status={task.status} />
                {task.assignee && (
                  <span className="text-sm text-muted">Assigned to {task.assignee}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Research complete banner */}
        {isResearch && (
          <div className="mx-6 mt-4 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-sm font-semibold">RESEARCH COMPLETE</span>
              <span className="text-xs text-faint">
                Review findings below, then Action or Close
              </span>
            </div>
          </div>
        )}

        {/* Task body */}
        <div className="p-6 space-y-4">
          {/* Description */}
          {task.description && (
            <div>
              <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-1">
                Description
              </h3>
              <pre className="whitespace-pre-wrap text-sm text-secondary font-sans">
                {task.description}
              </pre>
            </div>
          )}

          {/* Labels */}
          {task.labels && task.labels.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-1">
                Labels
              </h3>
              <div className="flex flex-wrap gap-1">
                {task.labels.map((l) => (
                  <LabelChip key={l} label={l} />
                ))}
              </div>
            </div>
          )}

          {/* Related Tasks */}
          <RelatedTasks labels={task.labels ?? []} />

          {/* Notes */}
          {task.notes && (
            <div>
              <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-1">
                Notes
              </h3>
              <pre className="whitespace-pre-wrap text-sm text-tertiary font-sans bg-surface-base rounded-lg p-3 border border-default">
                {task.notes}
              </pre>
            </div>
          )}

          {/* Event history */}
          {events && events.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
                History
              </h3>
              <EventTimeline events={events} />
            </div>
          )}

          {/* Metadata */}
          <div className="flex gap-6 text-xs text-faint pt-2 border-t border-default">
            <span>Created {new Date(task.created_at).toLocaleDateString()}</span>
            <span>Updated {new Date(task.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Close reason input */}
        {showClose && (
          <div className="px-6 pb-4">
            <div className="rounded-lg border border-subtle bg-surface-2 p-3">
              <input
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="Close reason..."
                className="w-full rounded bg-surface-1 border border-b-muted px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && closeReason.trim()) handleClose();
                  if (e.key === 'Escape') {
                    setShowClose(false);
                    setCloseReason('');
                  }
                }}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleClose}
                  disabled={!closeReason.trim() || actionPending}
                  className="rounded bg-surface-muted px-3 py-1.5 text-sm font-medium text-white hover:bg-surface-muted disabled:opacity-50"
                >
                  {actionPending ? 'Closing...' : 'Confirm Close'}
                </button>
                <button
                  onClick={() => {
                    setShowClose(false);
                    setCloseReason('');
                  }}
                  className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action research — create follow-up task */}
        {showAction && (
          <div className="px-6 pb-4">
            <div className="rounded-lg border border-green-700/50 bg-green-500/5 p-3 space-y-2">
              <p className="text-xs font-medium text-green-400 uppercase tracking-wider">
                Create implementation task from research
              </p>
              <input
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
                placeholder="Task title (e.g., Build policy enforcement hook for sensitive personas)"
                className="w-full rounded bg-surface-1 border border-b-muted px-3 py-2 text-sm text-primary focus:border-green-500 focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && actionTitle.trim()) handleActionResearch();
                  if (e.key === 'Escape') {
                    setShowAction(false);
                    setActionTitle('');
                    setActionDesc('');
                  }
                }}
              />
              <textarea
                value={actionDesc}
                onChange={(e) => setActionDesc(e.target.value)}
                placeholder="Description (optional — research will be linked automatically)"
                className="w-full rounded bg-surface-1 border border-b-muted px-3 py-2 text-sm text-primary focus:border-green-500 focus:outline-none resize-none"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleActionResearch}
                  disabled={!actionTitle.trim() || actionPending}
                  className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                >
                  {actionPending ? 'Creating...' : 'Create Task & Close Research'}
                </button>
                <button
                  onClick={() => {
                    setShowAction(false);
                    setActionTitle('');
                    setActionDesc('');
                  }}
                  className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary"
                >
                  Cancel
                </button>
              </div>
              {actionResearch.isSuccess && (
                <p className="text-sm text-green-400">Follow-up task created.</p>
              )}
              {actionResearch.isError && (
                <p className="text-sm text-red-400">
                  Error: {(actionResearch.error as Error)?.message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center gap-2 p-4 bg-surface-base border-t border-default">
          {isResearch ? (
            <button
              onClick={() => handleAction('action')}
              disabled={actionPending}
              title="Create an implementation task from this research (key: 1 or C)"
              className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              <span className="hidden sm:inline">1 </span>Action
            </button>
          ) : (
            <button
              onClick={() => handleAction('claim')}
              disabled={actionPending}
              title="Claim this task and set status to In Progress (key: 1 or C)"
              className="flex-1 rounded-lg bg-accent-hover px-4 py-2.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50 transition-colors"
            >
              <span className="hidden sm:inline">1 </span>Claim & Start
            </button>
          )}
          <button
            onClick={() => handleAction('defer')}
            disabled={actionPending}
            title="Move to Backlog priority — deal with it later (key: 2 or D)"
            className="flex-1 rounded-lg bg-surface-3 px-4 py-2.5 text-sm font-medium text-secondary hover:bg-surface-muted disabled:opacity-50 transition-colors"
          >
            <span className="hidden sm:inline">2 </span>Defer
          </button>
          <button
            onClick={() => handleAction('close')}
            disabled={actionPending}
            title="Close this task with a reason (key: 3 or X)"
            className="flex-1 rounded-lg bg-surface-3 px-4 py-2.5 text-sm font-medium text-secondary hover:bg-surface-muted disabled:opacity-50 transition-colors"
          >
            <span className="hidden sm:inline">3 </span>Close
          </button>
          <button
            onClick={() => handleAction('skip')}
            disabled={actionPending}
            title="Skip to the next task without any changes (key: 4 or S)"
            className="flex-1 rounded-lg bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-3 hover:text-secondary disabled:opacity-50 transition-colors border border-subtle"
          >
            <span className="hidden sm:inline">4 </span>Skip
          </button>
        </div>
      </div>

      {/* Navigation and keyboard hint */}
      <div className="flex items-center justify-between text-xs text-disabled">
        <div className="flex gap-4">
          <button
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            disabled={safeIndex === 0}
            className="hover:text-muted disabled:opacity-30"
          >
            &larr; Previous
          </button>
          <button
            onClick={() => setIndex((i) => Math.min(i + 1, total - 1))}
            disabled={safeIndex >= total - 1}
            className="hover:text-muted disabled:opacity-30"
          >
            Next &rarr;
          </button>
        </div>
        <span>
          Keys: <kbd className="px-1 rounded bg-surface-2">1</kbd> {isResearch ? 'action' : 'claim'}
          <kbd className="ml-2 px-1 rounded bg-surface-2">2</kbd> defer
          <kbd className="ml-2 px-1 rounded bg-surface-2">3</kbd> close
          <kbd className="ml-2 px-1 rounded bg-surface-2">4</kbd> skip
          <kbd className="ml-2 px-1 rounded bg-surface-2">&larr;&rarr;</kbd> navigate
        </span>
      </div>
    </div>
  );
}
