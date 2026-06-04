import { Handle, Position } from '@xyflow/react';
import type { GraphNode } from '../../../api/nexus-ops';

export function ProjectNode({ data }: { data: GraphNode }) {
  const taskCount = data.metadata?.taskCount as number | undefined;

  return (
    <div className="rounded-lg border-2 border-dashed border-b-muted bg-surface-1/50 px-4 py-3 min-w-[160px]">
      <Handle type="target" position={Position.Left} className="!bg-surface-muted !w-2 !h-2" />

      <div className="text-xs font-medium text-tertiary">{data.label}</div>
      {taskCount !== undefined && (
        <div className="text-[10px] text-faint mt-0.5">{taskCount} tasks</div>
      )}
    </div>
  );
}
