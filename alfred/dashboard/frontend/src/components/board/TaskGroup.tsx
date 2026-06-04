import { useState, useEffect, useRef } from 'react';
import type { Task } from '../../api/tasks';
import { KanbanCard } from './KanbanCard';

export type GroupColorScheme = 'purple' | 'blue' | 'teal';

const COLOR_MAP: Record<
  GroupColorScheme,
  {
    border: string;
    borderInner: string;
    bg: string;
    hoverBg: string;
    text: string;
    textMuted: string;
  }
> = {
  purple: {
    border: 'border-purple-500/30',
    borderInner: 'border-purple-500/15',
    bg: 'bg-purple-500/5',
    hoverBg: 'hover:bg-purple-500/10',
    text: 'text-purple-300',
    textMuted: 'text-purple-400/60',
  },
  blue: {
    border: 'border-accent/30',
    borderInner: 'border-accent/15',
    bg: 'bg-accent/5',
    hoverBg: 'hover:bg-accent/10',
    text: 'text-accent-text-light',
    textMuted: 'text-accent-text/60',
  },
  teal: {
    border: 'border-teal-500/30',
    borderInner: 'border-teal-500/15',
    bg: 'bg-teal-500/5',
    hoverBg: 'hover:bg-teal-500/10',
    text: 'text-teal-300',
    textMuted: 'text-teal-400/60',
  },
};

interface TaskGroupProps {
  groupName: string;
  tasks: Task[];
  colorScheme?: GroupColorScheme;
  hideLabel?: 'project' | 'domain';
  glowingIds?: Set<string>;
  defaultCollapsed?: boolean;
}

export function TaskGroup({ groupName, tasks, colorScheme = 'purple', hideLabel, glowingIds, defaultCollapsed = false }: TaskGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const prevDefault = useRef(defaultCollapsed);

  useEffect(() => {
    if (defaultCollapsed !== prevDefault.current) {
      prevDefault.current = defaultCollapsed;
      if (defaultCollapsed) {
        // Recent-close window expired — auto-collapse back
        setCollapsed(true);
      } else {
        // New close detected — auto-expand
        setCollapsed(false);
      }
    }
  }, [defaultCollapsed]);
  const c = COLOR_MAP[colorScheme];

  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} overflow-hidden`}>
      {/* Double-border effect via inner wrapper */}
      <div className={`m-[2px] rounded-md border ${c.borderInner}`}>
        {/* Group header */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-2 w-full px-2.5 py-1.5 text-left ${c.hoverBg} transition-colors`}
        >
          <span className={`text-[10px] ${c.textMuted}`}>{collapsed ? '\u25B6' : '\u25BC'}</span>
          <span className={`text-[11px] font-semibold ${c.text} truncate`}>{groupName}</span>
          <span className={`ml-auto text-[10px] ${c.textMuted} tabular-nums shrink-0`}>
            {tasks.length}
          </span>
        </button>

        {/* Cards */}
        {!collapsed && (
          <div className="px-1 pb-1">
            <div className="space-y-1.5">
              {tasks.map((task) => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  hideProject={hideLabel === 'project'}
                  hideDomain={hideLabel === 'domain'}
                  isGlowing={glowingIds?.has(task.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
