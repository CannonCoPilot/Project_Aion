import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { useWorkspaces, useCrossWorkspaceTasks } from '../api/projects';
import { useNavigate } from 'react-router-dom';
import { PriorityBadge } from '../components/tasks/PriorityBadge';

export default function ProjectsPage() {
  const { data: workspaces, isLoading: workspacesLoading } = useWorkspaces();
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState('open,in_progress');
  const { data: taskData, isLoading: tasksLoading } = useCrossWorkspaceTasks(
    selectedWorkspace,
    statusFilter,
  );
  const navigate = useNavigate();

  const tasks = taskData?.tasks ?? [];

  return (
    <div className="space-y-4">
      <Header title="Cross-Workspace Tasks" />

      {/* Workspace summary cards */}
      {workspacesLoading && <div className="text-faint py-4">Loading workspaces...</div>}

      {workspaces && (
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setSelectedWorkspace(undefined)}
            className={`rounded-lg border px-4 py-3 text-left transition-all ${
              !selectedWorkspace
                ? 'border-accent/50 bg-accent/5'
                : 'border-default bg-surface-1 hover:border-subtle'
            }`}
          >
            <div className="text-sm font-semibold text-secondary">All Workspaces</div>
            <div className="text-xs text-faint mt-1">
              {workspaces.reduce((sum, w) => sum + w.openCount, 0)} open
            </div>
          </button>

          {workspaces.map((w) => (
            <button
              key={w.name}
              onClick={() => setSelectedWorkspace(w.name)}
              disabled={!w.available}
              className={`rounded-lg border px-4 py-3 text-left transition-all ${
                selectedWorkspace === w.name
                  ? 'border-accent/50 bg-accent/5'
                  : w.available
                    ? 'border-default bg-surface-1 hover:border-subtle'
                    : 'border-default bg-surface-1 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="text-sm font-semibold text-secondary">{w.name}</div>
              <div className="flex gap-3 text-xs text-faint mt-1">
                <span>{w.openCount} open</span>
                <span>{w.inProgressCount} active</span>
                <span className="text-disabled">{w.taskCount} total</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Status filter */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
        >
          <option value="open,in_progress">Open + In Progress</option>
          <option value="open">Open Only</option>
          <option value="in_progress">In Progress Only</option>
          <option value="closed">Closed</option>
          <option value="">All Statuses</option>
        </select>
        <span className="text-xs text-faint">{tasks.length} tasks</span>
      </div>

      {/* Task list */}
      {tasksLoading && <div className="text-faint py-4">Loading tasks...</div>}

      <div className="rounded-lg border border-default overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-2.5 font-medium">Workspace</th>
              <th className="text-left px-4 py-2.5 font-medium">Priority</th>
              <th className="text-left px-4 py-2.5 font-medium">Title</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-left px-4 py-2.5 font-medium">Assignee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default/50">
            {tasks.map((task) => (
              <tr
                key={`${task._workspace}-${task.id}`}
                onClick={() => navigate(`/tasks/${task.id}`)}
                className="hover:bg-surface-1/50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-300">
                    {task._workspace}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <PriorityBadge level={task.priority} />
                </td>
                <td className="px-4 py-2.5 text-secondary max-w-md truncate">{task.title}</td>
                <td className="px-4 py-2.5 text-muted text-xs">{task.status}</td>
                <td className="px-4 py-2.5 text-faint text-xs">{task.assignee ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
