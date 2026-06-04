import { useMemo } from 'react';
import type { NexusOpsEvent, TaskStatusInfo } from '../../api/nexus-ops';

export type EntityType = 'task' | 'job';

export interface EntityEntry {
  id: string;
  type: EntityType;
  label: string;
  eventCount: number;
  lastEvent: string; // timestamp
  cost?: number;
  status?: string;
  statusLabel?: string;
}

interface EntitySidebarProps {
  events: NexusOpsEvent[];
  taskStatuses: Record<string, TaskStatusInfo>;
  selectedId: string | null;
  selectedType: EntityType | null;
  onSelect: (id: string, type: EntityType) => void;
}

const STATUS_DOTS: Record<string, string> = {
  completed: 'bg-green-500',
  success: 'bg-green-500',
  failed: 'bg-red-500',
  running: 'bg-accent animate-pulse',
  waiting: 'bg-amber-500',
  needs_input: 'bg-amber-500 animate-pulse',
  open: 'bg-emerald-500',
  in_progress: 'bg-accent',
  closed: 'bg-surface-muted',
  deferred: 'bg-surface-muted',
};

/** Map real Pulse task status + labels to a display status */
function resolveTaskStatus(info: TaskStatusInfo | undefined): { status: string; label: string } {
  if (!info) return { status: 'open', label: 'open' };
  if (info.status === 'closed') return { status: 'closed', label: 'closed' };
  if (info.status === 'in_progress') return { status: 'in_progress', label: 'in progress' };
  if (info.labels.includes('waiting:david')) return { status: 'needs_input', label: 'needs input' };
  if (info.labels.some((l) => l.startsWith('waiting:')))
    return { status: 'waiting', label: 'waiting' };
  return { status: 'open', label: 'open' };
}

export function EntitySidebar({
  events,
  taskStatuses,
  selectedId,
  selectedType,
  onSelect,
}: EntitySidebarProps) {
  const { tasks, jobs } = useMemo(() => {
    const taskMap = new Map<string, EntityEntry>();
    const jobMap = new Map<string, EntityEntry>();

    for (const e of events) {
      if (e.task_id) {
        const existing = taskMap.get(e.task_id);
        if (existing) {
          existing.eventCount++;
          if (e.timestamp > existing.lastEvent) existing.lastEvent = e.timestamp;
          if (e.cost) existing.cost = (existing.cost ?? 0) + e.cost;
        } else {
          const resolved = resolveTaskStatus(taskStatuses[e.task_id]);
          taskMap.set(e.task_id, {
            id: e.task_id,
            type: 'task',
            label: taskStatuses[e.task_id]?.title || e.task_id,
            eventCount: 1,
            lastEvent: e.timestamp,
            cost: e.cost,
            status: resolved.status,
            statusLabel: resolved.label,
          });
        }
      }

      if (e.job) {
        const existing = jobMap.get(e.job);
        if (existing) {
          existing.eventCount++;
          if (e.timestamp > existing.lastEvent) existing.lastEvent = e.timestamp;
          if (e.cost) existing.cost = (existing.cost ?? 0) + e.cost;
          if (e.type === 'execution_success') existing.status = 'completed';
          else if (e.type === 'execution_failure') existing.status = 'failed';
          else if (e.type === 'job_started') existing.status = 'running';
        } else {
          jobMap.set(e.job, {
            id: e.job,
            type: 'job',
            label: e.job,
            eventCount: 1,
            lastEvent: e.timestamp,
            cost: e.cost,
            status:
              e.type === 'execution_success'
                ? 'completed'
                : e.type === 'execution_failure'
                  ? 'failed'
                  : e.type === 'job_started'
                    ? 'running'
                    : undefined,
          });
        }
      }
    }

    // Sort by most recent activity
    const tasks = [...taskMap.values()].sort((a, b) => b.lastEvent.localeCompare(a.lastEvent));
    const jobs = [...jobMap.values()].sort((a, b) => b.lastEvent.localeCompare(a.lastEvent));
    return { tasks, jobs };
  }, [events, taskStatuses]);

  const isSelected = (entry: EntityEntry) => selectedId === entry.id && selectedType === entry.type;

  return (
    <div className="hidden sm:block w-48 lg:w-64 flex-shrink-0 border-r border-default overflow-y-auto">
      {/* Jobs section */}
      {jobs.length > 0 && (
        <div>
          <div className="px-3 py-2 text-[10px] text-faint uppercase tracking-wider font-medium sticky top-0 bg-surface-base z-10">
            Jobs ({jobs.length})
          </div>
          {jobs.map((entry) => (
            <button
              key={`job:${entry.id}`}
              onClick={() => onSelect(entry.id, 'job')}
              className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${
                isSelected(entry)
                  ? 'bg-purple-500/10 border-l-purple-500 text-primary'
                  : 'border-l-transparent text-muted hover:bg-surface-1 hover:text-secondary'
              }`}
            >
              <div className="flex items-center gap-2">
                {entry.status && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOTS[entry.status] ?? 'bg-surface-muted'}`}
                  />
                )}
                <span className="truncate font-mono text-xs">{entry.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 ml-3.5">
                <span className="text-[10px] text-disabled">{entry.eventCount} events</span>
                {entry.cost != null && entry.cost > 0 && (
                  <span className="text-[10px] text-green-500/70">${entry.cost.toFixed(2)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Tasks section */}
      {tasks.length > 0 && (
        <div>
          <div className="px-3 py-2 text-[10px] text-faint uppercase tracking-wider font-medium sticky top-0 bg-surface-base z-10">
            Tasks ({tasks.length})
          </div>
          {tasks.map((entry) => (
            <button
              key={`task:${entry.id}`}
              onClick={() => onSelect(entry.id, 'task')}
              className={`w-full text-left px-3 py-2 text-sm transition-colors border-l-2 ${
                isSelected(entry)
                  ? 'bg-accent/10 border-l-accent text-primary'
                  : 'border-l-transparent text-muted hover:bg-surface-1 hover:text-secondary'
              }`}
            >
              <div className="flex items-center gap-2">
                {entry.status && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOTS[entry.status] ?? 'bg-surface-muted'}`}
                  />
                )}
                <span className="truncate text-xs leading-tight">{entry.label}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 ml-3.5">
                <span className="text-[10px] font-mono text-disabled">{entry.id}</span>
                {entry.statusLabel && (
                  <span
                    className={`text-[10px] ${
                      entry.status === 'needs_input' ? 'text-amber-400' : 'text-disabled'
                    }`}
                  >
                    {entry.statusLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 ml-3.5">
                <span className="text-[10px] text-disabled">{entry.eventCount} events</span>
                {entry.cost != null && entry.cost > 0 && (
                  <span className="text-[10px] text-green-500/70">${entry.cost.toFixed(2)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {tasks.length === 0 && jobs.length === 0 && (
        <div className="px-3 py-8 text-center text-xs text-disabled">
          No entities in selected time range
        </div>
      )}
    </div>
  );
}
