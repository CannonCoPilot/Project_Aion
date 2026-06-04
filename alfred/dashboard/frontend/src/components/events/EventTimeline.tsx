import { useState, type ReactNode } from 'react';
import type { TaskEvent } from '../../api/tasks';
import { LabelChip } from '../tasks/LabelChip';

const EVENT_ICONS: Record<string, string> = {
  created: '+',
  status_changed: '~',
  priority_changed: '!',
  label_added: '#',
  label_removed: '-',
  closed: 'x',
  note_added: '>',
  assigned: '@',
};

function tryParseJson(str: string): object | null {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function getEventLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

/** Render JSON value recursively with syntax coloring */
function JsonValue({ value, indent = 0 }: { value: unknown; indent?: number }): ReactNode {
  if (value === null) return <span className="text-faint">null</span>;
  if (typeof value === 'boolean') return <span className="text-purple-400">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-accent-text">{value}</span>;
  if (typeof value === 'string') return <span className="text-amber-300">"{value}"</span>;

  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{'[]'}</span>;
    return (
      <>
        {'[\n'}
        {value.map((item, i) => (
          <span key={i}>
            {innerPad}
            <JsonValue value={item} indent={indent + 1} />
            {i < value.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {pad}{']'}
      </>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span>{'{}'}</span>;
    return (
      <>
        {'{\n'}
        {entries.map(([key, val], i) => (
          <span key={key}>
            {innerPad}
            <span className="text-teal-400">"{key}"</span>
            {': '}
            <JsonValue value={val} indent={indent + 1} />
            {i < entries.length - 1 ? ',\n' : '\n'}
          </span>
        ))}
        {pad}{'}'}
      </>
    );
  }

  return <span>{String(value)}</span>;
}

const COLLAPSED_MAX_HEIGHT = '7rem';

function CollapsibleJson({ data, label }: { data: object; label?: string }) {
  const [expanded, setExpanded] = useState(false);
  const lineCount = JSON.stringify(data, null, 2).split('\n').length;
  const isLong = lineCount > 5;

  return (
    <div className="relative">
      {label && <span className="text-xs text-faint">{label}</span>}
      <div
        className={`relative ${!expanded && isLong ? 'overflow-hidden' : ''}`}
        style={!expanded && isLong ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
      >
        <pre className="text-xs bg-surface-1/70 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
          <JsonValue value={data} />
        </pre>
        {!expanded && isLong && (
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-surface-1/90 to-transparent rounded-b" />
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-teal-400 hover:text-teal-300 mt-1"
        >
          {expanded ? 'Show less' : `Show all (${lineCount} lines)`}
        </button>
      )}
    </div>
  );
}

function EventDetail({ evt }: { evt: TaskEvent }) {
  // If there's a plain-text comment, show it (label_added, label_removed, etc.)
  if (evt.comment) {
    const commentJson = tryParseJson(evt.comment);
    if (commentJson) return <CollapsibleJson data={commentJson} />;
    return <p className="text-sm text-secondary">{evt.comment}</p>;
  }

  const oldParsed = evt.old_value ? tryParseJson(evt.old_value) : null;
  const newParsed = evt.new_value ? tryParseJson(evt.new_value) : null;

  // Both fields have JSON — show new_value (the change), old_value available on expand
  if (newParsed) {
    return (
      <div className="space-y-1">
        <CollapsibleJson data={newParsed} label={oldParsed ? 'Changed to:' : undefined} />
        {oldParsed && <CollapsibleJson data={oldParsed} label="Previous:" />}
      </div>
    );
  }

  // Non-JSON values
  if (evt.old_value && evt.new_value) {
    return <p className="text-sm text-secondary">{evt.old_value} → {evt.new_value}</p>;
  }
  if (evt.new_value) {
    return <p className="text-sm text-secondary">{evt.new_value}</p>;
  }

  return <p className="text-sm text-muted">{getEventLabel(evt.event_type)}</p>;
}

/** Extract label name from event comment like "Added label: domain:infrastructure" or "Removed label: foo" */
function extractLabel(comment: string | undefined): string | null {
  if (!comment) return null;
  const match = comment.match(/^(?:Added|Removed) label:\s*(.+)$/i);
  return match ? match[1].trim() : null;
}

type TimelineEntry =
  | { kind: 'single'; evt: TaskEvent }
  | { kind: 'label_group'; type: 'label_added' | 'label_removed'; labels: string[]; actor: string; created_at: string; firstId: number };

/** Group consecutive label_added / label_removed events that share actor + timestamp */
function groupEvents(events: TaskEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  let i = 0;
  while (i < events.length) {
    const evt = events[i];
    const label = (evt.event_type === 'label_added' || evt.event_type === 'label_removed')
      ? extractLabel(evt.comment)
      : null;

    if (label) {
      // Collect consecutive label events of the same type, actor, and timestamp
      const labels: string[] = [label];
      const firstId = evt.id;
      const type = evt.event_type as 'label_added' | 'label_removed';
      let j = i + 1;
      while (j < events.length) {
        const next = events[j];
        if (
          next.event_type === type &&
          next.actor === evt.actor &&
          next.created_at === evt.created_at
        ) {
          const nextLabel = extractLabel(next.comment);
          if (nextLabel) labels.push(nextLabel);
          j++;
        } else {
          break;
        }
      }
      entries.push({ kind: 'label_group', type, labels, actor: evt.actor, created_at: evt.created_at, firstId });
      i = j;
    } else {
      entries.push({ kind: 'single', evt });
      i++;
    }
  }

  return entries;
}

function LabelGroupEntry({ entry }: { entry: Extract<TimelineEntry, { kind: 'label_group' }> }) {
  const isAdded = entry.type === 'label_added';
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-sm text-muted">{isAdded ? 'Added' : 'Removed'}:</span>
        {entry.labels.map(label => (
          <LabelChip key={label} label={label} />
        ))}
      </div>
      <div className="flex gap-2 text-xs text-faint mt-0.5">
        <span>{new Date(entry.created_at).toLocaleString()}</span>
        {entry.actor && <span>by {entry.actor}</span>}
      </div>
    </div>
  );
}

export function EventTimeline({ events }: { events: TaskEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-faint">No events recorded</p>;
  }

  const grouped = groupEvents(events);

  return (
    <div className="space-y-0">
      {grouped.map(entry => {
        if (entry.kind === 'label_group') {
          const icon = entry.type === 'label_added' ? '#' : '-';
          return (
            <div key={`lg-${entry.firstId}`} className="flex gap-3 py-2 border-l-2 border-default pl-4 relative">
              <span className="absolute -left-2 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-2 text-[10px] text-muted font-mono">
                {icon}
              </span>
              <LabelGroupEntry entry={entry} />
            </div>
          );
        }

        const evt = entry.evt;
        return (
          <div key={evt.id} className="flex gap-3 py-2 border-l-2 border-default pl-4 relative">
            <span className="absolute -left-2 top-2.5 flex h-4 w-4 items-center justify-center rounded-full bg-surface-2 text-[10px] text-muted font-mono">
              {EVENT_ICONS[evt.event_type] ?? '.'}
            </span>
            <div className="flex-1 min-w-0">
              <EventDetail evt={evt} />
              <div className="flex gap-2 text-xs text-faint mt-0.5">
                <span>{new Date(evt.created_at).toLocaleString()}</span>
                {evt.actor && <span>by {evt.actor}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
