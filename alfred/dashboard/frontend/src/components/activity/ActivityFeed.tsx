import { useActivity, type NexusEvent } from '../../api/nexus';

const SEVERITY_STYLES: Record<string, { dot: string; text: string }> = {
  info: { dot: 'bg-green-500', text: 'text-green-400' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-400' },
  critical: { dot: 'bg-red-500', text: 'text-red-400' },
  error: { dot: 'bg-red-500', text: 'text-red-400' },
};

const TYPE_ICONS: Record<string, string> = {
  job_completed: '\u2713',
  job_started: '\u25B6',
  job_failed: '\u2717',
  job_event: '\u2022',
  question_asked: '\u2753',
  question_answered: '\u2714',
  dispatch: '\u21BB',
  heartbeat: '\u2665',
};

function timeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function EventRow({ event }: { event: NexusEvent }) {
  const severity = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES.info;
  const icon = TYPE_ICONS[event.type] ?? '\u2022';

  return (
    <div className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-surface-2/50 transition-colors">
      <span className={`mt-0.5 w-4 text-center text-xs ${severity.text}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-muted truncate">{event.job}</span>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${severity.dot}`} />
        </div>
        <p className="text-xs text-tertiary line-clamp-1">{event.summary}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end">
        <span className="text-[10px] text-faint">{timeAgo(event.timestamp)}</span>
        {event.cost != null && event.cost > 0 && (
          <span className="text-[10px] text-disabled">${event.cost.toFixed(3)}</span>
        )}
      </div>
    </div>
  );
}

interface ActivityFeedProps {
  limit?: number;
  collapsed?: boolean;
}

export function ActivityFeed({ limit = 8, collapsed }: ActivityFeedProps) {
  const { data, isLoading } = useActivity(limit);
  const events = data?.events ?? [];

  if (collapsed) return null;

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-2 py-1">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-faint">Nexus Activity</h4>
      </div>

      {isLoading && (
        <div className="px-2 py-3 text-center text-[10px] text-disabled">Loading...</div>
      )}

      {!isLoading && events.length === 0 && (
        <div className="px-2 py-3 text-center text-[10px] text-disabled">No recent events</div>
      )}

      {events.map(event => (
        <EventRow key={event.id} event={event} />
      ))}
    </div>
  );
}
