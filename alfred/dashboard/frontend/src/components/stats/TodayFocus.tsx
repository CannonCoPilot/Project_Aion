import { Link } from 'react-router-dom';
import { useTaskList, useStats } from '../../api/tasks';
import { useCompany } from '../../hooks/useCompany';
import { PriorityBadge } from '../tasks/PriorityBadge';
import { StatusBadge } from '../tasks/StatusBadge';

export function TodayFocus() {
  const { company, isFiltered } = useCompany();
  const companyFilter = isFiltered ? company : undefined;
  const { data: stats } = useStats(companyFilter);
  const { data: myTasks } = useTaskList({
    status: 'in_progress',
    assignee: 'david',
    company: companyFilter,
  });
  const { data: readyTasks } = useTaskList({
    ready: 'true',
    sort: 'priority',
    order: 'asc',
    company: companyFilter,
  });

  const inProgress = myTasks ?? [];
  const topReady = (readyTasks ?? []).slice(0, 3);
  const readyCount = stats?.ready ?? 0;

  return (
    <div className="rounded-xl border border-default bg-surface-1 overflow-hidden">
      <div className="p-4 border-b border-default">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wider">Today's Focus</h3>
      </div>

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-default">
        {/* In Progress */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs text-faint uppercase tracking-wider">Your Active Work</h4>
            <span className="text-xs text-accent-text font-medium">
              {inProgress.length} in progress
            </span>
          </div>
          {inProgress.length === 0 ? (
            <p className="text-sm text-disabled italic">
              Nothing claimed yet. Start from Ready or Triage.
            </p>
          ) : (
            <div className="space-y-2">
              {inProgress.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-surface-2 active:bg-surface-2 transition-colors group"
                >
                  <PriorityBadge level={task.priority} />
                  <span className="text-sm text-secondary truncate flex-1 group-hover:text-white group-active:text-white">
                    {task.title}
                  </span>
                  <span className="text-xs text-disabled font-mono flex-shrink-0">{task.id}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Up Next */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs text-faint uppercase tracking-wider">Up Next</h4>
            <Link to="/ready" className="text-xs text-amber-400 font-medium hover:text-amber-300">
              {readyCount} ready
            </Link>
          </div>
          {topReady.length === 0 ? (
            <p className="text-sm text-disabled italic">No ready tasks.</p>
          ) : (
            <div className="space-y-2">
              {topReady.map((task) => (
                <Link
                  key={task.id}
                  to={`/tasks/${task.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2.5 hover:bg-surface-2 active:bg-surface-2 transition-colors group"
                >
                  <PriorityBadge level={task.priority} />
                  <span className="text-sm text-secondary truncate flex-1 group-hover:text-white group-active:text-white">
                    {task.title}
                  </span>
                  <StatusBadge status={task.status} />
                </Link>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Link
              to="/triage"
              className="rounded bg-accent-hover/20 px-3 py-2.5 text-xs font-medium text-accent-text hover:bg-accent-hover/30 active:bg-accent-hover/30 transition-colors"
            >
              Start Triage
            </Link>
            <Link
              to="/ready"
              className="rounded bg-surface-2 px-3 py-2.5 text-xs font-medium text-muted hover:bg-surface-3 active:bg-surface-3 transition-colors"
            >
              View All Ready
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
