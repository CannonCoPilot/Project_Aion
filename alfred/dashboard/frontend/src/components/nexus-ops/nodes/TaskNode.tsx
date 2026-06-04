import { Handle, Position } from '@xyflow/react';
import type { GraphNode } from '../../../api/nexus-ops';

const STATUS_STYLES: Record<string, string> = {
  running: 'border-accent-border bg-accent/10',
  completed: 'border-green-500 bg-green-500/10',
  failed: 'border-red-500 bg-red-500/10',
  waiting: 'border-amber-500 bg-amber-500/10',
  idle: 'border-b-muted bg-surface-2',
};

const STATUS_BADGE: Record<string, string> = {
  running: 'bg-accent',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  waiting: 'bg-amber-500',
  idle: 'bg-surface-muted',
};

export function TaskNode({ data }: { data: GraphNode }) {
  const style = STATUS_STYLES[data.status] ?? STATUS_STYLES.idle;
  const badge = STATUS_BADGE[data.status] ?? STATUS_BADGE.idle;
  const eventCount = data.metadata?.eventCount as number | undefined;
  const cost = data.metadata?.cost as number | undefined;

  return (
    <div className={`rounded-lg border-2 px-3 py-2 min-w-[140px] ${style}`}>
      <Handle type="target" position={Position.Left} className="!bg-surface-muted !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block w-2 h-2 rounded-full ${badge}`} />
        <span className="text-xs font-medium text-secondary truncate max-w-[120px]">{data.label}</span>
      </div>

      <div className="flex items-center gap-2 text-[10px] text-faint">
        {eventCount !== undefined && <span>{eventCount} events</span>}
        {cost !== undefined && <span>${cost.toFixed(3)}</span>}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-surface-muted !w-2 !h-2" />
    </div>
  );
}
