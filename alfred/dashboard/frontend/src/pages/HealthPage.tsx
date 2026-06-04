import { useNavigate } from 'react-router-dom';
import { useHealth } from '../api/nexus';
import { Header } from '../components/layout/Header';

const STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  healthy: { dot: 'bg-green-500', text: 'text-green-400', label: 'Healthy' },
  ok: { dot: 'bg-green-500', text: 'text-green-400', label: 'OK' },
  idle: { dot: 'bg-surface-muted', text: 'text-muted', label: 'Idle' },
  stale: { dot: 'bg-amber-500', text: 'text-amber-400', label: 'Stale' },
  failing: { dot: 'bg-red-500', text: 'text-red-400', label: 'Failing' },
  down: { dot: 'bg-red-500', text: 'text-red-400', label: 'Down' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { dot: 'bg-surface-muted', text: 'text-muted', label: status };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      <span className={`text-sm font-medium ${s.text}`}>{s.label}</span>
    </span>
  );
}

function formatAge(seconds: number | null): string {
  if (seconds == null) return 'N/A';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const now = Date.now();
  const diffHr = Math.floor((now - d.getTime()) / 3600000);
  if (diffHr < 24) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HealthPage() {
  const navigate = useNavigate();
  const { data: health, isLoading, isError } = useHealth();

  if (isLoading) return <div className="text-faint py-8 text-center">Loading health data...</div>;
  if (isError || !health)
    return <div className="text-red-400 py-8 text-center">Failed to load health data.</div>;

  const healthyJobs = health.jobs.filter((j) => j.status === 'ok').length;
  const staleJobs = health.jobs.filter((j) => j.status === 'stale').length;
  const failingJobs = health.jobs.filter((j) => j.status === 'failing').length;

  return (
    <div className="space-y-6">
      <Header title="System Health" />

      {/* Top cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Dispatcher */}
        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Dispatcher</div>
          <StatusBadge status={health.dispatcher.status} />
          <p className="text-xs text-faint mt-2">
            Last heartbeat: {formatAge(health.dispatcher.heartbeatAge)}
          </p>
        </div>

        {/* Jobs summary */}
        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Jobs</div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-primary">{health.jobs.length}</span>
            <span className="text-xs text-faint">total</span>
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-green-400">{healthyJobs} ok</span>
            {staleJobs > 0 && <span className="text-amber-400">{staleJobs} stale</span>}
            {failingJobs > 0 && <span className="text-red-400">{failingJobs} failing</span>}
          </div>
        </div>

        {/* Message Bus */}
        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Message Bus</div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-primary">
              {health.messageBus.pendingCount}
            </span>
            <span className="text-xs text-faint">pending</span>
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-amber-400">{health.messageBus.pendingApprovals} approvals</span>
          </div>
        </div>

        {/* Pulse */}
        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Pulse Tasks</div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-primary">{health.tasks.openCount}</span>
            <span className="text-xs text-faint">open</span>
          </div>
          <p className="text-xs text-faint mt-2">{health.tasks.taskCount} total</p>
        </div>
      </div>

      {/* Operational Status */}
      <div>
        <h3 className="text-sm font-semibold text-tertiary mb-3">Operational Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* WebSocket */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-faint uppercase tracking-wider">WebSocket</span>
              <StatusBadge status={health.websocket?.activeConnections ? 'ok' : 'idle'} />
            </div>
            <div className="space-y-1 text-xs text-muted">
              <div className="flex justify-between">
                <span>Active connections</span>
                <span className="text-secondary font-medium">
                  {health.websocket?.activeConnections ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total connections</span>
                <span className="text-secondary">{health.websocket?.totalConnections ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Last broadcast</span>
                <span className="text-secondary">
                  {health.websocket?.lastBroadcast
                    ? formatTimestamp(health.websocket.lastBroadcast)
                    : 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Broadcasts</span>
                <span className="text-secondary">{health.websocket?.broadcastCount ?? 0}</span>
              </div>
            </div>
          </div>

          {/* Push Notifications */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-faint uppercase tracking-wider">
                Push Notifications
              </span>
              <StatusBadge
                status={
                  !health.notifications?.activeSubscriptions
                    ? 'stale'
                    : health.notifications.failed > health.notifications.sent
                      ? 'failing'
                      : 'ok'
                }
              />
            </div>
            <div className="space-y-1 text-xs text-muted">
              <div className="flex justify-between">
                <span>Subscriptions</span>
                <span className="text-secondary font-medium">
                  {health.notifications?.activeSubscriptions ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sent</span>
                <span className="text-green-400">{health.notifications?.sent ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Failed</span>
                <span className={health.notifications?.failed ? 'text-red-400' : 'text-disabled'}>
                  {health.notifications?.failed ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Stale removed</span>
                <span className="text-secondary">{health.notifications?.staleRemoved ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Last sent</span>
                <span className="text-secondary">
                  {health.notifications?.lastSentAt
                    ? formatTimestamp(health.notifications.lastSentAt)
                    : 'Never'}
                </span>
              </div>
            </div>
          </div>

          {/* Pipeline */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-faint uppercase tracking-wider">Pipeline</span>
              <StatusBadge
                status={
                  health.dispatcher.status === 'down'
                    ? 'down'
                    : failingJobs > 0
                      ? 'failing'
                      : health.dispatcher.status === 'stale'
                        ? 'stale'
                        : 'ok'
                }
              />
            </div>
            <div className="space-y-1 text-xs text-muted">
              <div className="flex justify-between">
                <span>Dispatcher</span>
                <StatusBadge status={health.dispatcher.status} />
              </div>
              <div className="flex justify-between">
                <span>Healthy jobs</span>
                <span className="text-green-400">{healthyJobs}</span>
              </div>
              {staleJobs > 0 && (
                <div className="flex justify-between">
                  <span>Stale jobs</span>
                  <span className="text-amber-400">{staleJobs}</span>
                </div>
              )}
              {failingJobs > 0 && (
                <div className="flex justify-between">
                  <span>Failing jobs</span>
                  <span className="text-red-400">{failingJobs}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Pending approvals</span>
                <span
                  className={
                    health.messageBus.pendingApprovals > 0
                      ? 'text-amber-400 font-medium'
                      : 'text-disabled'
                  }
                >
                  {health.messageBus.pendingApprovals}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Job status grid */}
      <div>
        <h3 className="text-sm font-semibold text-tertiary mb-3">Job Status</h3>
        <div className="rounded-lg border border-default overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Job</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Last Run</th>
                <th className="text-right px-4 py-2.5 font-medium">Fails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default/50">
              {health.jobs
                .sort((a, b) => {
                  const order = { failing: 0, stale: 1, ok: 2 };
                  return (
                    (order[a.status as keyof typeof order] ?? 3) -
                    (order[b.status as keyof typeof order] ?? 3)
                  );
                })
                .map((job) => {
                  const s = STATUS_STYLES[job.status] ?? STATUS_STYLES.ok;
                  return (
                    <tr
                      key={job.name}
                      onClick={() => navigate(`/jobs?focus=${encodeURIComponent(job.name)}`)}
                      className="hover:bg-surface-1/50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-2.5 font-medium text-secondary">{job.name}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          <span className={`text-xs ${s.text}`}>{s.label}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted">{formatTimestamp(job.lastRun)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {job.failCount > 0 ? (
                          <span className="text-red-400 font-medium">{job.failCount}</span>
                        ) : (
                          <span className="text-disabled">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Status Legend */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-xs text-faint uppercase tracking-wider mb-3">Status Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-muted">
              <span className="text-green-400 font-medium">OK</span> — Running on schedule
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span className="text-muted">
              <span className="text-amber-400 font-medium">Stale</span> — Hasn't run within expected
              interval
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-muted">
              <span className="text-red-400 font-medium">Failing</span> — Recent execution failures
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-muted">
              <span className="text-green-400 font-medium">Healthy</span> — Dispatcher heartbeat is
              fresh
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-surface-muted shrink-0" />
            <span className="text-muted">
              <span className="text-muted font-medium">Idle</span> — No activity (normal for
              on-demand)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
            <span className="text-muted">
              <span className="text-red-400 font-medium">Down</span> — Dispatcher heartbeat missing
              &gt;10m
            </span>
          </div>
        </div>
      </div>

      <p className="text-xs text-disabled text-center">Auto-refreshes every 30s</p>
    </div>
  );
}
