import { useParams, NavLink, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import {
  usePulseProject,
  usePulseProjectTasks,
  useAdvanceProject,
  useApproveGate,
  type PulseProject,
} from '../api/pulse-projects';
import { PriorityBadge } from '../components/tasks/PriorityBadge';
import type {
  OrchestrationPlan,
  OrchestrationPhase,
  OrchestrationTask,
  DependencyGraph,
} from '../api/orchestrations';
import GanttChart from '../components/gantt/GanttChart';
import OrchestrationGraphView from '../components/orchestration/OrchestrationGraphView';

const STATUS_COLORS: Record<string, string> = {
  open: 'text-blue-400',
  in_progress: 'text-accent-text',
  closed: 'text-green-400',
  deferred: 'text-faint',
};

const PHASE_STATUS: Record<string, string> = {
  pending: 'bg-surface-muted/20 text-muted',
  in_progress: 'bg-accent/20 text-accent-text',
  active: 'bg-accent/20 text-accent-text',
  done: 'bg-green-500/20 text-green-400',
  completed: 'bg-green-500/20 text-green-400',
  paused: 'bg-amber-500/20 text-amber-400',
  archived: 'bg-surface-muted/20 text-faint',
  blocked: 'bg-red-500/20 text-red-400',
};

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-accent'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-sm text-faint w-10 text-right">{progress}%</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- task shape varies by API response
type TaskRecord = Record<string, any>;

/** Adapt Pulse project + tasks data into the OrchestrationPlan/DependencyGraph
 *  shapes expected by GanttChart and OrchestrationGraphView components. */
function buildPlanFromPulse(
  project: PulseProject,
  tasks: TaskRecord[],
  tasksByPhase: Record<string, TaskRecord[]>,
): { plan: OrchestrationPlan; dependencies: DependencyGraph } {
  // Map Pulse task status to orchestration status
  // Map Pulse statuses to orchestration-component statuses
  const mapStatus = (s: string) => {
    switch (s) {
      case 'closed':
        return 'completed';
      case 'open':
        return 'pending';
      case 'active':
        return 'in_progress';
      case 'paused':
        return 'pending';
      case 'archived':
        return 'completed';
      case 'deferred':
        return 'completed';
      default:
        return s;
    }
  };

  const phases: OrchestrationPhase[] = project.phases.map((phase) => {
    const phaseTasks = tasksByPhase[phase.id] || [];
    return {
      id: phase.id,
      title: phase.name,
      status: mapStatus(phase.status),
      depends_on: phase.blocked_by ? [phase.blocked_by] : undefined,
      tasks: phaseTasks.map(
        (t: TaskRecord): OrchestrationTask => ({
          id: t.yaml_task_id || t.id,
          title: t.title,
          status: mapStatus(t.status),
          description: t.description,
          type: t.metadata?.task_type,
          depends_on: t.metadata?.depends_on || [],
          estimated_hours: t.metadata?.estimated_hours,
          // Archon-inspired workflow features (Phase 3+)
          when: t.metadata?.when,
          trigger_rule: t.metadata?.trigger_rule,
          execution_mode: t.metadata?.execution_mode,
          loop_max_iterations: t.metadata?.loop_max_iterations,
          has_output: !!t.metadata?.output,
        }),
      ),
    };
  });

  // Build dependency graph
  const taskDeps: Record<string, string[]> = {};
  const phaseDeps: Record<string, string[]> = {};
  const phaseOrder: string[] = [];

  for (const phase of project.phases) {
    phaseOrder.push(phase.id);
    if (phase.blocked_by) {
      // Resolve blocked_by (could be a phase name or ID)
      const blockerPhase = project.phases.find(
        (p) => p.name === phase.blocked_by || p.id === phase.blocked_by,
      );
      phaseDeps[phase.id] = blockerPhase ? [blockerPhase.id] : [];
    } else {
      phaseDeps[phase.id] = [];
    }
  }

  for (const task of tasks) {
    const taskId = task.yaml_task_id || task.id;
    const deps = task.metadata?.depends_on || [];
    taskDeps[taskId] = deps;
  }

  const plan: OrchestrationPlan = {
    file: project.source_yaml || '',
    filePath: '',
    id: project.id,
    title: project.name,
    status: project.status === 'active' ? 'in_progress' : project.status,
    summary: project.description || undefined,
    phases,
  };

  return { plan, dependencies: { phaseOrder, taskDeps, phaseDeps } };
}

type ViewTab = 'tasks' | 'graph' | 'gantt';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, error } = usePulseProject(id);
  const { data: tasks } = usePulseProjectTasks(id);
  const advanceMutation = useAdvanceProject();
  const approveGateMutation = useApproveGate();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ViewTab>('tasks');

  // Group tasks by phase
  const tasksByPhase = useMemo(() => {
    const grouped: Record<string, TaskRecord[]> = {};
    for (const task of tasks || []) {
      const pid = String(task.phase_id || 'unassigned');
      (grouped[pid] ??= []).push(task);
    }
    return grouped;
  }, [tasks]);

  // Build plan data for graph/gantt (memoized)
  const planData = useMemo(() => {
    if (!project || !tasks) return null;
    return buildPlanFromPulse(project, tasks, tasksByPhase);
  }, [project, tasks, tasksByPhase]);

  if (isLoading) return <p className="text-sm text-faint p-4">Loading project...</p>;
  if (error || !project) return <p className="text-sm text-red-400 p-4">Project not found</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <NavLink to="/projects" className="text-faint hover:text-secondary text-sm">
          &larr; Projects
        </NavLink>
      </div>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-primary">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-faint mt-1 max-w-2xl">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              PHASE_STATUS[project.status] || PHASE_STATUS.pending
            }`}
          >
            {project.status}
          </span>
          <button
            onClick={() => advanceMutation.mutate(project.id)}
            disabled={advanceMutation.isPending}
            className="rounded bg-accent/20 text-accent-text px-3 py-1 text-xs font-medium hover:bg-accent/30 disabled:opacity-50"
          >
            {advanceMutation.isPending ? 'Advancing...' : 'Advance'}
          </button>
        </div>
      </div>

      <ProgressBar progress={project.progress_pct} />

      <div className="flex gap-4 text-xs text-faint mt-2 mb-4">
        <span>
          {project.tasks_done}/{project.task_count} tasks done
        </span>
        <span>{project.phases.length} phases</span>
        {project.owner && <span>Owner: {project.owner}</span>}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 mb-6 border-b border-default">
        {(['tasks', 'graph', 'gantt'] as ViewTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-accent text-accent-text'
                : 'border-transparent text-faint hover:text-secondary'
            }`}
          >
            {tab === 'tasks' ? 'Tasks' : tab === 'graph' ? 'Dependency Graph' : 'Gantt Chart'}
          </button>
        ))}
      </div>

      {/* Tasks view */}
      {activeTab === 'tasks' && (
        <>
          {project.phases.map((phase) => {
            const phaseTasks = tasksByPhase[phase.id] || [];
            const doneTasks = phaseTasks.filter((t: TaskRecord) => t.status === 'closed').length;
            const phasePct =
              phaseTasks.length > 0 ? Math.round((doneTasks / phaseTasks.length) * 100) : 0;

            return (
              <div
                key={phase.id}
                className="mb-6 rounded-lg border border-default bg-surface-1 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-default bg-surface-1/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-secondary">{phase.name}</h2>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        PHASE_STATUS[phase.status] || PHASE_STATUS.pending
                      }`}
                    >
                      {phase.status}
                    </span>
                  </div>
                  <span className="text-xs text-faint">
                    {doneTasks}/{phaseTasks.length} done ({phasePct}%)
                  </span>
                </div>

                {phaseTasks.length > 0 && (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-default/30">
                      {phaseTasks.map((task: TaskRecord) => (
                        <tr
                          key={task.id}
                          onClick={() => navigate(`/tasks/${task.id}`)}
                          className="hover:bg-surface-1/80 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-2 w-16">
                            <span className="text-xs text-faint font-mono">
                              {task.yaml_task_id}
                            </span>
                          </td>
                          <td className="px-4 py-2 w-10">
                            <PriorityBadge level={task.priority} />
                          </td>
                          <td className="px-4 py-2 text-secondary">{task.title}</td>
                          <td className="px-4 py-2 w-24">
                            <span
                              className={`text-xs ${STATUS_COLORS[task.status] || 'text-faint'}`}
                            >
                              {task.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 w-20 text-xs text-faint">
                            {task.assignee || '-'}
                          </td>
                          <td className="px-4 py-2 w-10">
                            {task.metadata?.task_type === 'gate' && task.status === 'open' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  approveGateMutation.mutate({
                                    projectId: project.id,
                                    taskId: task.id,
                                  });
                                }}
                                disabled={approveGateMutation.isPending}
                                className="rounded bg-green-500/20 text-green-400 px-2 py-0.5 text-[10px] font-medium hover:bg-green-500/30 disabled:opacity-50"
                              >
                                {approveGateMutation.isPending ? '...' : 'Approve'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {phaseTasks.length === 0 && (
                  <div className="px-4 py-3 text-xs text-faint">No tasks in this phase</div>
                )}
              </div>
            );
          })}

          {/* Unassigned tasks */}
          {(tasksByPhase['unassigned'] || []).length > 0 && (
            <div className="mb-6 rounded-lg border border-amber-500/30 bg-surface-1 overflow-hidden">
              <div className="px-4 py-3 border-b border-default bg-amber-500/5">
                <h2 className="text-sm font-semibold text-amber-400">
                  Unassigned Tasks ({tasksByPhase['unassigned'].length})
                </h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-default/30">
                  {tasksByPhase['unassigned'].map((task: TaskRecord) => (
                    <tr
                      key={task.id}
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      className="hover:bg-surface-1/80 cursor-pointer"
                    >
                      <td className="px-4 py-2 w-16">
                        <span className="text-xs text-faint font-mono">
                          {task.yaml_task_id || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-secondary">{task.title}</td>
                      <td className="px-4 py-2 w-24">
                        <span className={`text-xs ${STATUS_COLORS[task.status] || 'text-faint'}`}>
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Graph view */}
      {activeTab === 'graph' && planData && (
        <div
          className="rounded-lg border border-default bg-surface-1 overflow-hidden"
          style={{ height: 600 }}
        >
          <OrchestrationGraphView plan={planData.plan} dependencies={planData.dependencies} />
        </div>
      )}

      {/* Gantt chart view */}
      {activeTab === 'gantt' && planData && (
        <div className="rounded-lg border border-default bg-surface-1 overflow-hidden">
          <GanttChart plan={planData.plan} dependencies={planData.dependencies} />
        </div>
      )}

      {/* Approval info */}
      {project.approval && (
        <div className="mt-6 rounded-lg border border-default bg-surface-1 p-4">
          <h2 className="text-xs font-semibold text-faint uppercase tracking-wider mb-2">
            Approval
          </h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-faint">Approved by:</span>{' '}
              <span className="text-secondary">{project.approval.approved_by}</span>
            </div>
            <div>
              <span className="text-faint">Risk override:</span>{' '}
              <span className="text-secondary">{project.approval.risk_override}</span>
            </div>
            {project.approval.scope && (
              <div className="col-span-2">
                <span className="text-faint">Scope:</span>{' '}
                <span className="text-secondary">{project.approval.scope}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
