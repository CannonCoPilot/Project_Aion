import { useSearchParams } from 'react-router-dom';
import { DEFAULT_STATUS } from './FilterBar';

const FILTER_LABELS: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  workspace: 'Workspace',
  domain: 'Domain',
  project: 'Project',
  source: 'Source',
  assignee: 'Assignee',
  blockedReason: 'Blocked',
  stage: 'Stage',
  search: 'Search',
  label: 'Label',
  updatedAfter: 'Updated After',
  updatedBefore: 'Updated Before',
  createdAfter: 'Created After',
  createdBefore: 'Created Before',
  closedAfter: 'Closed After',
  staleDays: 'Stale Days',
};

export function ActiveFilters({ total }: { total?: number }) {
  const [params, setParams] = useSearchParams();

  const active: { key: string; label: string; value: string }[] = [];
  for (const [key, label] of Object.entries(FILTER_LABELS)) {
    const value = params.get(key);
    if (!value) continue;
    // Don't show status pill if it's the default
    if (key === 'status' && value === DEFAULT_STATUS) continue;
    active.push({ key, label, value });
  }

  if (active.length === 0 && total === undefined) return null;

  const clearOne = (key: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(key);
      return next;
    });
  };

  const clearAll = () => {
    setParams(new URLSearchParams());
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {total !== undefined && (
        <span className="text-faint">
          {total} task{total !== 1 ? 's' : ''}
        </span>
      )}
      {active.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-accent-text-light"
        >
          <span className="opacity-60">{f.label}:</span>
          <span>{f.key === 'assignee' && f.value === '_unassigned' ? 'Unassigned' : f.value}</span>
          <button
            onClick={() => clearOne(f.key)}
            className="ml-0.5 hover:text-accent-text-light"
            aria-label={`Clear ${f.label} filter`}
          >
            &times;
          </button>
        </span>
      ))}
      {active.length >= 2 && (
        <button onClick={clearAll} className="text-faint hover:text-tertiary underline">
          Clear all
        </button>
      )}
    </div>
  );
}
