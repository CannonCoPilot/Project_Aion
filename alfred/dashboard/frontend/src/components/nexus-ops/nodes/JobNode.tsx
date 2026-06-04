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

export function JobNode({ data }: { data: GraphNode }) {
  const style = STATUS_STYLES[data.status] ?? STATUS_STYLES.idle;
  const badge = STATUS_BADGE[data.status] ?? STATUS_BADGE.idle;
  const cost = data.metadata?.cost as number | undefined;

  return (
    <div
      className={`border-2 px-3 py-2 min-w-[140px] ${style}`}
      style={{ clipPath: 'polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)' }}
    >
      <Handle type="target" position={Position.Left} className="!bg-purple-400 !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1 px-2">
        <span className={`inline-block w-2 h-2 rounded-full ${badge}`} />
        <span className="text-xs font-medium text-purple-300 truncate max-w-[100px]">{data.label}</span>
      </div>

      {cost !== undefined && (
        <div className="text-[10px] text-faint px-2">${cost.toFixed(3)}</div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-purple-400 !w-2 !h-2" />
    </div>
  );
}
