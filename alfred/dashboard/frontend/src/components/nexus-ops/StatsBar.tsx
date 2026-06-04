import type { TimelineStats } from '../../api/nexus-ops';

const SOURCE_LABELS: Record<string, string> = {
  tasks: 'Task Events',
  nexus_db: 'Job Events',
  task_reviewer: 'AI Decisions',
  execution: 'Executions',
  relay: 'Relay',
  dispatcher: 'Dispatcher',
};

export function StatsBar({ stats }: { stats: TimelineStats | undefined }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard label="Events" value={String(stats.totalEvents)} subtitle="all sources" />
      <StatCard
        label="Execution Cost"
        value={stats.totalCost > 0 ? `$${stats.totalCost.toFixed(2)}` : '$0'}
        subtitle="Claude API spend"
      />
      <StatCard label="Active Jobs" value={String(stats.activeJobs)} />
      <StatCard label="Tasks Progressed" value={String(stats.tasksProgressed)} />

      {/* Source breakdown */}
      <div className="col-span-2 md:col-span-4 flex flex-wrap gap-2">
        {Object.entries(stats.bySource)
          .filter(([, count]) => count > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([source, count]) => (
            <span
              key={source}
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_COLORS[source] ?? 'bg-surface-2 text-muted'}`}
            >
              {SOURCE_LABELS[source] ?? source}: {count}
            </span>
          ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
      <div className="text-xs text-faint mb-1">{label}</div>
      <div className="text-lg font-bold text-primary">{value}</div>
      {subtitle && <div className="text-[10px] text-disabled mt-0.5">{subtitle}</div>}
    </div>
  );
}

const SOURCE_COLORS: Record<string, string> = {
  tasks: 'bg-accent/20 text-accent-text',
  nexus_db: 'bg-purple-500/20 text-purple-400',
  task_reviewer: 'bg-amber-500/20 text-amber-400',
  execution: 'bg-green-500/20 text-green-400',
  relay: 'bg-slate-500/20 text-slate-400',
  dispatcher: 'bg-cyan-500/20 text-cyan-400',
};
