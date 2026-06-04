import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePipelineStatus, usePipelineStages, type RecentExecution } from '../api/pipeline';
import { useStageMetrics } from '../api/stage-analytics';
import { PriorityBadge } from '../components/tasks/PriorityBadge';
import { LabelChip } from '../components/tasks/LabelChip';
import { PipelineTimeline } from '../components/pipeline/PipelineTimeline';
import { BLOCKER_LABELS as CANONICAL_BLOCKER_LABELS } from '../lib/board';

// --- Helpers ---

function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null) return '--';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function formatTimeAgo(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatCost(cost: number | undefined | null): string {
  if (cost == null || cost === 0) return '--';
  return `$${cost.toFixed(2)}`;
}

function dispatcherColor(status: string): { dot: string; text: string; label: string } {
  if (status === 'healthy' || status === 'ok')
    return { dot: 'bg-green-500', text: 'text-green-400', label: 'Healthy' };
  if (status === 'stale') return { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Stale' };
  return { dot: 'bg-red-500', text: 'text-red-400', label: 'Down' };
}

function blockerReason(label: string): string {
  if (label === 'waiting:david') return 'Waiting for your input';
  if (label === 'needs-input') return 'Needs more information';
  if (label === 'parked') return 'Parked (deferred)';
  if (label.startsWith('waiting:')) return `Waiting on: ${label.replace('waiting:', '')}`;
  return label;
}

function getBlockerLabels(labels: string[]): string[] {
  return labels.filter((l) => (CANONICAL_BLOCKER_LABELS as readonly string[]).includes(l));
}

// --- Section wrapper ---

function CollapsibleSection({
  title,
  borderColor,
  bgColor,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  borderColor: string;
  bgColor: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left px-4 py-3"
      >
        <span className="text-xs text-disabled">{open ? '\u25BC' : '\u25B6'}</span>
        <h3 className="text-sm font-semibold text-secondary">{title}</h3>
        {badge}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// --- Stat card ---

function StatCard({
  label,
  value,
  color,
  pulse,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  pulse?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <p className="text-xs text-faint uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        {pulse && <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />}
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

// --- Main page ---

const STAGE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  intake: { bg: 'bg-slate-500/20', text: 'text-slate-300', bar: 'bg-slate-500' },
  evaluate: { bg: 'bg-cyan-500/20', text: 'text-cyan-300', bar: 'bg-cyan-500' },
  route: { bg: 'bg-indigo-500/20', text: 'text-indigo-300', bar: 'bg-indigo-500' },
  review: { bg: 'bg-amber-500/20', text: 'text-amber-300', bar: 'bg-amber-500' },
  queue: { bg: 'bg-accent/20', text: 'text-accent-text-light', bar: 'bg-accent' },
  execute: { bg: 'bg-green-500/20', text: 'text-green-300', bar: 'bg-green-500' },
};

function StageFunnel() {
  const { data: stages } = usePipelineStages();
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  if (!stages) return null;

  const total = stages.stages.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  const toggleStage = (stage: string) => {
    setSelectedStage((prev) => (prev === stage ? null : stage));
  };

  const selectedEntry = selectedStage ? stages.stages.find((s) => s.stage === selectedStage) : null;

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Pipeline Stages</h3>
        <span className="text-xs text-faint">{total} tasks in pipeline</span>
      </div>
      {/* Proportional bar */}
      <div className="flex h-8 rounded-lg overflow-hidden gap-px">
        {stages.stages
          .filter((s) => s.count > 0)
          .map((s) => {
            const pct = Math.max((s.count / total) * 100, 3); // min 3% for visibility
            const colors = STAGE_COLORS[s.stage] ?? STAGE_COLORS.intake;
            const isSelected = selectedStage === s.stage;
            return (
              <button
                key={s.stage}
                onClick={() => toggleStage(s.stage)}
                className={`${colors.bar} ${isSelected ? 'opacity-100 ring-2 ring-white/30' : 'opacity-60 hover:opacity-100'} transition-all flex items-center justify-center relative group cursor-pointer`}
                style={{ width: `${pct}%` }}
              >
                <span className="text-[10px] font-bold text-white/90 tabular-nums">{s.count}</span>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] text-faint whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {s.stage}
                </div>
              </button>
            );
          })}
      </div>
      {/* Labels row */}
      <div className="flex mt-3 gap-3 flex-wrap">
        {stages.stages.map((s) => {
          const colors = STAGE_COLORS[s.stage] ?? STAGE_COLORS.intake;
          const isSelected = selectedStage === s.stage;
          return (
            <button
              key={s.stage}
              onClick={() => toggleStage(s.stage)}
              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors cursor-pointer ${isSelected ? `${colors.bg} ring-1 ring-current` : 'hover:bg-surface-2'}`}
            >
              <span className={`w-2 h-2 rounded-full ${colors.bar}`} />
              <span className="text-[10px] text-muted capitalize">{s.stage}</span>
              <span className={`text-[10px] font-semibold ${colors.text}`}>{s.count}</span>
            </button>
          );
        })}
        {stages.unstaged > 0 && (
          <div className="flex items-center gap-1.5 px-1.5 py-0.5">
            <span className="w-2 h-2 rounded-full bg-surface-muted" />
            <span className="text-[10px] text-faint">unstaged</span>
            <span className="text-[10px] font-semibold text-faint">{stages.unstaged}</span>
          </div>
        )}
      </div>

      {/* Expanded task list for selected stage */}
      {selectedEntry && (
        <div className="mt-3 border-t border-default pt-3">
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-xs font-medium capitalize ${(STAGE_COLORS[selectedEntry.stage] ?? STAGE_COLORS.intake).text}`}
            >
              {selectedEntry.stage} — {selectedEntry.count} task
              {selectedEntry.count !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setSelectedStage(null)}
              className="text-[10px] text-faint hover:text-muted transition-colors"
            >
              close
            </button>
          </div>
          {selectedEntry.tasks.length === 0 ? (
            <p className="text-xs text-faint">No tasks in this stage</p>
          ) : (
            <div className="space-y-1">
              {selectedEntry.tasks.map((task) => {
                const blockers = getBlockerLabels(task.labels);
                const stageColors = STAGE_COLORS[selectedEntry.stage] ?? STAGE_COLORS.intake;
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-2 transition-colors"
                  >
                    <span className={`w-1 h-6 rounded-full ${stageColors.bar} shrink-0`} />
                    <PriorityBadge level={task.priority} />
                    <Link
                      to={`/tasks/${task.id}`}
                      className="text-sm text-secondary hover:text-accent-text transition-colors truncate flex-1 min-w-0"
                    >
                      {task.title}
                    </Link>
                    {blockers.map((label) => (
                      <span
                        key={label}
                        className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0"
                        title={task.question ?? undefined}
                      >
                        {blockerReason(label)}
                      </span>
                    ))}
                    {task.question && (
                      <span
                        className="text-[10px] text-amber-200 truncate max-w-[200px]"
                        title={task.question}
                      >
                        {task.question}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDur(secs: number): string {
  if (secs === 0) return '--';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function StageAnalytics() {
  const { data: metrics } = useStageMetrics();
  if (!metrics) return null;

  const hasData = metrics.stages.some((s) => s.completedTransitions > 0);
  if (!hasData) return null;

  return (
    <CollapsibleSection
      title="Stage Analytics"
      borderColor="border-default"
      bgColor="bg-transparent"
      defaultOpen={true}
      badge={
        metrics.bottleneck ? (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            Bottleneck: {metrics.bottleneck}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-default overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Stage</th>
                <th className="text-right px-4 py-2.5 font-medium">Now</th>
                <th className="text-right px-4 py-2.5 font-medium">Avg</th>
                <th className="text-right px-4 py-2.5 font-medium">Median</th>
                <th className="text-right px-4 py-2.5 font-medium">P90</th>
                <th className="text-right px-4 py-2.5 font-medium">Done</th>
                <th className="text-right px-4 py-2.5 font-medium">Thr/day</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default/50">
              {metrics.stages.map((s) => {
                const colors = STAGE_COLORS[s.stage] ?? STAGE_COLORS.intake;
                const isBottleneck = s.stage === metrics.bottleneck;
                return (
                  <tr
                    key={s.stage}
                    className={`hover:bg-surface-1/50 transition-colors ${isBottleneck ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${colors.bar}`} />
                        <span className={`font-medium capitalize ${colors.text}`}>{s.stage}</span>
                        {isBottleneck && (
                          <span className="text-[9px] text-amber-400">BOTTLENECK</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-secondary tabular-nums font-medium">
                      {s.count}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                      {formatDur(s.avgDurationSecs)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                      {formatDur(s.medianDurationSecs)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                      {formatDur(s.p90DurationSecs)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-faint tabular-nums">
                      {s.completedTransitions}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                      {s.throughputPerDay}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-[10px] text-disabled">
          <span>{metrics.totalTasksTracked} tasks tracked</span>
          {metrics.oldestTransition && (
            <span>Data since {new Date(metrics.oldestTransition).toLocaleDateString()}</span>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

export default function PipelinePage() {
  const { data: pipeline, isLoading, isError } = usePipelineStatus();
  if (isLoading)
    return <div className="text-faint py-8 text-center">Loading pipeline status...</div>;
  if (isError || !pipeline)
    return <div className="text-red-400 py-8 text-center">Failed to load pipeline status.</div>;

  const { locks, queued, executing, blocked, recentExecutions, dispatcher } = pipeline;

  const dc = dispatcherColor(dispatcher.status);
  const aliveLocks = locks.filter((l) => l.alive);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-primary">Execution Pipeline</h1>

      {/* a) Status Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Queued"
          value={queued.length}
          color="text-accent-text"
          sub="Approved, waiting to run"
        />
        <StatCard
          label="Executing"
          value={executing.length}
          color="text-green-400"
          pulse={executing.length > 0}
          sub={
            aliveLocks.length > 0
              ? `${aliveLocks.length} active process${aliveLocks.length !== 1 ? 'es' : ''}`
              : undefined
          }
        />
        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <p className="text-xs text-faint uppercase tracking-wider">Dispatcher</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2.5 h-2.5 rounded-full ${dc.dot}`} />
            <span className={`text-lg font-semibold ${dc.text}`}>{dc.label}</span>
          </div>
          {dispatcher.heartbeatAge != null && (
            <p className="text-xs text-faint mt-1">
              Heartbeat:{' '}
              {dispatcher.heartbeatAge < 60
                ? `${Math.round(dispatcher.heartbeatAge)}s`
                : `${Math.floor(dispatcher.heartbeatAge / 60)}m`}{' '}
              ago
            </p>
          )}
        </div>
      </div>

      {/* Stage Funnel */}
      <StageFunnel />

      {/* Stage Analytics */}
      <StageAnalytics />

      {/* b) Active Executions */}
      <CollapsibleSection
        title="Active Executions"
        borderColor={
          executing.length > 0 || aliveLocks.length > 0 ? 'border-accent/30' : 'border-default'
        }
        bgColor={executing.length > 0 || aliveLocks.length > 0 ? 'bg-accent/5' : 'bg-transparent'}
        badge={
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent-text">
            {executing.length}
          </span>
        }
      >
        {executing.length === 0 && aliveLocks.length === 0 ? (
          <p className="text-sm text-faint">No tasks currently executing</p>
        ) : (
          <div className="space-y-2">
            {/* In-progress Pulse tasks */}
            {executing.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-lg border border-accent/20 bg-surface-1 px-4 py-3"
              >
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/tasks/${task.id}`}
                    className="text-sm font-medium text-secondary hover:text-accent-text transition-colors"
                  >
                    <span className="font-mono text-xs text-faint mr-2">{task.id}</span>
                    {task.title}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.labels
                      .filter((l) => l.startsWith('capability:'))
                      .map((l) => (
                        <LabelChip key={l} label={l} />
                      ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Active lock files (jobs with running processes) */}
            {aliveLocks.map((lock) => (
              <div
                key={lock.job}
                className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-surface-1 px-4 py-3"
              >
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-secondary">{lock.job}</span>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-faint">
                    <span>PID: {lock.pid}</span>
                    <span>Process active</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* c) Queued for Execution */}
      <CollapsibleSection
        title="Queued for Execution"
        borderColor="border-accent/20"
        bgColor="bg-transparent"
        badge={
          queued.length > 0 ? (
            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent-text">
              {queued.length}
            </span>
          ) : undefined
        }
      >
        {queued.length === 0 ? (
          <p className="text-sm text-faint">No tasks queued for execution</p>
        ) : (
          <div className="rounded-lg border border-default overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium w-16">Pri</th>
                  <th className="text-left px-4 py-2.5 font-medium">Task</th>
                  <th className="text-left px-4 py-2.5 font-medium w-32">Capability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default/50">
                {queued.map((task) => {
                  const capLabel = task.labels.find((l) => l.startsWith('capability:'));
                  return (
                    <tr key={task.id} className="hover:bg-surface-1/50 transition-colors">
                      <td className="px-4 py-2.5">
                        <PriorityBadge level={task.priority} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/tasks/${task.id}`}
                          className="hover:text-accent-text transition-colors"
                        >
                          <span className="font-mono text-xs text-faint mr-2">{task.id}</span>
                          <span className="text-secondary">{task.title}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        {capLabel ? (
                          <LabelChip label={capLabel} />
                        ) : (
                          <span className="text-disabled">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleSection>

      {/* d) Blocked */}
      <CollapsibleSection
        title="Blocked"
        borderColor="border-default"
        bgColor="bg-transparent"
        defaultOpen={blocked.length > 0 && blocked.length <= 10}
        badge={
          blocked.length > 0 ? (
            <span className="rounded-full bg-surface-muted/20 px-2 py-0.5 text-xs font-semibold text-muted">
              {blocked.length}
            </span>
          ) : undefined
        }
      >
        {blocked.length === 0 ? (
          <p className="text-sm text-faint">No blocked tasks</p>
        ) : (
          <div className="space-y-2">
            {blocked.map((task) => {
              const blockers = getBlockerLabels(task.labels);
              return (
                <div
                  key={task.id}
                  className="rounded-lg border border-default bg-surface-1 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <PriorityBadge level={task.priority} />
                    <Link
                      to={`/tasks/${task.id}`}
                      className="text-sm font-medium text-secondary hover:text-accent-text transition-colors"
                    >
                      {task.title}
                    </Link>
                  </div>
                  {task.question && (
                    <div className="mt-1.5 ml-7 border border-amber-500/30 bg-amber-500/10 rounded px-2 py-1">
                      <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
                        Needs Answer
                      </span>
                      <p className="text-xs text-amber-200 mt-0.5">{task.question}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1.5 ml-7">
                    {blockers.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1.5 text-xs text-muted"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-surface-muted" />
                        {blockerReason(label)}
                      </span>
                    ))}
                    {blockers.length === 0 && !task.question && (
                      <span className="text-xs text-faint">No specific blocker identified</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* e) Recent Executions */}
      <RecentExecutionsSection executions={recentExecutions} />

      {/* f) Pipeline Timeline */}
      <CollapsibleSection
        title="Pipeline Timeline"
        borderColor="border-default"
        bgColor="bg-transparent"
        defaultOpen={false}
      >
        <PipelineTimeline />
      </CollapsibleSection>

      <p className="text-xs text-disabled text-center">Auto-refreshes every 10s</p>
    </div>
  );
}

// --- Recent executions table ---

function RecentExecutionsSection({ executions }: { executions: RecentExecution[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? executions : executions.slice(0, 10);

  return (
    <CollapsibleSection
      title="Recent Executions"
      borderColor="border-default"
      bgColor="bg-transparent"
      badge={<span className="text-xs text-faint">{executions.length}</span>}
    >
      {executions.length === 0 ? (
        <p className="text-sm text-faint">No recent executions</p>
      ) : (
        <>
          <div className="rounded-lg border border-default overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium w-8"></th>
                  <th className="text-left px-4 py-2.5 font-medium">Job</th>
                  <th className="text-left px-4 py-2.5 font-medium">When</th>
                  <th className="text-left px-4 py-2.5 font-medium">Duration</th>
                  <th className="text-right px-4 py-2.5 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default/50">
                {visible.map((exec, i) => (
                  <tr key={i} className="hover:bg-surface-1/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block w-1.5 h-1.5 rounded-full ${exec.success ? 'bg-green-500' : 'bg-red-500'}`}
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-secondary">{exec.job}</td>
                    <td className="px-4 py-2.5 text-muted">{formatTimeAgo(exec.timestamp)}</td>
                    <td className="px-4 py-2.5 text-muted">{formatDuration(exec.duration)}</td>
                    <td className="px-4 py-2.5 text-right text-muted">{formatCost(exec.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {executions.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-2 text-xs text-faint hover:text-accent-text transition-colors"
            >
              {showAll ? 'Show less' : `Show all ${executions.length}`}
            </button>
          )}
        </>
      )}
    </CollapsibleSection>
  );
}
