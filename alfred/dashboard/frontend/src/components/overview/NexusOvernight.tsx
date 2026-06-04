import { Link } from 'react-router-dom';
import { useActivity, useHealth } from '../../api/nexus';
import { useAnalytics } from '../../api/nexus-ops';
import { formatTimeAgo } from '../../lib/time';

export function NexusOvernight() {
  const { data: activityData } = useActivity(10);
  const { data: health } = useHealth();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const { data: analytics } = useAnalytics(todayStr, todayStr);

  const events = activityData?.events ?? [];
  const recentEvents = events.slice(0, 5);

  const rawDispatcherStatus = health?.dispatcher?.status ?? 'unknown';
  const dispatcherStatus = rawDispatcherStatus === 'unknown' ? 'not running' : rawDispatcherStatus;
  const failingJobs = health?.jobs?.filter((j) => j.status === 'failing').length ?? 0;
  const totalJobs = health?.jobs?.length ?? 0;
  const pendingApprovals = health?.messageBus?.pendingApprovals ?? 0;
  const costToday = analytics?.cost?.today ?? 0;

  const statusDot =
    failingJobs > 0
      ? 'bg-red-500'
      : dispatcherStatus === 'healthy' || dispatcherStatus === 'ok'
        ? 'bg-green-500'
        : 'bg-amber-500';

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-secondary">Nexus Status</h3>
        <Link
          to="/nexus-ops"
          className="text-xs text-faint hover:text-accent-text transition-colors"
        >
          View all
        </Link>
      </div>

      {/* Status summary */}
      <div className="flex items-center gap-3 mb-3">
        <span className={`w-2.5 h-2.5 rounded-full ${statusDot}`} />
        <span className="text-sm text-secondary capitalize">{dispatcherStatus}</span>
        <span className="text-xs text-faint">
          {totalJobs} jobs
          {failingJobs > 0 && <span className="text-red-400 ml-1">{failingJobs} failing</span>}
        </span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded bg-surface-2/50 px-2 py-1.5">
          <p className="text-[10px] text-faint uppercase">Cost Today</p>
          <p className="text-sm font-semibold text-secondary">${costToday.toFixed(2)}</p>
        </div>
        <div className="rounded bg-surface-2/50 px-2 py-1.5">
          <p className="text-[10px] text-faint uppercase">Pending</p>
          <p className="text-sm font-semibold text-secondary">{pendingApprovals} approvals</p>
        </div>
      </div>

      {/* Recent events */}
      {recentEvents.length > 0 && (
        <div className="space-y-1.5">
          {recentEvents.map((event) => (
            <div key={event.id} className="flex items-center gap-2 text-xs">
              <span className="text-disabled w-12 shrink-0">{formatTimeAgo(event.timestamp)}</span>
              <span className="text-muted truncate">{event.summary}</span>
              {event.cost != null && event.cost > 0 && (
                <span className="text-disabled shrink-0">${event.cost.toFixed(3)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
