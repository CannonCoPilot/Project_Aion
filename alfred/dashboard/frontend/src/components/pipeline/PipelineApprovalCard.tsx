import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '../../api/client';
import type { Task } from '../../api/tasks';

type PipelineAction = 'approve' | 'modify' | 'pause' | 'cancel';

function usePipelineAction(id: string, action: PipelineAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { comment?: string }) =>
      post<{ message: string }>(`/pipeline/${id}/${action}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', id] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['task-events', id] });
    },
  });
}

function getRiskColor(labels: string[]): {
  border: string;
  bg: string;
  text: string;
  label: string;
} {
  if (labels.includes('risk:destructive')) {
    return {
      border: 'border-red-500/50',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      label: 'DESTRUCTIVE',
    };
  }
  if (labels.includes('risk:moderate')) {
    return {
      border: 'border-amber-500/50',
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      label: 'MODERATE',
    };
  }
  return {
    border: 'border-accent/50',
    bg: 'bg-accent/10',
    text: 'text-accent-text',
    label: 'SAFE',
  };
}

function extractEvaluation(notes: string | undefined): { summary: string; details: string } | null {
  if (!notes) return null;
  const evalMatch = notes.match(/## Evaluation[\s\S]*?(?=\n## |$)/);
  if (!evalMatch) return null;

  const lines = evalMatch[0].split('\n').filter((l) => l.trim());
  const summary = lines
    .slice(1, 4)
    .map((l) => l.replace(/^- /, ''))
    .join(' | ');
  return { summary, details: evalMatch[0] };
}

function extractScope(_labels: string[]): string {
  return '';
}

export function PipelineApprovalCard({ task }: { task: Task }) {
  const labels = task.labels ?? [];

  const [comment, setComment] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [confirmAction, setConfirmAction] = useState<PipelineAction | null>(null);

  const approve = usePipelineAction(task.id, 'approve');
  const modify = usePipelineAction(task.id, 'modify');
  const pause = usePipelineAction(task.id, 'pause');
  const cancel = usePipelineAction(task.id, 'cancel');

  // Don't show if already approved without a pending needs-approval override
  const alreadyApproved =
    labels.includes('pipeline:approved') && !labels.includes('pipeline:needs-approval');
  const needsApproval =
    !alreadyApproved &&
    (labels.includes('pipeline:needs-approval') ||
      (labels.includes('stage:review') &&
        (labels.includes('waiting:david') || labels.includes('needs-input'))));

  if (!needsApproval || task.status === 'closed') return null;

  const isLoading = approve.isPending || modify.isPending || pause.isPending || cancel.isPending;
  const risk = getRiskColor(labels);
  const evaluation = extractEvaluation(task.notes);
  const scope = extractScope(labels);
  const isNeedsInput = labels.includes('needs-input');

  const handleAction = (action: PipelineAction) => {
    if (action === 'cancel' && !confirmAction) {
      setConfirmAction('cancel');
      return;
    }
    if (action === 'modify' && !comment.trim()) return;

    const mutation = { approve, modify, pause, cancel }[action];
    mutation.mutate(
      { comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setComment('');
          setConfirmAction(null);
        },
      },
    );
  };

  return (
    <div className={`rounded-lg border-2 ${risk.border} ${risk.bg} p-4 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="animate-pulse h-2 w-2 rounded-full bg-amber-400" />
          <span className="text-sm font-semibold text-secondary">
            {isNeedsInput ? 'INPUT NEEDED' : 'APPROVAL REQUIRED'}
          </span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${risk.bg} ${risk.text}`}>
          Risk: {risk.label}
        </span>
      </div>

      {/* Executive Summary */}
      {evaluation && (
        <div className="space-y-2">
          <p className="text-sm text-tertiary">{evaluation.summary}</p>
          {scope && <p className="text-xs text-faint">{scope}</p>}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-accent-text hover:text-accent-text-light"
          >
            {showDetails ? '- Hide details' : '+ View full evaluation'}
          </button>
          {showDetails && (
            <pre className="text-xs text-muted bg-surface-1 rounded p-3 overflow-x-auto whitespace-pre-wrap">
              {evaluation.details}
            </pre>
          )}
        </div>
      )}

      {/* Comment Input */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={
          isNeedsInput ? 'Answer the questions above...' : 'Add a comment (optional for approve)...'
        }
        className="w-full bg-surface-1 border border-subtle rounded px-3 py-2 text-sm text-secondary placeholder-faint focus:outline-none focus:border-accent-border resize-none"
        rows={2}
        disabled={isLoading}
      />

      {/* Action Buttons */}
      {confirmAction === 'cancel' ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-red-400">Cancel this task?</span>
          <button
            onClick={() => handleAction('cancel')}
            disabled={isLoading}
            className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
          >
            Yes, cancel
          </button>
          <button
            onClick={() => setConfirmAction(null)}
            className="px-3 py-1.5 text-sm font-medium rounded bg-surface-3 hover:bg-surface-muted text-secondary"
          >
            No, go back
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('approve')}
            disabled={isLoading}
            className="px-4 py-1.5 text-sm font-medium rounded bg-green-600 hover:bg-green-500 text-white disabled:opacity-50"
          >
            {approve.isPending ? 'Approving...' : 'Approve'}
          </button>
          <button
            onClick={() => handleAction('modify')}
            disabled={isLoading || !comment.trim()}
            className="px-4 py-1.5 text-sm font-medium rounded bg-accent-hover hover:bg-accent text-white disabled:opacity-50"
            title={!comment.trim() ? 'Add a comment first' : undefined}
          >
            {modify.isPending ? 'Sending...' : 'Modify'}
          </button>
          <button
            onClick={() => handleAction('pause')}
            disabled={isLoading}
            className="px-4 py-1.5 text-sm font-medium rounded bg-surface-muted hover:bg-surface-muted text-secondary disabled:opacity-50"
          >
            {pause.isPending ? 'Pausing...' : 'Pause'}
          </button>
          <button
            onClick={() => setConfirmAction('cancel')}
            disabled={isLoading}
            className="px-4 py-1.5 text-sm font-medium rounded text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Action descriptions */}
      {!confirmAction && (
        <p className="text-xs text-disabled leading-relaxed">
          <span className="text-green-500/70">Approve</span> runs the task &middot;{' '}
          <span className="text-accent/70">Modify</span> sends back to evaluator with your notes
          &middot; <span className="text-faint">Pause</span> shelves to backlog &middot;{' '}
          <span className="text-red-500/70">Cancel</span> closes the task
        </p>
      )}

      {/* Success/Error feedback */}
      {approve.isSuccess && <p className="text-sm text-green-400">Task approved for execution.</p>}
      {modify.isSuccess && (
        <p className="text-sm text-accent-text">Modification sent — task will be re-evaluated.</p>
      )}
      {pause.isSuccess && <p className="text-sm text-muted">Task paused.</p>}
      {cancel.isSuccess && <p className="text-sm text-red-400">Task cancelled.</p>}
      {(approve.isError || modify.isError || pause.isError || cancel.isError) && (
        <p className="text-sm text-red-400">
          Error:{' '}
          {((approve.error || modify.error || pause.error || cancel.error) as Error)?.message}
        </p>
      )}
    </div>
  );
}
