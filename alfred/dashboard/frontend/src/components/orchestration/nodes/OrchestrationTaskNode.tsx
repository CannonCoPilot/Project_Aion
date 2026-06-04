import { Handle, Position } from '@xyflow/react';

interface OrchestrationTaskNodeData {
  label: string;
  taskId: string;
  status: string;
  phase: string;
  type?: string;
  description?: string;
  dependsOn?: string[];
  when?: string;
  triggerRule?: string;
  executionMode?: string;
  loopMaxIterations?: number;
  hasRetry?: boolean;
  hasOutput?: boolean;
  [key: string]: unknown;
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-green-500',
  in_progress: 'bg-accent animate-pulse',
  running: 'bg-accent animate-pulse',
  pending: 'bg-surface-muted',
  blocked: 'bg-amber-500',
  deferred: 'bg-surface-3',
  skipped: 'bg-surface-3',
  cancelled: 'bg-red-500/30',
  failed: 'bg-red-500',
  paused: 'bg-amber-500',
};

const STATUS_BORDER: Record<string, string> = {
  completed: 'border-green-500/50',
  in_progress: 'border-accent-border',
  running: 'border-accent-border',
  pending: 'border-default',
  blocked: 'border-amber-500/50',
  deferred: 'border-default',
  skipped: 'border-default',
  cancelled: 'border-red-500/20',
  failed: 'border-red-500/50',
  paused: 'border-amber-500/50',
};

export function OrchestrationTaskNode({ data }: { data: OrchestrationTaskNodeData }) {
  const dot = STATUS_DOT[data.status] ?? STATUS_DOT.pending;
  const border = STATUS_BORDER[data.status] ?? STATUS_BORDER.pending;
  const isCancelled = data.status === 'cancelled' || data.status === 'skipped';

  const isLoop = data.executionMode === 'loop';
  const hasWhen = !!data.when;
  const hasOutput = !!data.hasOutput;
  const triggerRule = data.triggerRule;
  const showBadges = isLoop || hasWhen || hasOutput || (triggerRule && triggerRule !== 'all_success');

  return (
    <div className={`rounded-lg border-2 px-3 py-2 min-w-[160px] max-w-[240px] bg-surface-1 ${border} ${isCancelled ? 'opacity-50' : ''}`}>
      <Handle type="target" position={Position.Left} className="!bg-surface-muted !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-0.5">
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className={`text-xs font-medium truncate ${isCancelled ? 'text-faint line-through' : 'text-secondary'}`}>
          {data.label}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-disabled">
        <span className="font-mono">{data.taskId}</span>
        {data.type && data.type !== 'task' && (
          <span className="px-1 rounded bg-surface-2 text-faint">{data.type}</span>
        )}
      </div>

      {/* Feature badges row */}
      {showBadges && (
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {isLoop && (
            <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[9px] bg-orange-500/15 text-orange-400 border border-orange-500/20"
                  title={`Loop: max ${data.loopMaxIterations || 5} iterations`}>
              ↻ {data.loopMaxIterations || 5}
            </span>
          )}
          {hasWhen && (
            <span className="inline-flex items-center px-1 py-px rounded text-[9px] bg-purple-500/15 text-purple-400 border border-purple-500/20"
                  title={`Condition: ${data.when}`}>
              ⊃
            </span>
          )}
          {triggerRule && triggerRule !== 'all_success' && (
            <span className="inline-flex items-center px-1 py-px rounded text-[9px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/20"
                  title={`Trigger rule: ${triggerRule}`}>
              {triggerRule === 'one_success' ? '1✓' : '∀'}
            </span>
          )}
          {hasOutput && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400/60" title="Has stored output" />
          )}
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-surface-muted !w-2 !h-2" />
    </div>
  );
}
