import { useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Task } from '../../api/tasks';
import { KanbanCard } from './KanbanCard';
import { TaskGroup, type GroupColorScheme } from './TaskGroup';

export type GroupByMode = 'none' | 'project' | 'domain';

export interface ColumnDef {
  id: string;
  label: string;
  dotColor: string;
  bgHighlight: string;
}

interface KanbanColumnProps {
  column: ColumnDef;
  tasks: Task[];
  groupBy: GroupByMode;
  glowingIds?: Set<string>;
  defaultGroupCollapsed?: boolean;
  recentlyClosedGroupNames?: Set<string>;
}

function extractLabel(task: Task, prefix: string): string | undefined {
  const match = task.labels?.find((l) => l.startsWith(`${prefix}:`));
  return match ? match.slice(prefix.length + 1) : undefined;
}

function getGroupKey(task: Task, groupBy: GroupByMode): string | undefined {
  switch (groupBy) {
    case 'project':
      return extractLabel(task, 'project');
    case 'domain':
      return extractLabel(task, 'domain');
    default:
      return undefined;
  }
}

const GROUP_COLORS: Record<GroupByMode, GroupColorScheme> = {
  none: 'purple',
  project: 'teal',
  domain: 'blue',
};

const GROUP_HIDE_LABEL: Record<GroupByMode, 'project' | 'domain' | undefined> = {
  none: undefined,
  project: 'project',
  domain: 'domain',
};

export function KanbanColumn({ column, tasks, groupBy, glowingIds, defaultGroupCollapsed, recentlyClosedGroupNames }: KanbanColumnProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { isOver, setNodeRef } = useDroppable({ id: column.id });

  const taskIds = tasks.map((t) => t.id);

  // Group tasks by the selected mode
  const { groups, standaloneTasks } = useMemo(() => {
    if (groupBy === 'none') {
      return {
        groups: [] as {
          name: string;
          tasks: Task[];
          statusBadge?: string;
          phases?: { id: string; tasks: Task[] }[];
        }[],
        standaloneTasks: tasks,
      };
    }

    const byGroup: Record<string, Task[]> = {};
    const standalone: Task[] = [];

    for (const task of tasks) {
      const key = getGroupKey(task, groupBy);
      if (key) {
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(task);
      } else {
        standalone.push(task);
      }
    }

    const grouped = Object.entries(byGroup)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, groupTasks]) => {
        return { name, tasks: groupTasks };
      });

    return { groups: grouped, standaloneTasks: standalone };
  }, [tasks, groupBy]);

  return (
    <div className="flex flex-col shrink-0 w-72">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 mb-2 sticky top-0 z-10 bg-surface-1">
        <span className={`w-2.5 h-2.5 rounded-full ${column.dotColor}`} />
        <h3 className="text-sm font-semibold text-secondary">{column.label}</h3>
        <span className="text-xs text-faint tabular-nums">{tasks.length}</span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-disabled hover:text-muted text-xs transition-colors"
          aria-label={collapsed ? 'Expand column' : 'Collapse column'}
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </button>
      </div>

      {/* Card list */}
      {!collapsed && (
        <div
          ref={setNodeRef}
          className={`flex-1 rounded-lg px-1.5 py-1.5 space-y-2 overflow-y-auto transition-colors duration-150 ${
            isOver ? column.bgHighlight : 'bg-transparent'
          }`}
          style={{ maxHeight: 'calc(100vh - 10rem)' }}
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {/* Grouped tasks */}
            {groups.map((group) => {
              const hasRecentClose = recentlyClosedGroupNames?.has(group.name) ?? false;
              return (
                <TaskGroup
                  key={group.name}
                  groupName={group.name}
                  tasks={group.tasks}
                  colorScheme={GROUP_COLORS[groupBy]}
                  hideLabel={GROUP_HIDE_LABEL[groupBy]}
                  glowingIds={glowingIds}
                  defaultCollapsed={defaultGroupCollapsed && !hasRecentClose}
                />
              );
            })}

            {/* Standalone tasks — no container */}
            {standaloneTasks.map((task) => (
              <KanbanCard key={task.id} task={task} isGlowing={glowingIds?.has(task.id)} />
            ))}
          </SortableContext>

          {tasks.length === 0 && (
            <div
              className={`rounded-lg border border-dashed py-6 text-center text-xs transition-colors ${
                isOver ? 'border-accent/40 text-accent-text' : 'border-default text-disabled'
              }`}
            >
              Drop here
            </div>
          )}
        </div>
      )}
    </div>
  );
}
