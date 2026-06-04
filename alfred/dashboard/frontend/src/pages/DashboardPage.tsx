import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTaskList } from '../api/tasks';
import { Header } from '../components/layout/Header';
import { StatsCards } from '../components/stats/StatsCards';
import { TodayFocus } from '../components/stats/TodayFocus';
import { NexusHealthCard } from '../components/stats/NexusHealthCard';
import { FilterBar, DEFAULT_STATUS } from '../components/filters/FilterBar';
import { TaskTable } from '../components/tasks/TaskTable';
import { TaskForm } from '../components/tasks/TaskForm';
import { ActiveFilters } from '../components/filters/ActiveFilters';
import { KeyboardHelp } from '../components/KeyboardHelp';
import { useKeyboardNav } from '../hooks/useKeyboardNav';
import { useCompany } from '../hooks/useCompany';
import { classifyTask } from '../lib/board';
import { getBlockedReasons, getDependencyCount } from '../lib/labels';
import { BlockedBoardToolbar } from '../components/filters/BlockedBoardToolbar';
import { buildOrchestrationMap } from '../lib/orchestration-map';

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const { company, isFiltered } = useCompany();

  // null = not set (default to active), '' or 'all' = no status filter
  const rawStatus = params.get('status');
  const filters = {
    status:
      rawStatus === null
        ? DEFAULT_STATUS
        : rawStatus === 'all'
          ? undefined
          : rawStatus || undefined,
    priority: params.get('priority') ?? undefined,
    domain: params.get('domain') ?? undefined,
    workspace: params.get('workspace') ?? undefined,
    project: params.get('project') ?? undefined,
    source: params.get('source') ?? undefined,
    assignee: params.get('assignee') ?? undefined,
    blockedReason: params.get('blockedReason') ?? undefined,
    stage: params.get('stage') ?? undefined,
    search: params.get('search') ?? undefined,
    label: params.get('label') ?? undefined,
    sort: params.get('sort') ?? undefined,
    order: params.get('order') ?? undefined,
    company: isFiltered ? company : undefined,
    updatedAfter: params.get('updatedAfter') ?? undefined,
    updatedBefore: params.get('updatedBefore') ?? undefined,
    createdAfter: params.get('createdAfter') ?? undefined,
    createdBefore: params.get('createdBefore') ?? undefined,
    closedAfter: params.get('closedAfter') ?? undefined,
    staleDays: params.get('staleDays') ?? undefined,
  };

  const boardFilter = params.get('board') ?? '';
  const hideBlocked = params.get('hideBlocked') === '1';
  const hideWatching = params.get('hideWatching') === '1';
  const minDeps = parseInt(params.get('minDeps') ?? '', 10) || 0;
  const isResearchPreset = params.get('label') === 'review:research,waiting:david';
  const { data: recentResearch } = useTaskList({
    status: 'closed',
    label: 'type:research',
    sort: 'updated_at',
    order: 'desc',
  });

  const { data: tasks, isLoading, isError } = useTaskList(filters);

  // Tasks classified as "blocked" for the current board (used for the inline toolbar's reason counts).
  // Note: this respects all currently-applied filters, so reason counts will shrink as the user narrows.
  const blockedTasksForToolbar = useMemo(() => {
    if (boardFilter !== 'blocked') return [];
    return (tasks ?? []).filter((t) => classifyTask(t) === 'blocked');
  }, [tasks, boardFilter]);

  const taskList = useMemo(() => {
    let all = tasks ?? [];
    if (boardFilter) all = all.filter((t) => classifyTask(t) === boardFilter);
    if (hideBlocked) all = all.filter((t) => getBlockedReasons(t.labels ?? []).length === 0);
    if (hideWatching) all = all.filter((t) => !(t.labels ?? []).includes('waiting:trigger'));
    if (minDeps > 0) all = all.filter((t) => getDependencyCount(t) >= minDeps);
    // On the blocked board, default to staleness sort (oldest-updated first) when no explicit sort.
    if (boardFilter === 'blocked' && !filters.sort) {
      all = [...all].sort(
        (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
      );
    }
    return all;
  }, [tasks, boardFilter, hideBlocked, hideWatching, minDeps, filters.sort]);

  // Detect narrowing filters — when active, badge counts should reflect filtered tasks
  const hasActiveFilters = !!(
    filters.label ||
    filters.workspace ||
    filters.domain ||
    filters.project ||
    filters.source ||
    filters.assignee ||
    filters.blockedReason ||
    filters.stage ||
    filters.search
  );
  const filteredTasks = hasActiveFilters ? (tasks ?? []) : undefined;

  const orchestrationMap = useMemo(() => buildOrchestrationMap(tasks ?? []), [tasks]);

  const { focusIndex, helpOpen, setHelpOpen } = useKeyboardNav({
    tasks: taskList,
    onClaim: (id) => claimTask(id),
    onClose: () => {},
  });

  // Dynamic mutation hooks for keyboard actions
  const claimTask = (id: string) => {
    // We need to call the API directly since hooks can't be dynamic
    // Use the mutation from the inline component instead
    fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress' }),
    });
  };

  const handleSort = useCallback(
    (field: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        const currentSort = prev.get('sort');
        const currentOrder = prev.get('order');
        if (currentSort === field && currentOrder !== 'asc') {
          next.set('sort', field);
          next.set('order', 'asc');
        } else if (currentSort === field && currentOrder === 'asc') {
          next.delete('sort');
          next.delete('order');
        } else {
          next.set('sort', field);
          next.set('order', 'desc');
        }
        return next;
      });
    },
    [setParams],
  );

  return (
    <div className="space-y-4">
      <Header title="Tasks">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent"
        >
          {showCreate ? 'Cancel' : 'New Task'}
        </button>
      </Header>

      {showCreate && (
        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <TaskForm onClose={() => setShowCreate(false)} />
        </div>
      )}

      <TodayFocus />
      <StatsCards />
      <NexusHealthCard />
      <FilterBar filteredTasks={filteredTasks} />
      <ActiveFilters total={taskList.length} />
      {boardFilter === 'blocked' && <BlockedBoardToolbar blockedTasks={blockedTasksForToolbar} />}

      {isLoading && <div className="text-faint py-8 text-center">Loading tasks...</div>}
      {isError && (
        <div className="text-red-400 py-8 text-center">
          Failed to load tasks. Check server connection.
        </div>
      )}
      {!isLoading && !isError && boardFilter === 'approvals' && taskList.length === 0 && (
        <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-8 text-center">
          <p className="text-sm text-secondary">No tasks pending approval.</p>
          <p className="mt-1 text-xs text-disabled">
            Tasks awaiting human review surface here automatically when the pipeline
            tags them <code className="text-faint">pipeline:needs-approval</code>.
          </p>
        </div>
      )}
      {!isLoading && !isError && !(boardFilter === 'approvals' && taskList.length === 0) && (
        <TaskTable
          tasks={taskList}
          sort={filters.sort}
          order={filters.order}
          onSort={handleSort}
          focusIndex={focusIndex}
          orchestrationMap={orchestrationMap}
        />
      )}

      {isResearchPreset && (recentResearch?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-disabled uppercase tracking-wider px-1">Recently Triaged</p>
          <div className="rounded-lg border border-subtle bg-surface-1 divide-y divide-subtle">
            {recentResearch!.slice(0, 5).map((t) => (
              <a
                key={t.id}
                href={`/tasks/${t.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors"
              >
                <span className="text-xs text-disabled font-mono">{t.id}</span>
                <span className="text-sm text-secondary flex-1 truncate">{t.title}</span>
                <span className="text-xs text-disabled">
                  {t.closed_at ? new Date(t.closed_at).toLocaleDateString() : ''}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {helpOpen && <KeyboardHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
