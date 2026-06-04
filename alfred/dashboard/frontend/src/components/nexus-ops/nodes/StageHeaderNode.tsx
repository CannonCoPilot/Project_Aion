import { Handle, Position } from '@xyflow/react';

export interface StageHeaderData {
  label: string;
  count: number;
  avgDurationSecs: number;
  throughputPerDay: number;
  isBottleneck?: boolean;
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  if (secs < 86400) return `${(secs / 3600).toFixed(1)}h`;
  return `${(secs / 86400).toFixed(1)}d`;
}

export function StageHeaderNode({ data }: { data: StageHeaderData }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 min-w-[200px] text-center select-none ${
        data.isBottleneck
          ? 'border-amber-500/50 bg-amber-500/5'
          : 'border-border/30 bg-surface-2/50'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />

      <div className="text-sm font-semibold text-primary mb-1">{data.label}</div>

      <div className="flex items-center justify-center gap-3 text-[10px] text-faint">
        <span className="font-medium text-secondary">{data.count} tasks</span>
        {data.avgDurationSecs > 0 && (
          <span title="Avg time in stage">~{formatDuration(data.avgDurationSecs)}</span>
        )}
        {data.throughputPerDay > 0 && (
          <span title="Tasks/day throughput">{data.throughputPerDay}/d</span>
        )}
      </div>

      {data.isBottleneck && (
        <div className="mt-1 text-[9px] text-amber-400 font-medium">BOTTLENECK</div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  );
}
