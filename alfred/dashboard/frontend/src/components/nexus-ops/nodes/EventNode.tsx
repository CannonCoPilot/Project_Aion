import { Handle, Position } from '@xyflow/react';
import type { GraphNode } from '../../../api/nexus-ops';

const SEVERITY_COLORS: Record<string, string> = {
  info: 'border-accent-border bg-accent/10',
  warn: 'border-amber-500 bg-amber-500/10',
  error: 'border-red-500 bg-red-500/10',
  critical: 'border-red-600 bg-red-600/20',
};

export function EventNode({ data }: { data: GraphNode }) {
  const severity = (data.metadata?.severity as string) ?? 'info';
  const style = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.info;
  const abbr = data.label.slice(0, 3).toUpperCase();

  return (
    <div
      className={`border-2 w-[40px] h-[40px] flex items-center justify-center ${style}`}
      style={{ transform: 'rotate(45deg)' }}
    >
      <Handle type="target" position={Position.Left} className="!bg-surface-muted !w-2 !h-2" style={{ transform: 'rotate(-45deg)' }} />

      <span className="text-[9px] font-bold text-tertiary" style={{ transform: 'rotate(-45deg)' }}>
        {abbr}
      </span>

      <Handle type="source" position={Position.Right} className="!bg-surface-muted !w-2 !h-2" style={{ transform: 'rotate(-45deg)' }} />
    </div>
  );
}
