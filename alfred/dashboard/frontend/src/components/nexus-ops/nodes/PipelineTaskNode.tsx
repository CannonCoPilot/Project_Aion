import { Handle, Position } from '@xyflow/react';

export interface PipelineTaskData {
  id: string;
  title: string;
  status: string;
  priority: number;
  stageEnteredAt: string | null;
  labels: string[];
  decision?: { action: string; confidence?: number; risk?: string };
  dimmed?: boolean;
  focused?: boolean;
}

const STATUS_DOT: Record<string, string> = {
  open: 'bg-amber-500',
  in_progress: 'bg-accent',
  closed: 'bg-green-500',
  deferred: 'bg-surface-muted',
};

const PRIORITY_BADGE: Record<number, { label: string; color: string }> = {
  0: { label: 'P0', color: 'text-red-400' },
  1: { label: 'P1', color: 'text-red-400' },
  2: { label: 'P2', color: 'text-amber-400' },
  3: { label: 'P3', color: 'text-faint' },
  4: { label: 'P4', color: 'text-faint' },
};

const RISK_COLORS: Record<string, string> = {
  safe: 'text-green-400',
  moderate: 'text-amber-400',
  destructive: 'text-red-400',
};

function timeAgo(iso: string): string {
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${(secs / 3600).toFixed(1)}h`;
  return `${(secs / 86400).toFixed(1)}d`;
}

export function PipelineTaskNode({ data }: { data: PipelineTaskData }) {
  const dot = STATUS_DOT[data.status] ?? STATUS_DOT.open;
  const pri = PRIORITY_BADGE[data.priority] ?? PRIORITY_BADGE[3];
  const risk = data.decision?.risk;

  return (
    <div
      className={`rounded border px-2.5 py-1.5 min-w-[180px] max-w-[220px] transition-opacity duration-200 cursor-pointer ${
        data.focused
          ? 'border-accent bg-accent/10 ring-1 ring-accent/40'
          : 'border-border/40 bg-surface hover:border-border'
      }`}
      style={{ opacity: data.dimmed ? 0.3 : 1 }}
    >
      <Handle type="target" position={Position.Left} className="!bg-surface-muted !w-1.5 !h-1.5" />

      <div className="flex items-center gap-1.5 mb-0.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <span className="text-[11px] font-medium text-secondary truncate">{data.title}</span>
      </div>

      <div className="flex items-center gap-2 text-[9px] text-faint">
        <span className={`font-medium ${pri.color}`}>{pri.label}</span>
        {data.stageEnteredAt && (
          <span title="Time in current stage">{timeAgo(data.stageEnteredAt)}</span>
        )}
        {risk && <span className={`font-medium ${RISK_COLORS[risk] ?? ''}`}>{risk}</span>}
        {data.labels.includes('waiting:david') && <span className="text-amber-400">waiting</span>}
        {data.labels.includes('parked') && <span className="text-faint">parked</span>}
      </div>

      <Handle type="source" position={Position.Right} className="!bg-surface-muted !w-1.5 !h-1.5" />
    </div>
  );
}
