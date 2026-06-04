import { useState } from 'react';
import { useStageMetrics } from '../../../api/stage-analytics';
import type { StageAggregate } from '../../../api/stage-analytics';

const STAGE_ORDER = ['intake', 'evaluate', 'route', 'review', 'queue', 'execute'];

const STAGE_COLOR: Record<string, string> = {
  intake: 'bg-slate-400',
  evaluate: 'bg-blue-400',
  route: 'bg-cyan-400',
  review: 'bg-amber-400',
  queue: 'bg-purple-400',
  execute: 'bg-green-400',
};

const STAGE_TEXT: Record<string, string> = {
  intake: 'text-slate-400',
  evaluate: 'text-blue-400',
  route: 'text-cyan-400',
  review: 'text-amber-400',
  queue: 'text-purple-400',
  execute: 'text-green-400',
};

function formatDur(secs: number): string {
  if (secs === 0) return '—';
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Mini horizontal bar representing relative duration */
function DurationBar({
  value,
  max,
  isBottleneck,
}: {
  value: number;
  max: number;
  isBottleneck: boolean;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${isBottleneck ? 'bg-amber-400' : 'bg-blue-400/60'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Throughput sparkline — mini inline bar chart */
function ThroughputBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="flex items-end h-4 w-12 gap-0.5">
      <div
        className="w-full rounded-sm bg-green-400/50 transition-all"
        style={{ height: `${pct}%` }}
        title={`${value}/day`}
      />
    </div>
  );
}

function TimeWindowSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (days: number) => void;
}) {
  const options = [7, 14, 30];
  return (
    <div className="flex gap-1">
      {options.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
            value === d
              ? 'bg-blue-500/30 text-blue-300'
              : 'text-faint hover:text-secondary hover:bg-surface-2'
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function StageRow({
  stage,
  isBottleneck,
  maxAvg,
  maxThr,
}: {
  stage: StageAggregate;
  isBottleneck: boolean;
  maxAvg: number;
  maxThr: number;
}) {
  const color = STAGE_COLOR[stage.stage] ?? 'bg-slate-400';
  const text = STAGE_TEXT[stage.stage] ?? 'text-slate-400';
  return (
    <div
      className={`px-3 py-2.5 rounded-lg border transition-colors ${isBottleneck ? 'border-amber-500/30 bg-amber-500/5' : 'border-default bg-surface-1/30'}`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
          <span className={`text-sm font-medium capitalize ${text}`}>{stage.stage}</span>
          {isBottleneck && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 uppercase tracking-wide">
              Bottleneck
            </span>
          )}
          {stage.count > 0 && (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              {stage.count} now
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs tabular-nums text-muted flex-shrink-0">
          <span title="Average time in stage">avg {formatDur(stage.avgDurationSecs)}</span>
          <span title="P90 time in stage" className="text-faint">
            p90 {formatDur(stage.p90DurationSecs)}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <DurationBar value={stage.avgDurationSecs} max={maxAvg} isBottleneck={isBottleneck} />
        </div>
        <div
          className="flex items-center gap-1.5 flex-shrink-0"
          title={`${stage.throughputPerDay} tasks/day throughput`}
        >
          <ThroughputBar value={stage.throughputPerDay} max={maxThr} />
          <span className="text-[10px] text-faint tabular-nums w-10 text-right">
            {stage.throughputPerDay > 0 ? `${stage.throughputPerDay}/d` : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function StageMetricsPanel() {
  const [days, setDays] = useState(7);
  const { data: metrics, isLoading, isError } = useStageMetrics();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-6 text-center text-sm text-faint">
        Loading stage metrics...
      </div>
    );
  }

  if (isError || !metrics) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        Failed to load stage metrics.
      </div>
    );
  }

  const hasData = metrics.stages.some((s) => s.completedTransitions > 0);
  if (!hasData) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-6 text-center text-sm text-faint">
        No stage transition data yet.
      </div>
    );
  }

  const ordered = STAGE_ORDER.map((name) => metrics.stages.find((s) => s.stage === name)).filter(
    (s): s is StageAggregate => s !== undefined,
  );

  const maxAvg = Math.max(...ordered.map((s) => s.avgDurationSecs), 1);
  const maxThr = Math.max(...ordered.map((s) => s.throughputPerDay), 1);

  return (
    <div className="rounded-lg border border-default bg-surface-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-default bg-surface-1/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-secondary">Stage Health</h3>
          {metrics.bottleneck && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              ⚠ {metrics.bottleneck} is bottleneck
            </span>
          )}
        </div>
        <TimeWindowSelector value={days} onChange={setDays} />
      </div>

      {/* Legend row */}
      <div className="flex items-center justify-between px-4 py-1.5 text-[10px] text-disabled border-b border-default/50">
        <span>Stage · avg time (bar) · p90</span>
        <span>Throughput sparkline · rate/day</span>
      </div>

      {/* Stage rows */}
      <div className="p-3 space-y-2">
        {ordered.map((s) => (
          <StageRow
            key={s.stage}
            stage={s}
            isBottleneck={s.stage === metrics.bottleneck}
            maxAvg={maxAvg}
            maxThr={maxThr}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-default/50 text-[10px] text-disabled">
        <span>{metrics.totalTasksTracked} tasks tracked</span>
        {metrics.oldestTransition && (
          <span>Since {new Date(metrics.oldestTransition).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}
