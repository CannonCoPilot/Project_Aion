import { useState } from 'react';
import { useActivity, type NexusEvent } from '../api/nexus';
import { Header } from '../components/layout/Header';

const SEVERITY_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  info: { dot: 'bg-green-500', bg: 'bg-green-500/10', text: 'text-green-400' },
  warning: { dot: 'bg-amber-500', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  critical: { dot: 'bg-red-500', bg: 'bg-red-500/10', text: 'text-red-400' },
  error: { dot: 'bg-red-500', bg: 'bg-red-500/10', text: 'text-red-400' },
};

const TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  job_completed: { icon: '\u2713', label: 'Completed' },
  job_started: { icon: '\u25B6', label: 'Started' },
  job_failed: { icon: '\u2717', label: 'Failed' },
  job_event: { icon: '\u2022', label: 'Event' },
  question_asked: { icon: '\u2753', label: 'Question' },
  question_answered: { icon: '\u2714', label: 'Answered' },
  unknown: { icon: '\u2022', label: 'Event' },
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function EventCard({ event }: { event: NexusEvent }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_COLORS[event.severity] ?? SEVERITY_COLORS.info;
  const typeInfo = TYPE_LABELS[event.type] ?? TYPE_LABELS.unknown;

  return (
    <div
      className={`rounded-lg border border-default bg-surface-1 hover:border-subtle transition-colors cursor-pointer`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-xs ${sev.bg} ${sev.text}`}>
          {typeInfo.icon}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-secondary">{event.job || 'system'}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${sev.bg} ${sev.text}`}>
              {typeInfo.label}
            </span>
          </div>
          {event.summary && (
            <p className="text-sm text-muted mt-0.5 line-clamp-2">{event.summary}</p>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-xs text-faint">{formatTime(event.timestamp)}</span>
          {event.cost != null && event.cost > 0 && (
            <span className="text-xs text-faint">${event.cost.toFixed(4)}</span>
          )}
          {event.duration != null && event.duration > 0 && (
            <span className="text-xs text-disabled">{event.duration}s</span>
          )}
        </div>
      </div>

      {expanded && event.raw && Object.keys(event.raw).length > 0 && (
        <div className="border-t border-default px-4 py-3">
          <pre className="text-xs text-faint overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(event.raw, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ActivityPage() {
  const [limit, setLimit] = useState(50);
  const { data, isLoading, isError } = useActivity(limit);
  const events = data?.events ?? [];
  const hasMore = data?.hasMore ?? false;

  // Cost summary
  const totalCost = events.reduce((sum, e) => sum + (e.cost ?? 0), 0);

  return (
    <div className="space-y-4">
      <Header title="Nexus Activity" />

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted">
          {events.length} events{hasMore ? '+' : ''}
        </span>
        {totalCost > 0 && (
          <span className="text-faint">
            Total cost: <span className="text-tertiary">${totalCost.toFixed(4)}</span>
          </span>
        )}
        <span className="text-disabled text-xs">Auto-refreshes every 10s</span>
      </div>

      {isLoading && <div className="text-faint py-8 text-center">Loading events...</div>}
      {isError && <div className="text-red-400 py-8 text-center">Failed to load events.</div>}

      <div className="space-y-2">
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {hasMore && !isLoading && (
        <div className="text-center py-4">
          <button
            onClick={() => setLimit(prev => prev + 50)}
            className="text-sm text-accent-text hover:text-accent-text-light transition-colors"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
