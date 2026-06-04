import { usePAIHealth, usePAIRecentEvents, usePAIInfraStatus, type HookEvent } from '../../api/pai-observability';

function formatTimeAgo(isoOrEpoch: string | number | null | undefined): string {
  if (!isoOrEpoch) return 'never';
  const ts = typeof isoOrEpoch === 'string' ? new Date(isoOrEpoch).getTime() : isoOrEpoch;
  const diffMs = Date.now() - ts;
  if (diffMs < 0 || diffMs < 60000) return 'just now';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** Compute per-minute activity density for the last 10 minutes */
function activityDots(events: HookEvent[] | undefined): number[] {
  const buckets = new Array(10).fill(0) as number[];
  if (!events) return buckets;
  const now = Date.now();
  for (const e of events) {
    const minAgo = Math.floor((now - e.timestamp) / 60000);
    if (minAgo >= 0 && minAgo < 10) {
      buckets[9 - minAgo] += 1; // index 0 = 10m ago, index 9 = now
    }
  }
  return buckets;
}

export default function ObservabilityBar() {
  const { isError: healthError } = usePAIHealth();
  const { data: events } = usePAIRecentEvents();
  const { data: infra } = usePAIInfraStatus();

  const isOffline = healthError;

  if (isOffline) {
    return (
      <div className="hidden md:flex items-center h-8 px-4 bg-black/60 border-b border-default/50 text-xs gap-2 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <span className="text-red-400/80">PAI Offline</span>
      </div>
    );
  }

  // Event rate: events per minute over the last hour
  const totalEvents = events?.length ?? 0;
  const eventRate = totalEvents > 0 ? (totalEvents / 60).toFixed(1) : '0';

  // Activity density dots
  const dots = activityDots(events);
  const maxDot = Math.max(...dots, 1);

  // Stale detection: if infra data is older than 5 minutes, dim it
  const infraStale = infra?.updated_at
    ? (Date.now() - new Date(infra.updated_at).getTime()) > 300000
    : true;

  return (
    <div className="hidden md:flex items-center h-8 px-4 bg-black/60 border-b border-default/50 text-xs gap-4 shrink-0">
      {/* PAI Connection status + event rate */}
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="text-faint font-medium">PAI</span>
        <span className="text-secondary font-medium tabular-nums ml-1">{eventRate}</span>
        <span className="text-disabled">/min</span>
      </div>

      <span className="text-ghost">|</span>

      {/* Tasks */}
      {infra?.tasks && (
        <div className={`flex items-center gap-2 ${infraStale ? 'opacity-40' : ''}`}>
          <span className="text-faint font-medium">TASKS</span>
          <span className="text-green-400 font-medium tabular-nums">{infra.tasks.open}</span>
          <span className="text-disabled">open</span>
          {infra.tasks.in_progress > 0 && (
            <>
              <span className="text-amber-400 font-medium tabular-nums">{infra.tasks.in_progress}</span>
              <span className="text-disabled">active</span>
            </>
          )}
          {infra.tasks.p1_count > 0 && (
            <span className="text-red-400 font-bold tabular-nums">P1:{infra.tasks.p1_count}</span>
          )}
        </div>
      )}

      <span className="text-ghost">|</span>

      {/* Nexus */}
      {infra?.nexus && (
        <div className={`flex items-center gap-2 ${infraStale ? 'opacity-40' : ''}`}>
          <span className="text-faint font-medium">NEXUS</span>
          <span className="text-purple-400 font-medium">{formatTimeAgo(infra.nexus.last_run)}</span>
          {infra.nexus.tasks_run > 0 && (
            <>
              <span className="text-purple-400 tabular-nums">{infra.nexus.tasks_run}</span>
              <span className="text-disabled">run</span>
            </>
          )}
          {infra.nexus.failed > 0 && (
            <span className="text-red-400 font-bold tabular-nums">{infra.nexus.failed} failed</span>
          )}
        </div>
      )}

      <span className="text-ghost">|</span>

      {/* Infrastructure */}
      {infra?.infra && (
        <div className={`flex items-center gap-2 ${infraStale ? 'opacity-40' : ''}`}>
          <span className="text-faint font-medium">INFRA</span>
          <span className="text-cyan-400 font-medium tabular-nums">
            {infra.infra.containers_running}/{infra.infra.containers_total}
          </span>
          {infra.infra.unhealthy_count > 0 && (
            <span
              className="text-red-400 font-bold"
              title={`Unhealthy: ${infra.infra.unhealthy_names.join(', ')}`}
            >
              {infra.infra.unhealthy_count} unhealthy
            </span>
          )}
        </div>
      )}

      <span className="text-ghost">|</span>

      {/* Git */}
      {infra?.git && infra.git.commits_today > 0 && (
        <div className={`flex items-center gap-1 ${infraStale ? 'opacity-40' : ''}`}>
          <span className="text-cyan-400 tabular-nums">{infra.git.commits_today}</span>
          <span className="text-disabled">commits</span>
        </div>
      )}

      {/* Activity sparkline — pushed to right */}
      <div className="flex items-center gap-px ml-auto" title="Activity density (last 10 min)">
        {dots.map((count, i) => {
          const opacity = count === 0 ? 0.1 : 0.2 + (count / maxDot) * 0.8;
          return (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-accent-light"
              style={{ opacity }}
            />
          );
        })}
      </div>
    </div>
  );
}
