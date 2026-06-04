import { useSearchParams } from 'react-router-dom';
import type { Task } from '../../api/tasks';
import { SearchInput } from './SearchInput';
import { FilterPresets } from './FilterPresets';
import { FilterPopover } from './FilterPopover';

// All non-closed statuses — used to fetch tasks that could appear in any active view
const ACTIVE_STATUSES = 'open,in_progress,deferred';

export const DEFAULT_STATUS = ACTIVE_STATUSES;

const WORKSPACES = [(import.meta as any).env?.VITE_DEFAULT_WORKSPACE || 'AIFred-Pro', 'CreativeProjects'];

interface FilterBarProps {
  filteredTasks?: Task[];
}

export function FilterBar({ filteredTasks }: FilterBarProps) {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const workspace = params.get('workspace') ?? '';
  const hideBlocked = params.get('hideBlocked') === '1';
  const hideWatching = params.get('hideWatching') === '1';

  const set = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchInput value={search} onChange={(v) => set('search', v)} />
      <FilterPresets filteredTasks={filteredTasks} />
      <FilterPopover />

      {/* Workspace filter */}
      <select
        value={workspace}
        onChange={(e) => set('workspace', e.target.value)}
        className={`rounded bg-surface-2 border px-2 py-1 text-xs text-tertiary focus:outline-none ${
          workspace
            ? 'border-purple-500/50 focus:border-purple-500'
            : 'border-subtle focus:border-accent-border'
        }`}
      >
        <option value="">All Workspaces</option>
        {WORKSPACES.map((w) => (
          <option key={w} value={w}>
            {w}
          </option>
        ))}
      </select>

      {/* Hide Blocked toggle */}
      <button
        onClick={() => set('hideBlocked', hideBlocked ? '' : '1')}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
          hideBlocked
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'bg-surface-2 text-faint border border-subtle hover:text-tertiary'
        }`}
      >
        {hideBlocked ? 'Blocked Hidden' : 'Hide Blocked'}
      </button>

      {/* Hide Watching toggle */}
      <button
        onClick={() => set('hideWatching', hideWatching ? '' : '1')}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
          hideWatching
            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
            : 'bg-surface-2 text-faint border border-subtle hover:text-tertiary'
        }`}
      >
        {hideWatching ? 'Watching Hidden' : 'Hide Watching'}
      </button>
    </div>
  );
}
