import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { useTaskList, useStats, usePipelineActive, type Task } from '../api/tasks';
import { Header } from '../components/layout/Header';
import { KanbanColumn, type ColumnDef, type GroupByMode } from '../components/board/KanbanColumn';
import { KanbanCard } from '../components/board/KanbanCard';
import { CloseTaskModal } from '../components/board/CloseTaskModal';
import { patch, post } from '../api/client';
import { classifyTask, classifyTaskPipeline, getTaskStage, STAGE_COLUMNS } from '../lib/board';
import { BlockedBanner } from '../components/board/BlockedBanner';
import { getBlockedReasons, BLOCKED_REASONS, type BlockedReason } from '../lib/labels';
import { useCompany } from '../hooks/useCompany';
import { PRIORITIES } from '../lib/priorities';

type ViewMode = 'status' | 'stage' | 'pipeline';

const STATUS_COLUMNS: ColumnDef[] = [
  { id: 'backlog', label: 'Backlog', dotColor: 'bg-surface-muted', bgHighlight: 'bg-surface-2/40' },
  { id: 'ready', label: 'Ready', dotColor: 'bg-accent', bgHighlight: 'bg-accent/10' },
  {
    id: 'in_progress',
    label: 'In Progress',
    dotColor: 'bg-amber-500',
    bgHighlight: 'bg-amber-500/10',
  },
  { id: 'review', label: 'Review', dotColor: 'bg-purple-500', bgHighlight: 'bg-purple-500/10' },
  { id: 'done', label: 'Done', dotColor: 'bg-green-500', bgHighlight: 'bg-green-500/10' },
  { id: 'blocked', label: 'Blocked', dotColor: 'bg-red-500', bgHighlight: 'bg-red-500/10' },
  {
    id: 'deferred',
    label: 'Deferred',
    dotColor: 'bg-surface-muted',
    bgHighlight: 'bg-surface-muted/10',
  },
];

// v1 legacy stage columns
const LEGACY_STAGE_COLUMNS: ColumnDef[] = [
  { id: 'intake', label: 'Intake', dotColor: 'bg-slate-500', bgHighlight: 'bg-slate-500/10' },
  { id: 'evaluate', label: 'Evaluate', dotColor: 'bg-cyan-500', bgHighlight: 'bg-cyan-500/10' },
  { id: 'route', label: 'Route', dotColor: 'bg-indigo-500', bgHighlight: 'bg-indigo-500/10' },
  { id: 'review', label: 'Review', dotColor: 'bg-amber-500', bgHighlight: 'bg-amber-500/10' },
  { id: 'queue', label: 'Queue', dotColor: 'bg-accent', bgHighlight: 'bg-accent/10' },
  { id: 'execute', label: 'Execute', dotColor: 'bg-green-500', bgHighlight: 'bg-green-500/10' },
  { id: 'completed', label: 'Completed', dotColor: 'bg-emerald-500', bgHighlight: 'bg-emerald-500/10' },
  { id: 'unstaged', label: 'Unstaged', dotColor: 'bg-surface-muted', bgHighlight: 'bg-surface-muted/10' },
];

// v2 pipeline columns (6-dimension label state machine)
const PIPELINE_V2_COLUMNS: ColumnDef[] = [
  { id: 'staging', label: 'Staging', dotColor: 'bg-slate-500', bgHighlight: 'bg-slate-500/10' },
  { id: 'evaluated', label: 'Evaluated', dotColor: 'bg-cyan-500', bgHighlight: 'bg-cyan-500/10' },
  { id: 'queued', label: 'Queued', dotColor: 'bg-accent', bgHighlight: 'bg-accent/10' },
  { id: 'active', label: 'Active', dotColor: 'bg-amber-500', bgHighlight: 'bg-amber-500/10' },
  { id: 'blocked', label: 'Blocked', dotColor: 'bg-red-500', bgHighlight: 'bg-red-500/10' },
  { id: 'completed', label: 'Completed', dotColor: 'bg-green-500', bgHighlight: 'bg-green-500/10' },
];

const COLUMNS = STATUS_COLUMNS;

const PRIORITY_STRIPE_COLORS: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-accent-light',
  4: 'bg-surface-muted',
};

const GROUP_BY_OPTIONS: { value: GroupByMode; label: string }[] = [
  { value: 'none', label: 'No Grouping' },
  { value: 'project', label: 'Project' },
  { value: 'domain', label: 'Domain' },
];

export default function KanbanPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWorkspace, setFilterWorkspace] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterBlockedReason, setFilterBlockedReason] = useState('');
  const [filterStage, setFilterStage] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByMode>('project');
  const [showClosed, setShowClosed] = useState(true);
  const [hideBlocked, setHideBlocked] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');

  const { company: companySlug, isFiltered: companyFiltered } = useCompany();
  const companyFilter = companyFiltered ? companySlug : undefined;

  const {
    data: allTasks,
    isLoading,
    isError,
  } = useTaskList(
    showClosed || viewMode === 'stage' || viewMode === 'pipeline'
      ? { company: companyFilter }
      : { status: 'open,in_progress,deferred', company: companyFilter },
  );
  const { data: stats } = useStats(companyFilter);
  const { data: pipelineActive } = usePipelineActive();
  const queryClient = useQueryClient();

  const glowingIds = useMemo(() => {
    if (!pipelineActive) return new Set<string>();
    return new Set([
      ...pipelineActive.staging,
      ...pipelineActive.evaluating,
      ...(pipelineActive.orchestrating ?? []),
      ...pipelineActive.executing,
      ...pipelineActive.reviewing,
    ]);
  }, [pipelineActive]);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [closeModal, setCloseModal] = useState<{ task: Task } | null>(null);

  // Optimistic overrides: taskId -> columnId
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Derive workspaces from task ID prefix (e.g. "${workspace}-xxx" → process.env.DEFAULT_WORKSPACE || 'MyProject')
  const workspaces = useMemo(() => {
    if (!allTasks) return [];
    const ws = new Set<string>();
    for (const t of allTasks) {
      const dash = t.id.indexOf('-');
      if (dash > 0) ws.add(t.id.slice(0, dash));
    }
    return [...ws].sort();
  }, [allTasks]);

  const tasks = useMemo(() => {
    if (!allTasks) return [];
    return allTasks.filter((t) => {
      const labels = t.labels ?? [];
      if (searchQuery) {
        const s = searchQuery.toLowerCase();
        const match =
          t.id.toLowerCase().includes(s) ||
          t.title.toLowerCase().includes(s) ||
          t.description?.toLowerCase().includes(s) ||
          labels.some((l) => l.toLowerCase().includes(s));
        if (!match) return false;
      }
      if (filterWorkspace && !t.id.startsWith(`${filterWorkspace}-`)) return false;
      if (filterProject) {
        const hasProject = labels.some((l) => l.startsWith('project:'));
        if (filterProject === '__standalone__') {
          if (hasProject) return false;
        } else {
          if (!labels.some((l) => l === `project:${filterProject}`)) return false;
        }
      }
      if (filterPriority && t.priority !== Number(filterPriority)) return false;
      if (filterDomain && !labels.some((l) => l === `domain:${filterDomain}`)) return false;
      if (
        filterBlockedReason &&
        !getBlockedReasons(labels).includes(filterBlockedReason as BlockedReason)
      )
        return false;
      if (filterStage) {
        if (!labels.some((l) => l === `stage:${filterStage}`)) return false;
      }
      if (hideBlocked && getBlockedReasons(labels).length > 0) return false;
      return true;
    });
  }, [
    allTasks,
    searchQuery,
    filterWorkspace,
    filterProject,
    filterPriority,
    filterDomain,
    filterBlockedReason,
    filterStage,
    hideBlocked,
  ]);

  // Blocked reason counts — only from tasks classified as blocked
  const blockedReasonCounts = useMemo(() => {
    const counts = new Map<BlockedReason, number>();
    for (const t of tasks) {
      if (classifyTask(t) !== 'blocked') continue;
      for (const reason of getBlockedReasons(t.labels ?? [])) {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const columnTasks = useMemo(() => {
    const cols = viewMode === 'pipeline' ? PIPELINE_V2_COLUMNS
      : viewMode === 'stage' ? LEGACY_STAGE_COLUMNS
      : COLUMNS;
    const buckets: Record<string, Task[]> = {};
    for (const col of cols) buckets[col.id] = [];

    if (viewMode === 'pipeline') {
      for (const task of tasks) {
        if (task.status === 'closed') {
          buckets['completed'].push(task);
        } else {
          const col = classifyTaskPipeline(task);
          if (buckets[col]) {
            buckets[col].push(task);
          } else {
            buckets['staging'].push(task);
          }
        }
      }
      buckets['completed'] = buckets['completed']
        .sort((a, b) =>
          new Date(b.closed_at ?? b.updated_at).getTime() -
          new Date(a.closed_at ?? a.updated_at).getTime()
        ).slice(0, 20);
      for (const col of cols) {
        if (col.id !== 'completed') {
          buckets[col.id].sort((a, b) => a.priority - b.priority);
        }
      }
    } else if (viewMode === 'stage') {
      for (const task of tasks) {
        if (task.status === 'closed') {
          buckets['completed'].push(task);
        } else {
          const stage = getTaskStage(task);
          if (stage && buckets[stage]) {
            buckets[stage].push(task);
          } else {
            buckets['unstaged'].push(task);
          }
        }
      }
      buckets['completed'] = buckets['completed']
        .sort((a, b) =>
          new Date(b.closed_at ?? b.updated_at).getTime() -
          new Date(a.closed_at ?? a.updated_at).getTime()
        ).slice(0, 20);
      for (const col of cols) {
        if (col.id !== 'completed') {
          buckets[col.id].sort((a, b) => a.priority - b.priority);
        }
      }
    } else {
      for (const task of tasks) {
        const col = overrides[task.id] ?? classifyTask(task);
        if (buckets[col]) {
          buckets[col].push(task);
        } else {
          buckets['backlog'].push(task);
        }
      }
      buckets['done'] = buckets['done']
        .sort((a, b) =>
          new Date(b.closed_at ?? b.updated_at).getTime() -
          new Date(a.closed_at ?? a.updated_at).getTime()
        ).slice(0, 20);
      for (const col of cols) {
        if (col.id !== 'done') {
          buckets[col.id].sort((a, b) => a.priority - b.priority);
        }
      }
    }

    return buckets;
  }, [tasks, overrides, viewMode]);

  const recentlyClosedGroupNames = useMemo(() => {
    const RECENT_THRESHOLD_MS = 60_000;
    const now = Date.now();
    const names = new Set<string>();
    const completedTasks = columnTasks['completed'] ?? [];
    for (const t of completedTasks) {
      if (t.closed_at && now - new Date(t.closed_at).getTime() < RECENT_THRESHOLD_MS) {
        const proj = t.labels?.find((l) => l.startsWith('project:'));
        if (proj) names.add(proj.slice(8));
      }
    }
    return names;
  }, [columnTasks]);

  const projects = stats ? Object.keys(stats.byProject).sort() : [];
  const domains = stats ? Object.keys(stats.byDomain).sort() : [];

  const visibleColumns = useMemo(() => {
    if (viewMode === 'pipeline') {
      return showClosed
        ? PIPELINE_V2_COLUMNS
        : PIPELINE_V2_COLUMNS.filter((c) => c.id !== 'completed');
    }
    if (viewMode === 'stage') {
      return showClosed
        ? LEGACY_STAGE_COLUMNS
        : LEGACY_STAGE_COLUMNS.filter((c) => c.id !== 'completed');
    }
    return showClosed ? COLUMNS : COLUMNS.filter((c) => c.id !== 'done');
  }, [showClosed, viewMode]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks.find((t) => t.id === event.active.id);
      setActiveTask(task ?? null);
    },
    [tasks],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const targetColumn = over.id as string;
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return;

      const currentColumn = overrides[taskId] ?? classifyTask(task);
      if (currentColumn === targetColumn) return;

      // If dropping into done, show the close modal
      if (targetColumn === 'done') {
        setCloseModal({ task });
        return;
      }

      // Optimistic update
      setOverrides((prev) => ({ ...prev, [taskId]: targetColumn }));

      // Perform API call based on target column
      applyColumnChange(taskId, targetColumn)
        .then(() => {
          // Clear override and refetch
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        })
        .catch(() => {
          // Revert optimistic update
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
        });
    },
    [tasks, overrides, queryClient],
  );

  const handleCloseConfirm = useCallback(
    (reason: string) => {
      if (!closeModal) return;
      const taskId = closeModal.task.id;

      setOverrides((prev) => ({ ...prev, [taskId]: 'done' }));
      setCloseModal(null);

      post(`/tasks/${taskId}/close`, { reason })
        .then(() => {
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        })
        .catch(() => {
          setOverrides((prev) => {
            const next = { ...prev };
            delete next[taskId];
            return next;
          });
        });
    },
    [closeModal, queryClient],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Header title="Board" />
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-subtle overflow-hidden">
            <button
              onClick={() => setViewMode('pipeline')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === 'pipeline'
                  ? 'bg-cyan-500/20 text-cyan-400'
                  : 'bg-surface-2 text-faint hover:text-tertiary'
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setViewMode('status')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                viewMode === 'status'
                  ? 'bg-accent/20 text-accent-text'
                  : 'bg-surface-2 text-faint hover:text-tertiary'
              }`}
            >
              Classic
            </button>
          </div>
        </div>
        {/* Priority legend */}
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-surface-2/60 border border-subtle/50">
          <span className="text-[10px] text-faint uppercase tracking-wider font-medium">
            Priority
          </span>
          {[0, 1, 2, 3, 4].map((level) => {
            const p = PRIORITIES[level];
            return (
              <div key={level} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-sm ${PRIORITY_STRIPE_COLORS[level]}`} />
                <span className={`text-[10px] font-medium ${p.textClass}`}>{p.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, ID, or label..."
            className="rounded bg-surface-2 border border-subtle pl-7 pr-2 py-1 text-xs text-tertiary placeholder-disabled focus:border-accent-border focus:outline-none w-44"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-faint hover:text-tertiary text-xs"
            >
              &times;
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-surface-3" />

        {/* Group By dropdown */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-faint uppercase tracking-wider font-medium">
            Group
          </label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupByMode)}
            className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
          >
            {GROUP_BY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="w-px h-5 bg-surface-3" />

        <select
          value={filterWorkspace}
          onChange={(e) => setFilterWorkspace(e.target.value)}
          className={`rounded bg-surface-2 border px-2 py-1 text-xs text-tertiary focus:outline-none ${
            filterWorkspace
              ? 'border-purple-500/50 focus:border-purple-500'
              : 'border-subtle focus:border-accent-border'
          }`}
        >
          <option value="">All Workspaces</option>
          {workspaces.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>

        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className={`rounded bg-surface-2 border px-2 py-1 text-xs text-tertiary focus:outline-none ${
            filterProject
              ? 'border-teal-500/50 focus:border-teal-500'
              : 'border-subtle focus:border-accent-border'
          }`}
        >
          <option value="">All Projects</option>
          <option value="__standalone__">No Project</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
        >
          <option value="">All Priorities</option>
          <option value="0">!!! CRITICAL</option>
          <option value="1">!! HIGH</option>
          <option value="2">! MEDIUM</option>
          <option value="3">- LOW</option>
          <option value="4">... Backlog</option>
        </select>

        <select
          value={filterDomain}
          onChange={(e) => setFilterDomain(e.target.value)}
          className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
        >
          <option value="">All Domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        {viewMode === 'status' && (
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value)}
            className={`rounded bg-surface-2 border px-2 py-1 text-xs text-tertiary focus:outline-none ${
              filterStage
                ? 'border-cyan-500/50 focus:border-cyan-500'
                : 'border-subtle focus:border-accent-border'
            }`}
          >
            <option value="">All Stages</option>
            {STAGE_COLUMNS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}

        <select
          value={filterBlockedReason}
          onChange={(e) => setFilterBlockedReason(e.target.value)}
          className="rounded bg-surface-2 border border-red-500/30 px-2 py-1 text-xs text-tertiary focus:border-red-500 focus:outline-none"
        >
          <option value="">Blocked Reason</option>
          {BLOCKED_REASONS.map((r) => ({ ...r, count: blockedReasonCounts.get(r.reason) ?? 0 }))
            .filter((r) => r.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((r) => (
              <option key={r.reason} value={r.reason}>
                {r.label} ({r.count})
              </option>
            ))}
        </select>

        <div className="w-px h-5 bg-surface-3" />

        <button
          onClick={() => setShowClosed((prev) => !prev)}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            showClosed
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-surface-2 text-faint border border-subtle hover:text-tertiary'
          }`}
        >
          {showClosed ? 'Hide Closed' : 'Show Closed'}
        </button>

        <button
          onClick={() => setHideBlocked((prev) => !prev)}
          className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
            hideBlocked
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-surface-2 text-faint border border-subtle hover:text-tertiary'
          }`}
        >
          {hideBlocked ? 'Blocked Hidden' : 'Hide Blocked'}
        </button>

        {(searchQuery ||
          filterWorkspace ||
          filterProject ||
          filterPriority ||
          filterDomain ||
          filterBlockedReason ||
          filterStage ||
          hideBlocked) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterWorkspace('');
              setFilterProject('');
              setFilterPriority('');
              setFilterDomain('');
              setFilterBlockedReason('');
              setFilterStage('');
              setHideBlocked(false);
            }}
            className="text-xs text-faint hover:text-tertiary transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading && <div className="text-faint py-8 text-center">Loading tasks...</div>}
      {isError && (
        <div className="text-red-400 py-8 text-center">
          Failed to load tasks. Check server connection.
        </div>
      )}

      {!isLoading && !isError && viewMode === 'pipeline' && (
        <BlockedBanner tasks={tasks} />
      )}

      {!isLoading && !isError && (viewMode === 'pipeline' || viewMode === 'stage') && (
        <>
          <div
            className="flex gap-3 overflow-x-auto pb-4"
            style={{ minHeight: 'calc(100vh - 12rem)' }}
          >
            {visibleColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={columnTasks[col.id] ?? []}
                groupBy={groupBy}
                glowingIds={glowingIds}
                defaultGroupCollapsed={col.id === 'completed'}
                recentlyClosedGroupNames={col.id === 'completed' ? recentlyClosedGroupNames : undefined}
              />
            ))}
          </div>
          <p className="text-[10px] text-disabled text-center">
            Stage transitions are managed by automation — drag-drop disabled
          </p>
        </>
      )}

      {!isLoading && !isError && viewMode === 'status' && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div
            className="flex gap-3 overflow-x-auto pb-4"
            style={{ minHeight: 'calc(100vh - 12rem)' }}
          >
            {visibleColumns.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={columnTasks[col.id] ?? []}
                groupBy={groupBy}
                glowingIds={glowingIds}
              />
            ))}
          </div>

          <DragOverlay>{activeTask && <KanbanCard task={activeTask} overlay />}</DragOverlay>
        </DndContext>
      )}

      {closeModal && (
        <CloseTaskModal
          taskId={closeModal.task.id}
          taskTitle={closeModal.task.title}
          onClose={() => setCloseModal(null)}
          onConfirm={handleCloseConfirm}
        />
      )}
    </div>
  );
}

async function applyColumnChange(taskId: string, column: string): Promise<void> {
  switch (column) {
    case 'in_progress':
      await patch(`/tasks/${taskId}`, { status: 'in_progress' });
      break;
    case 'review':
      await patch(`/tasks/${taskId}`, { status: 'in_progress' });
      await post(`/tasks/${taskId}/labels`, { label: 'waiting:david' });
      break;
    case 'blocked':
      await post(`/tasks/${taskId}/labels`, { label: 'waiting:david' });
      break;
    case 'deferred':
      await post(`/tasks/${taskId}/labels`, { label: 'parked' });
      break;
    case 'backlog':
      await patch(`/tasks/${taskId}`, { status: 'open' });
      break;
    case 'ready':
      await patch(`/tasks/${taskId}`, { status: 'open' });
      await post(`/tasks/${taskId}/labels`, { label: 'auto:ready' });
      break;
  }
}
