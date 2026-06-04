import type { AnalyticsResponse } from '../../../api/nexus-ops';

interface Props {
  performance: AnalyticsResponse['performance'];
}

function rateColor(rate: number): string {
  if (rate > 90) return 'text-green-400';
  if (rate > 70) return 'text-amber-400';
  return 'text-red-400';
}

function rateBg(rate: number): string {
  if (rate > 90) return 'bg-green-500/60';
  if (rate > 70) return 'bg-amber-500/60';
  return 'bg-red-500/60';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function PerformanceChart({ performance }: Props) {
  const sorted = [...performance.byJob].sort((a, b) => b.totalRuns - a.totalRuns);

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-3 text-sm text-faint">
        No performance data available.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
      <div className="text-xs text-faint uppercase tracking-wider mb-3">Job Performance</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-faint border-b border-default">
            <th className="text-left py-2 font-medium">Job</th>
            <th className="text-right py-2 font-medium">Runs</th>
            <th className="text-right py-2 font-medium w-32">Success Rate</th>
            <th className="text-right py-2 font-medium">Avg Duration</th>
            <th className="text-right py-2 font-medium">Total Cost</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((job) => (
            <tr key={job.job} className="odd:bg-surface-2/30">
              <td className="py-1.5 text-tertiary truncate max-w-[160px]" title={job.job}>
                {job.job}
              </td>
              <td className="py-1.5 text-right text-muted">{job.totalRuns}</td>
              <td className="py-1.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-16 h-2 rounded bg-surface-2 overflow-hidden">
                    <div
                      className={`h-full rounded ${rateBg(job.successRate)}`}
                      style={{ width: `${job.successRate}%` }}
                    />
                  </div>
                  <span className={`w-10 text-right ${rateColor(job.successRate)}`}>
                    {job.successRate.toFixed(0)}%
                  </span>
                </div>
              </td>
              <td className="py-1.5 text-right text-muted">
                {formatDuration(job.avgDuration)}
              </td>
              <td className="py-1.5 text-right text-green-400">
                ${job.totalCost.toFixed(4)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
