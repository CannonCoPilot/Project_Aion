import { useState } from 'react';
import type { NexusOpsEvent } from '../../api/nexus-ops';

const SOURCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  tasks:      { bg: 'border-l-accent',   text: 'text-accent-text',   label: 'Task' },
  nexus_db:   { bg: 'border-l-purple-500', text: 'text-purple-400', label: 'Nexus' },
  task_reviewer:   { bg: 'border-l-amber-500',  text: 'text-amber-400',  label: 'Task Reviewer' },
  execution:  { bg: 'border-l-green-500',  text: 'text-green-400',  label: 'Execution' },
  relay:      { bg: 'border-l-slate-400',  text: 'text-slate-400',  label: 'Relay' },
  dispatcher: { bg: 'border-l-cyan-500',   text: 'text-cyan-400',   label: 'Dispatcher' },
};

const SEVERITY_DOTS: Record<string, string> = {
  info: 'bg-accent-light',
  warn: 'bg-amber-400',
  error: 'bg-red-500',
  critical: 'bg-red-600 animate-pulse',
};

interface EventCardProps {
  event: NexusOpsEvent;
  onTaskClick?: (taskId: string) => void;
  onJobClick?: (job: string) => void;
}

export function EventCard({ event, onTaskClick, onJobClick }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const style = SOURCE_STYLES[event.source] ?? SOURCE_STYLES.dispatcher;

  const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const date = new Date(event.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className={`rounded-lg border border-default bg-surface-1 border-l-4 ${style.bg} hover:border-subtle transition-colors`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 text-left"
      >
        <div className="flex items-start gap-3">
          {/* Severity dot */}
          {event.severity && (
            <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOTS[event.severity] ?? SEVERITY_DOTS.info}`} />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
              <span className="text-xs text-disabled">{date} {time}</span>
              {event.type && (
                <span className="text-xs text-disabled font-mono">{event.type}</span>
              )}
            </div>
            <div className="text-sm text-secondary mt-1">{event.summary}</div>

            {/* Tags row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {event.task_id && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTaskClick?.(event.task_id!); }}
                  className="text-xs font-mono text-accent-text hover:text-accent-text-light hover:underline"
                >
                  {event.task_id}
                </button>
              )}
              {event.job && (
                <button
                  onClick={(e) => { e.stopPropagation(); onJobClick?.(event.job!); }}
                  className="text-xs font-mono text-purple-400 hover:text-purple-300 hover:underline"
                >
                  {event.job}
                </button>
              )}
              {event.persona && (
                <span className="text-xs text-amber-400/70">{event.persona}</span>
              )}
              {event.cost != null && event.cost > 0 && (
                <span className="text-xs text-green-400/70">${event.cost.toFixed(4)}</span>
              )}
              {event.duration != null && (
                <span className="text-xs text-faint">{formatDuration(event.duration)}</span>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          <span className="text-disabled text-xs mt-1">{expanded ? '\u25BC' : '\u25B6'}</span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && event.details && (
        <div className="px-4 pb-3 border-t border-default mt-1 pt-2">
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
            {syntaxHighlightJson(event.details)}
          </pre>
          {event.tokens && (
            <div className="mt-2 text-xs text-faint">
              Tokens: {event.tokens.input.toLocaleString()} in / {event.tokens.output.toLocaleString()} out
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function syntaxHighlightJson(obj: Record<string, unknown>): React.ReactNode {
  const json = JSON.stringify(obj, null, 2)
  // Parse JSON string into colorized React elements
  const tagRegex = /<(KEY|STR|BOOL|NUM|NULL)>(.*?)<\/\1>/g

  const colorized = json
    .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<KEY>$1</KEY>:')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <STR>$1</STR>')
    .replace(/:\s*(true|false)/g, ': <BOOL>$1</BOOL>')
    .replace(/:\s*(\d+(?:\.\d+)?)/g, ': <NUM>$1</NUM>')
    .replace(/:\s*(null)/g, ': <NULL>$1</NULL>')

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(colorized)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t${lastIndex}`} className="text-faint">{colorized.slice(lastIndex, match.index)}</span>)
    }
    const [, tag, content] = match
    const colorClass = tag === 'KEY' ? 'text-accent-text'
      : tag === 'STR' ? 'text-green-400'
      : tag === 'BOOL' ? 'text-amber-400'
      : tag === 'NUM' ? 'text-purple-400'
      : 'text-faint'
    parts.push(<span key={`v${match.index}`} className={colorClass}>{content}</span>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < colorized.length) {
    parts.push(<span key="end" className="text-faint">{colorized.slice(lastIndex)}</span>)
  }

  return <>{parts}</>
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
