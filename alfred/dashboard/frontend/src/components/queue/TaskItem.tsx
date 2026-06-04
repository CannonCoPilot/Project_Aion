import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '../../api/tasks';
import { useUpdateTask, useCloseTask } from '../../api/mutations';
import { post, del } from '../../api/client';
import { PriorityBadge } from '../tasks/PriorityBadge';
import { StatusBadge } from '../tasks/StatusBadge';
import { LabelChip } from '../tasks/LabelChip';
import { StaleBadge, isStale } from '../tasks/StaleBadge';

export function InlineResponse({ task }: { task: Task }) {
  const [response, setResponse] = useState('');
  const [showInput, setShowInput] = useState(false);
  const update = useUpdateTask(task.id);
  const qc = useQueryClient();

  const handleSubmit = async () => {
    if (!response.trim()) return;
    const newNotes = task.notes ? `${task.notes}\n\n[David]: ${response}` : `[David]: ${response}`;
    update.mutate(
      { notes: newNotes },
      {
        onSuccess: async () => {
          try {
            await del(`/tasks/${task.id}/labels/${encodeURIComponent('waiting:david')}`);
            await del(`/tasks/${task.id}/labels/${encodeURIComponent('needs-input')}`).catch(
              () => {},
            );
            await del(
              `/tasks/${task.id}/labels/${encodeURIComponent('pipeline:needs-approval')}`,
            ).catch(() => {});
            await post(`/tasks/${task.id}/labels`, { label: 'auto:candidate' });
          } catch {
            // Label change is best-effort
          }
          qc.invalidateQueries({ queryKey: ['tasks'] });
          qc.invalidateQueries({ queryKey: ['stats'] });
          setResponse('');
          setShowInput(false);
        },
      },
    );
  };

  if (!showInput) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowInput(true);
        }}
        title="Answer a question or give direction, then move this task to Nexus for execution"
        className="rounded bg-accent-hover/20 border border-accent/30 px-2.5 py-1 text-xs font-medium text-accent-text hover:bg-accent-hover/30 transition-colors"
      >
        Respond & Unblock
      </button>
    );
  }

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <textarea
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Your answer / decision..."
        className="w-full rounded bg-surface-1 border border-subtle px-3 py-2 text-sm text-primary focus:border-accent-border focus:outline-none"
        rows={2}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.metaKey && response.trim()) handleSubmit();
          if (e.key === 'Escape') {
            setShowInput(false);
            setResponse('');
          }
        }}
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={!response.trim() || update.isPending}
          className="rounded bg-accent-hover px-3 py-1 text-xs font-medium text-white hover:bg-accent disabled:opacity-50"
        >
          {update.isPending ? 'Saving...' : 'Submit & move to Nexus'}
        </button>
        <button
          onClick={() => {
            setShowInput(false);
            setResponse('');
          }}
          className="text-xs text-faint hover:text-tertiary"
        >
          Cancel
        </button>
        <span className="text-[10px] text-disabled ml-auto">Cmd+Enter to submit</span>
      </div>
    </div>
  );
}

export function QuickCloseButton({ task }: { task: Task }) {
  const [reason, setReason] = useState('');
  const [showInput, setShowInput] = useState(false);
  const close = useCloseTask(task.id);

  if (!showInput) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowInput(true);
        }}
        className="text-xs text-faint hover:text-tertiary transition-colors"
      >
        Close
      </button>
    );
  }

  return (
    <div className="mt-1 flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Close reason..."
        className="flex-1 rounded bg-surface-1 border border-b-muted px-2 py-1 text-xs text-primary focus:border-accent-border focus:outline-none"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && reason.trim()) close.mutate({ reason });
          if (e.key === 'Escape') setShowInput(false);
        }}
      />
      <button
        onClick={() => reason.trim() && close.mutate({ reason })}
        disabled={!reason.trim() || close.isPending}
        className="rounded bg-surface-muted px-2 py-1 text-xs text-white hover:bg-surface-muted disabled:opacity-50"
      >
        {close.isPending ? '...' : 'Close'}
      </button>
    </div>
  );
}

export function TaskItem({ task, showRespond = false }: { task: Task; showRespond?: boolean }) {
  const stale = task.status !== 'closed' && isStale(task.updated_at);

  return (
    <div
      className={`rounded-lg border bg-surface-1 p-3 hover:bg-surface-2/50 transition-colors ${stale ? 'border-amber-500/30' : 'border-default'}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <PriorityBadge level={task.priority} />
            <StatusBadge status={task.status} />
            {stale && <StaleBadge updatedAt={task.updated_at} />}
          </div>
          <Link to={`/tasks/${task.id}`} className="group">
            <span className="font-mono text-xs text-faint group-hover:text-accent-text">
              {task.id}
            </span>
            <h3 className="font-medium text-primary group-hover:text-white transition-colors">
              {task.title}
            </h3>
          </Link>
          {task.description && (
            <p className="text-xs text-faint mt-1 line-clamp-2">{task.description}</p>
          )}
          {task.notes && (
            <div className="mt-1 text-xs text-muted bg-surface-base rounded px-2 py-1 line-clamp-2 border border-default">
              {task.notes}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-2">
            {(task.labels ?? [])
              .filter((l) => !l.startsWith('waiting:') && l !== 'parked')
              .map((l) => (
                <LabelChip key={l} label={l} />
              ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            {showRespond && <InlineResponse task={task} />}
            <QuickCloseButton task={task} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Section({
  title,
  count,
  color,
  children,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  color: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-2"
      >
        <span className="text-xs text-disabled">{open ? '\u25BC' : '\u25B6'}</span>
        <h3 className="text-sm font-semibold text-secondary">{title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{count}</span>
      </button>
      {open && <div className="space-y-2 ml-4">{children}</div>}
    </div>
  );
}
