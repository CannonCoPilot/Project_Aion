import { useCallback, useState, useMemo } from 'react';
import type { Task } from '../../api/tasks';
import type { OrchestrationTaskMapEntry } from '../../api/orchestrations';
import { TaskRow } from './TaskRow';
import { TaskCard } from './TaskCard';
import { BulkActions } from './BulkActions';

export type TableGroupMode = 'none' | 'project' | 'domain' | 'source' | 'orchestration' | 'stage';

const GROUP_OPTIONS: { value: TableGroupMode; label: string }[] = [
  { value: 'none', label: 'No Grouping' },
  { value: 'project', label: 'Workspace' },
  { value: 'domain', label: 'Domain' },
  { value: 'source', label: 'Source' },
  { value: 'orchestration', label: 'Project Plan' },
  { value: 'stage', label: 'Pipeline Stage' },
];

const GROUP_COLORS: Record<TableGroupMode, string> = {
  none: '',
  project: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  domain: 'text-accent-text bg-accent/10 border-accent/20',
  source: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  orchestration: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  stage: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
};

interface TaskTableProps {
  tasks: Task[];
  sort?: string;
  order?: string;
  onSort?: (field: string) => void;
  focusIndex?: number;
  orchestrationMap?: Record<string, OrchestrationTaskMapEntry>;
}

const COLUMNS = [
  { key: '_select', label: '' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: '_stage', label: 'Stage' },
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'domain', label: 'Domain' },
  { key: 'project', label: 'Workspace' },
  { key: '_source', label: 'Source' },
  { key: '_orchestration', label: 'Proj' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'created_at', label: 'Created' },
  { key: 'updated_at', label: 'Updated' },
  { key: '_actions', label: '' },
] as const;

function extractLabel(task: Task, prefix: string): string | undefined {
  const match = task.labels?.find((l) => l.startsWith(`${prefix}:`));
  return match ? match.slice(prefix.length + 1) : undefined;
}

function getGroupKey(
  task: Task,
  groupBy: TableGroupMode,
  orchMap?: Record<string, OrchestrationTaskMapEntry>,
): string | undefined {
  switch (groupBy) {
    case 'project':
      return extractLabel(task, 'project');
    case 'domain':
      return extractLabel(task, 'domain');
    case 'source':
      return extractLabel(task, 'source');
    case 'stage':
      return extractLabel(task, 'stage');
    case 'orchestration': {
      if (orchMap?.[task.id]?.name) return orchMap[task.id].name;
      // Fall back to orchestration: label
      const orchLabel = task.labels?.find((l) => l.startsWith('orchestration:'));
      return orchLabel ? orchLabel.slice('orchestration:'.length) : undefined;
    }
    default:
      return undefined;
  }
}

interface PhaseInfo {
  name: string;
  total: number;
  closed: number;
}

interface TaskGroup {
  name: string;
  tasks: Task[];
  badge?: string; // orchestration status
  phases?: PhaseInfo[]; // phase breakdown for orchestration groups
}

export function TaskTable({
  tasks,
  sort,
  order,
  onSort,
  focusIndex = -1,
  orchestrationMap,
}: TaskTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<TableGroupMode>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === tasks.length) return new Set();
      return new Set(tasks.map((t) => t.id));
    });
  }, [tasks]);

  const handleSort = useCallback(
    (key: string) => {
      onSort?.(key);
    },
    [onSort],
  );

  const sortIndicator = (key: string) => {
    if (sort !== key) return null;
    return <span className="ml-1">{order === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  };

  const toggleGroup = useCallback((name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Group tasks
  const { groups, ungrouped } = useMemo(() => {
    if (groupBy === 'none') {
      return { groups: [] as TaskGroup[], ungrouped: tasks };
    }

    const byGroup: Record<string, Task[]> = {};
    const standalone: Task[] = [];

    for (const task of tasks) {
      const key = getGroupKey(task, groupBy, orchestrationMap);
      if (key) {
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(task);
      } else {
        standalone.push(task);
      }
    }

    const grouped: TaskGroup[] = Object.entries(byGroup)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, groupTasks]) => {
        let badge: string | undefined;
        let phases: PhaseInfo[] | undefined;
        if (groupBy === 'orchestration') {
          if (orchestrationMap) {
            const entry = orchestrationMap[groupTasks[0].id];
            if (entry) badge = entry.status;
          }
          // Build phase breakdown
          const phaseMap: Record<string, { total: number; closed: number }> = {};
          for (const t of groupTasks) {
            const phaseLabel = t.labels?.find((l) => l.startsWith('phase:'));
            const phaseName = phaseLabel
              ? phaseLabel.slice('phase:'.length).replace(/-/g, ' ').replace(/\s+/g, ' ')
              : 'No Phase';
            if (!phaseMap[phaseName]) phaseMap[phaseName] = { total: 0, closed: 0 };
            phaseMap[phaseName].total++;
            if (t.status === 'closed') phaseMap[phaseName].closed++;
          }
          phases = Object.entries(phaseMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([pName, stats]) => ({ name: pName, ...stats }));
        }
        return { name, tasks: groupTasks, badge, phases };
      });

    return { groups: grouped, ungrouped: standalone };
  }, [tasks, groupBy, orchestrationMap]);

  // Build a global index for focus tracking across groups
  const globalTaskOrder = useMemo(() => {
    const order: string[] = [];
    for (const g of groups) {
      if (!collapsedGroups.has(g.name)) {
        for (const t of g.tasks) order.push(t.id);
      }
    }
    for (const t of ungrouped) order.push(t.id);
    return order;
  }, [groups, ungrouped, collapsedGroups]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-8 text-center text-faint">
        No tasks found
      </div>
    );
  }

  const colCount = COLUMNS.length;
  const colorClass = GROUP_COLORS[groupBy];

  const renderTableHead = () => (
    <thead className="bg-surface-1 text-muted text-xs uppercase sticky top-0 z-10">
      <tr>
        {COLUMNS.map((col) => (
          <th
            key={col.key}
            onClick={() => (col.key === '_select' ? toggleAll() : handleSort(col.key))}
            className={`px-3 py-2 text-left cursor-pointer hover:text-secondary select-none ${col.key === '_select' ? 'w-8' : ''}`}
          >
            {col.key === '_select' ? (
              <input
                type="checkbox"
                checked={selected.size === tasks.length && tasks.length > 0}
                onChange={toggleAll}
                className="rounded border-b-muted bg-surface-2 text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer"
              />
            ) : (
              <>
                {col.label}
                {sortIndicator(col.key)}
              </>
            )}
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderGroupHeader = (group: TaskGroup) => {
    const closedCount = group.tasks.filter((t) => t.status === 'closed').length;
    const allClosed = closedCount === group.tasks.length && group.tasks.length > 0;

    return (
      <tr
        key={`group-${group.name}`}
        className={`cursor-pointer hover:bg-surface-2/80 transition-colors ${
          groupBy === 'orchestration'
            ? 'bg-teal-500/[0.06] border-l-2 border-l-teal-500/40'
            : 'bg-surface-1/80'
        }`}
        onClick={() => toggleGroup(group.name)}
      >
        <td colSpan={colCount} className="px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-faint text-xs w-4">
              {collapsedGroups.has(group.name) ? '\u25B6' : '\u25BC'}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded border ${colorClass}`}
            >
              {group.name}
            </span>
            <span className="text-xs text-disabled tabular-nums">
              {closedCount}/{group.tasks.length}
            </span>
            {group.phases && group.phases.length > 0 && (
              <div className="flex items-center gap-1.5 ml-1">
                {group.phases.map((p) => {
                  const done = p.closed === p.total && p.total > 0;
                  const hasProgress = p.closed > 0 && !done;
                  return (
                    <span
                      key={p.name}
                      className={`text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
                        done
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : hasProgress
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-surface-2 text-muted border-subtle'
                      }`}
                      title={`${p.name}: ${p.closed}/${p.total} complete`}
                    >
                      {p.name.length > 30 ? p.name.slice(0, 28) + '...' : p.name} {p.closed}/
                      {p.total}
                    </span>
                  );
                })}
              </div>
            )}
            {allClosed && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                Complete
              </span>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-faint uppercase tracking-wider font-medium">
            Group
          </label>
          <select
            value={groupBy}
            onChange={(e) => {
              setGroupBy(e.target.value as TableGroupMode);
              setCollapsedGroups(new Set());
            }}
            className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
          >
            {GROUP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {groupBy !== 'none' && groups.length > 0 && (
          <>
            <div className="w-px h-4 bg-surface-3" />
            <button
              onClick={() => {
                if (collapsedGroups.size === groups.length) {
                  setCollapsedGroups(new Set());
                } else {
                  setCollapsedGroups(new Set(groups.map((g) => g.name)));
                }
              }}
              className="text-[10px] text-faint hover:text-tertiary uppercase tracking-wider"
            >
              {collapsedGroups.size === groups.length ? 'Expand All' : 'Collapse All'}
            </button>
          </>
        )}
      </div>

      <BulkActions
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        total={tasks.length}
      />

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-default">
        <table className="w-full text-sm">
          {renderTableHead()}
          <tbody className="bg-surface-base">
            {groupBy === 'none' ? (
              tasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isFocused={i === focusIndex}
                  isSelected={selected.has(task.id)}
                  onToggleSelect={() => toggleSelect(task.id)}
                  orchestration={orchestrationMap?.[task.id]}
                />
              ))
            ) : (
              <>
                {groups.map((group) => (
                  <GroupSection
                    key={group.name}
                    group={group}
                    collapsed={collapsedGroups.has(group.name)}
                    renderHeader={() => renderGroupHeader(group)}
                    selected={selected}
                    toggleSelect={toggleSelect}
                    orchestrationMap={orchestrationMap}
                    focusIndex={focusIndex}
                    globalTaskOrder={globalTaskOrder}
                  />
                ))}
                {ungrouped.length > 0 && (
                  <>
                    <tr className="bg-surface-1/80">
                      <td colSpan={colCount} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-faint px-2 py-0.5">
                            Ungrouped
                          </span>
                          <span className="text-xs text-disabled tabular-nums">
                            {ungrouped.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {ungrouped.map((task) => {
                      const gi = globalTaskOrder.indexOf(task.id);
                      return (
                        <TaskRow
                          key={task.id}
                          task={task}
                          isFocused={gi !== -1 && gi === focusIndex}
                          isSelected={selected.has(task.id)}
                          onToggleSelect={() => toggleSelect(task.id)}
                          orchestration={orchestrationMap?.[task.id]}
                        />
                      );
                    })}
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {groupBy === 'none' ? (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} orchestration={orchestrationMap?.[task.id]} />
          ))
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.name}>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                  onClick={() => toggleGroup(group.name)}
                >
                  <span className="text-faint text-xs">
                    {collapsedGroups.has(group.name) ? '\u25B6' : '\u25BC'}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded border ${colorClass}`}
                  >
                    {group.name}
                  </span>
                  {group.badge && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface-2 text-muted border border-subtle">
                      {group.badge}
                    </span>
                  )}
                  <span className="text-xs text-disabled tabular-nums">{group.tasks.length}</span>
                </div>
                {!collapsedGroups.has(group.name) && (
                  <div className="space-y-2 ml-4">
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        orchestration={orchestrationMap?.[task.id]}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {ungrouped.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="text-xs font-medium text-faint px-2 py-0.5">Ungrouped</span>
                  <span className="text-xs text-disabled tabular-nums">{ungrouped.length}</span>
                </div>
                <div className="space-y-2 ml-4">
                  {ungrouped.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      orchestration={orchestrationMap?.[task.id]}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// Helper component to avoid repeating group rendering logic
function GroupSection({
  group,
  collapsed,
  renderHeader,
  selected,
  toggleSelect,
  orchestrationMap,
  focusIndex,
  globalTaskOrder,
}: {
  group: TaskGroup;
  collapsed: boolean;
  renderHeader: () => React.ReactElement;
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  orchestrationMap?: Record<string, OrchestrationTaskMapEntry>;
  focusIndex: number;
  globalTaskOrder: string[];
}) {
  return (
    <>
      {renderHeader()}
      {!collapsed &&
        group.tasks.map((task) => {
          const gi = globalTaskOrder.indexOf(task.id);
          return (
            <TaskRow
              key={task.id}
              task={task}
              isFocused={gi !== -1 && gi === focusIndex}
              isSelected={selected.has(task.id)}
              onToggleSelect={() => toggleSelect(task.id)}
              orchestration={orchestrationMap?.[task.id]}
            />
          );
        })}
    </>
  );
}
