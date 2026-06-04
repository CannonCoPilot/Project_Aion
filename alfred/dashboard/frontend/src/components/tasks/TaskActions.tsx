import { useState, useRef, useEffect } from 'react';
import { useUpdateTask } from '../../api/mutations';
import { post, del } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { PRIORITIES } from '../../lib/priorities';

interface TaskActionsProps {
  taskId: string;
  status: string;
  priority: number;
  labels: string[];
}

function getStage(labels: string[]): string | null {
  const stageLabel = labels.find((l) => l.startsWith('stage:'));
  return stageLabel ? stageLabel.replace('stage:', '') : null;
}

export function TaskActions({ taskId, status, priority, labels }: TaskActionsProps) {
  const [open, setOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const update = useUpdateTask(taskId);
  const qc = useQueryClient();

  const stage = getStage(labels);
  const hasWaitingDavid = labels.includes('waiting:david');
  const hasReviewPending = labels.includes('review:pending');
  const hasWaitingSession = labels.includes('waiting:session');

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowClose(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const removeLabel = async (label: string) => {
    if (labels.includes(label)) {
      await del(`/tasks/${taskId}/labels/${encodeURIComponent(label)}`);
    }
  };

  const handleClaim = async (e: React.MouseEvent) => {
    stop(e);
    if (actionPending) return;
    setActionPending(true);
    try {
      await post(`/tasks/${taskId}/transition`, {
        scenario: 'route-to-session',
        source: 'dashboard',
        actor: 'david',
      });
    } finally {
      invalidateAll();
      setActionPending(false);
      setOpen(false);
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    stop(e);
    if (!closeReason.trim() || actionPending) return;
    setActionPending(true);
    try {
      // Append close reason as notes, then use complete transition (closes + strips execution labels)
      await update.mutateAsync({ append_notes: `Closed: ${closeReason}` });
      await post(`/tasks/${taskId}/transition`, {
        scenario: 'complete',
        source: 'dashboard',
        actor: 'david',
      });
      setShowClose(false);
      setCloseReason('');
    } finally {
      invalidateAll();
      setActionPending(false);
      setOpen(false);
    }
  };

  const handlePriority = (e: React.MouseEvent, level: number) => {
    stop(e);
    update.mutate({ priority: level });
    setOpen(false);
  };

  const handleApproveToQueue = async (e: React.MouseEvent) => {
    stop(e);
    if (actionPending) return;
    setActionPending(true);
    try {
      await post(`/tasks/${taskId}/transition`, {
        scenario: 'approve',
        source: 'dashboard',
        actor: 'david',
      });
    } finally {
      invalidateAll();
      setActionPending(false);
      setOpen(false);
    }
  };

  const handleQuickApprove = async (e: React.MouseEvent) => {
    stop(e);
    if (actionPending) return;
    setActionPending(true);
    try {
      await removeLabel('waiting:david');
    } finally {
      invalidateAll();
      setActionPending(false);
      setOpen(false);
    }
  };

  const handleRelease = (e: React.MouseEvent) => {
    stop(e);
    update.mutate({ status: 'open' });
    setOpen(false);
  };

  if (status === 'closed') return null;

  return (
    <div ref={ref} className="relative" onClick={stop}>
      <button
        onClick={(e) => {
          stop(e);
          setOpen(!open);
        }}
        className="rounded p-1 text-faint hover:bg-surface-3 hover:text-secondary transition-colors"
        aria-label="Task actions"
        title="Quick actions: approve, claim, close, change priority"
      >
        &#8943;
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-subtle bg-surface-2 shadow-xl">
          {/* Stage-aware quick actions */}
          {(stage === 'review' || hasReviewPending) && (
            <button
              onClick={handleApproveToQueue}
              disabled={actionPending}
              className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-surface-3 rounded-t-lg disabled:opacity-50"
            >
              Approve → Queue
              <span className="block text-[10px] text-faint">Route to executor</span>
            </button>
          )}

          {hasWaitingDavid && stage !== 'review' && !hasReviewPending && (
            <button
              onClick={handleQuickApprove}
              disabled={actionPending}
              className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-surface-3 rounded-t-lg disabled:opacity-50"
            >
              Approve
              <span className="block text-[10px] text-faint">Remove waiting:david</span>
            </button>
          )}

          {status !== 'closed' && !hasWaitingSession && (
            <button
              onClick={handleClaim}
              disabled={actionPending}
              className="w-full px-3 py-2 text-left text-sm text-accent-text hover:bg-surface-3"
            >
              Route to Session
              <span className="block text-[10px] text-faint">Needs interactive CLI session</span>
            </button>
          )}
          {status === 'in_progress' && (
            <button
              onClick={handleRelease}
              disabled={update.isPending}
              className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-surface-3"
            >
              Release
              <span className="block text-[10px] text-faint">Return to open queue</span>
            </button>
          )}

          {/* Close action */}
          {!showClose ? (
            <button
              onClick={(e) => {
                stop(e);
                setShowClose(true);
              }}
              className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-surface-3"
            >
              Close...
            </button>
          ) : (
            <div className="px-3 py-2 border-t border-subtle" onClick={stop}>
              <input
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="Close reason..."
                className="w-full rounded bg-surface-1 border border-b-muted px-2 py-1 text-xs text-primary focus:border-accent-border focus:outline-none mb-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && closeReason.trim())
                    handleClose(e as unknown as React.MouseEvent);
                  if (e.key === 'Escape') {
                    setShowClose(false);
                    setCloseReason('');
                  }
                }}
              />
              <button
                onClick={handleClose}
                disabled={!closeReason.trim() || actionPending}
                className="w-full rounded bg-surface-muted px-2 py-1 text-xs text-white hover:bg-surface-muted disabled:opacity-50"
              >
                {actionPending ? 'Closing...' : 'Confirm'}
              </button>
            </div>
          )}

          {/* Priority submenu */}
          <div className="border-t border-subtle">
            <div className="px-3 py-1.5 text-xs text-faint uppercase">Priority</div>
            {Object.values(PRIORITIES).map((p) => (
              <button
                key={p.level}
                onClick={(e) => handlePriority(e, p.level)}
                disabled={p.level === priority || update.isPending}
                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-surface-3 ${
                  p.level === priority ? 'text-disabled' : p.textClass
                } ${p.level === 4 ? 'rounded-b-lg' : ''}`}
              >
                {p.symbol} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
