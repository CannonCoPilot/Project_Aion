import { Handle, Position } from '@xyflow/react';
import type { GraphNode } from '../../../api/nexus-ops';

const STATUS_STYLES: Record<string, string> = {
  running: 'border-accent-border bg-accent/10',
  completed: 'border-green-500 bg-green-500/10',
  failed: 'border-red-500 bg-red-500/10',
  waiting: 'border-amber-500 bg-amber-500/10',
  idle: 'border-b-muted bg-surface-2',
};

export function PersonaNode({ data }: { data: GraphNode }) {
  const style = STATUS_STYLES[data.status] ?? STATUS_STYLES.idle;
  const tasksProcessed = data.metadata?.tasksProcessed as number | undefined;

  return (
    <div className={`rounded-full border-2 w-[100px] h-[100px] flex flex-col items-center justify-center ${style}`}>
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !w-2 !h-2" />

      <span className="text-xs font-medium text-amber-300 truncate max-w-[80px] text-center">{data.label}</span>
      {tasksProcessed !== undefined && (
        <span className="text-[10px] text-faint mt-0.5">{tasksProcessed} tasks</span>
      )}

      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-2 !h-2" />
    </div>
  );
}
