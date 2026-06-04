import { useJobDetail } from '../../api/nexus-ops';

interface JobDetailPanelProps {
  jobName: string;
  onTaskClick?: (taskId: string) => void;
  onClose: () => void;
}

export function JobDetailPanel({ jobName, onTaskClick }: JobDetailPanelProps) {
  const { data, isLoading, isError } = useJobDetail(jobName);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-faint text-sm">Loading job details...</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Failed to load job details for {jobName}.
        </div>
      </div>
    );
  }

  const { job, recentRuns, stats } = data;

  return (
    <div className="space-y-6 p-4">
      {/* Job header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-primary">{job.name}</h2>
          {job.enabled !== undefined && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              job.enabled ? 'bg-green-500/20 text-green-400' : 'bg-surface-muted/20 text-muted'
            }`}>
              {job.enabled ? 'enabled' : 'disabled'}
            </span>
          )}
        </div>
        {job.description && (
          <p className="text-sm text-muted mt-1">{job.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {job.persona && (
            <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
              {job.persona}
            </span>
          )}
          {job.schedule && (
            <span className="text-xs font-mono text-faint">{job.schedule}</span>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total Runs" value={String(stats.totalRuns)} />
        <StatCard
          label="Success Rate"
          value={`${Math.round(stats.successRate * 100)}%`}
          color={stats.successRate >= 0.9 ? 'text-green-400' : stats.successRate >= 0.7 ? 'text-amber-400' : 'text-red-400'}
        />
        <StatCard label="Avg Cost" value={`$${(stats.avgCost ?? 0).toFixed(4)}`} color="text-green-400" />
        <StatCard label="Avg Duration" value={formatDuration(stats.avgDuration ?? 0)} />
        <StatCard label="Total Cost" value={`$${(stats.totalCost ?? 0).toFixed(4)}`} color="text-green-400" />
      </div>

      {/* Recent runs */}
      <div>
        <h3 className="text-xs text-faint uppercase tracking-wider mb-3">Recent Runs</h3>
        {recentRuns.length === 0 ? (
          <div className="text-sm text-disabled">No runs recorded.</div>
        ) : (
          <div className="space-y-2">
            {recentRuns.map((run, i) => (
              <div key={i} className="rounded-lg border border-default bg-surface-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    run.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="text-sm text-secondary">
                    {new Date(run.timestamp).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                    })}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    run.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {run.cost != null && run.cost > 0 && (
                    <span className="text-xs text-green-400/70">${run.cost.toFixed(4)}</span>
                  )}
                  {run.duration != null && (
                    <span className="text-xs text-faint">{formatDuration(run.duration)}</span>
                  )}
                  {run.tokens && (
                    <span className="text-xs text-faint">
                      {run.tokens.input.toLocaleString()} in / {run.tokens.output.toLocaleString()} out
                    </span>
                  )}
                </div>
                {run.tasksProcessed.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs text-faint">Tasks:</span>
                    {run.tasksProcessed.map(tid => (
                      <button
                        key={tid}
                        onClick={() => onTaskClick?.(tid)}
                        className="text-xs font-mono text-accent-text hover:text-accent-text-light hover:underline"
                      >
                        {tid}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 px-3 py-2">
      <div className="text-xs text-faint">{label}</div>
      <div className={`text-sm font-medium ${color ?? 'text-secondary'}`}>{value}</div>
    </div>
  );
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
