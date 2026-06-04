import type { EventSource, EventCategory } from '../../api/nexus-ops';

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
] as const;

const SOURCES: { value: EventSource; label: string }[] = [
  { value: 'tasks', label: 'Tasks' },
  { value: 'nexus_db', label: 'Nexus DB' },
  { value: 'task_reviewer', label: 'Task Reviewer' },
  { value: 'execution', label: 'Executions' },
  { value: 'relay', label: 'Relay' },
  { value: 'dispatcher', label: 'Dispatcher' },
];

const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'task', label: 'Task' },
  { value: 'job', label: 'Job' },
  { value: 'decision', label: 'Decision' },
  { value: 'notification', label: 'Notification' },
  { value: 'system', label: 'System' },
];

export interface FilterState {
  timeRangeHours: number;
  source?: EventSource;
  category?: EventCategory;
  task_id?: string;
  job?: string;
  persona?: string;
}

interface TimelineFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}

export function TimelineFilters({ filters, onChange }: TimelineFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Time range buttons */}
      <div className="flex rounded-lg border border-default overflow-hidden">
        {TIME_RANGES.map(tr => (
          <button
            key={tr.label}
            onClick={() => onChange({ ...filters, timeRangeHours: tr.hours })}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              filters.timeRangeHours === tr.hours
                ? 'bg-accent/20 text-accent-text'
                : 'text-muted hover:text-secondary hover:bg-surface-2'
            }`}
          >
            {tr.label}
          </button>
        ))}
      </div>

      {/* Source filter */}
      <select
        value={filters.source ?? ''}
        onChange={(e) => onChange({ ...filters, source: (e.target.value || undefined) as EventSource | undefined })}
        className="rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-xs text-tertiary focus:border-accent-border focus:outline-none"
      >
        <option value="">All Sources</option>
        {SOURCES.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* Category filter */}
      <select
        value={filters.category ?? ''}
        onChange={(e) => onChange({ ...filters, category: (e.target.value || undefined) as EventCategory | undefined })}
        className="rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-xs text-tertiary focus:border-accent-border focus:outline-none"
      >
        <option value="">All Categories</option>
        {CATEGORIES.map(c => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      {/* Text filters */}
      <input
        type="text"
        placeholder="Task ID..."
        value={filters.task_id ?? ''}
        onChange={(e) => onChange({ ...filters, task_id: e.target.value || undefined })}
        className="rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-xs text-tertiary placeholder-disabled w-28 focus:border-accent-border focus:outline-none"
      />

      <input
        type="text"
        placeholder="Job name..."
        value={filters.job ?? ''}
        onChange={(e) => onChange({ ...filters, job: e.target.value || undefined })}
        className="rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-xs text-tertiary placeholder-disabled w-28 focus:border-accent-border focus:outline-none"
      />

      {/* Clear filters */}
      {(filters.source || filters.category || filters.task_id || filters.job || filters.persona) && (
        <button
          onClick={() => onChange({ timeRangeHours: filters.timeRangeHours })}
          className="text-xs text-faint hover:text-tertiary transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
