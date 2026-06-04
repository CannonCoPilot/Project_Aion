import { useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { OrchestrationTaskNode } from './nodes/OrchestrationTaskNode';
import type {
  OrchestrationPlan,
  OrchestrationPhase,
  DependencyGraph,
} from '../../api/orchestrations';

const nodeTypes = {
  orchestrationTask: OrchestrationTaskNode,
};

interface OrchestrationGraphViewProps {
  plan: OrchestrationPlan;
  dependencies: DependencyGraph;
}

const X_SPACING = 280;
const Y_SPACING = 90;
const PHASE_PADDING = 40;

const EDGE_COLORS: Record<string, string> = {
  completed: '#22c55e',
  in_progress: '#3b82f6',
  running: '#3b82f6',
  blocked: '#f59e0b',
  pending: '#4b5563',
};

/** Compute rank for each task via longest-path from roots */
function computeRanks(
  phases: OrchestrationPhase[],
  taskDeps: Record<string, string[]>,
  phaseDeps: Record<string, string[]>,
): Map<string, number> {
  const ranks = new Map<string, number>();
  const taskToPhase = new Map<string, string>();
  const phaseRanks = new Map<string, number>();

  // Compute phase ranks first
  const phaseIds = phases.map(p => p.id);
  function getPhaseRank(phaseId: string, visited: Set<string>): number {
    if (phaseRanks.has(phaseId)) return phaseRanks.get(phaseId)!;
    if (visited.has(phaseId)) return 0;
    visited.add(phaseId);
    const deps = phaseDeps[phaseId] || [];
    const rank = deps.length === 0 ? 0 : Math.max(...deps.map(d => getPhaseRank(d, visited) + 1));
    phaseRanks.set(phaseId, rank);
    return rank;
  }
  for (const pid of phaseIds) {
    getPhaseRank(pid, new Set());
  }

  // Map tasks to phases
  for (const phase of phases) {
    for (const task of phase.tasks) {
      taskToPhase.set(task.id, phase.id);
    }
  }

  // Compute task ranks within phase context
  function getTaskRank(taskId: string, visited: Set<string>): number {
    if (ranks.has(taskId)) return ranks.get(taskId)!;
    if (visited.has(taskId)) return 0;
    visited.add(taskId);
    const deps = taskDeps[taskId] || [];
    const phaseId = taskToPhase.get(taskId) || '';
    const phaseBase = (phaseRanks.get(phaseId) || 0) * 4; // space phases apart

    if (deps.length === 0) {
      const rank = phaseBase;
      ranks.set(taskId, rank);
      return rank;
    }
    const rank = Math.max(...deps.map(d => getTaskRank(d, visited) + 1), phaseBase);
    ranks.set(taskId, rank);
    return rank;
  }

  for (const phase of phases) {
    for (const task of phase.tasks) {
      getTaskRank(task.id, new Set());
    }
  }

  return ranks;
}

// Build a lookup of task metadata by ID
interface TaskMeta {
  when?: string;
  triggerRule?: string;
  executionMode?: string;
  loopMaxIterations?: number;
  hasRetry?: boolean;
  hasOutput?: boolean;
}

function buildTaskMetaMap(plan: OrchestrationPlan): Map<string, TaskMeta> {
  const map = new Map<string, TaskMeta>();
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      map.set(task.id, {
        when: task.when,
        triggerRule: task.trigger_rule,
        executionMode: task.execution_mode,
        loopMaxIterations: task.loop_max_iterations,
        hasOutput: task.has_output,
      });
    }
  }
  return map;
}

function buildNodes(
  plan: OrchestrationPlan,
  dependencies: DependencyGraph,
): Node[] {
  const ranks = computeRanks(plan.phases, dependencies.taskDeps, dependencies.phaseDeps);
  const metaMap = buildTaskMetaMap(plan);

  // Group tasks by rank
  const byRank = new Map<number, Array<{
    taskId: string; label: string; status: string; phase: string;
    type?: string; dependsOn?: string[]; meta: TaskMeta;
  }>>();

  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      const rank = ranks.get(task.id) || 0;
      if (!byRank.has(rank)) byRank.set(rank, []);
      byRank.get(rank)!.push({
        taskId: task.id,
        label: task.title,
        status: task.status,
        phase: phase.id,
        type: task.type,
        dependsOn: task.depends_on,
        meta: metaMap.get(task.id) || {},
      });
    }
  }

  const nodes: Node[] = [];
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);

  for (const rank of sortedRanks) {
    const items = byRank.get(rank)!;
    const colX = rank * X_SPACING + PHASE_PADDING;
    const startY = -(items.length - 1) * Y_SPACING / 2;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      nodes.push({
        id: item.taskId,
        type: 'orchestrationTask',
        position: { x: colX, y: startY + i * Y_SPACING },
        data: {
          label: item.label,
          taskId: item.taskId,
          status: item.status,
          phase: item.phase,
          type: item.type,
          dependsOn: item.dependsOn,
          when: item.meta.when,
          triggerRule: item.meta.triggerRule,
          executionMode: item.meta.executionMode,
          loopMaxIterations: item.meta.loopMaxIterations,
          hasRetry: item.meta.hasRetry,
          hasOutput: item.meta.hasOutput,
        },
      });
    }
  }

  return nodes;
}

function buildEdges(
  plan: OrchestrationPlan,
  dependencies: DependencyGraph,
): Edge[] {
  const edges: Edge[] = [];
  const taskStatusMap = new Map<string, string>();
  const metaMap = buildTaskMetaMap(plan);

  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      taskStatusMap.set(task.id, task.status);
    }
  }

  // Task-level dependency edges
  for (const [taskId, deps] of Object.entries(dependencies.taskDeps)) {
    const targetMeta = metaMap.get(taskId);
    const hasCondition = !!targetMeta?.when;

    for (const dep of deps) {
      const targetStatus = taskStatusMap.get(taskId) || 'pending';
      const sourceStatus = taskStatusMap.get(dep) || 'pending';
      const color = EDGE_COLORS[targetStatus] || EDGE_COLORS.pending;
      const isAnimated = sourceStatus === 'in_progress' || sourceStatus === 'running' ||
                         targetStatus === 'in_progress' || targetStatus === 'running';

      edges.push({
        id: `${dep}->${taskId}`,
        source: dep,
        target: taskId,
        animated: isAnimated,
        style: {
          stroke: hasCondition ? '#a855f7' : color,  // Purple for conditional edges
          strokeWidth: hasCondition ? 2 : 1.5,
          strokeDasharray: hasCondition ? '6 3' : undefined,  // Dashed for conditional
        },
        ...(hasCondition ? { label: '⊃', labelStyle: { fontSize: 10, fill: '#a855f7' } } : {}),
      });
    }
  }

  // Output flow edges — thin dotted lines showing data flow between tasks with outputs
  // and tasks that reference them in `when` expressions
  const validNodeIds = new Set(taskStatusMap.keys());
  for (const phase of plan.phases) {
    for (const task of phase.tasks) {
      if (!task.when) continue;
      // Extract referenced task IDs from the when expression ($T1.1.output → T1.1)
      const refs = [...task.when.matchAll(/\$([A-Za-z0-9_.\-]+)\.output/g)].map(m => m[1]);
      for (const ref of refs) {
        // Skip if referenced task doesn't exist as a node (avoids dangling edges)
        if (!validNodeIds.has(ref)) continue;
        // Only add output flow edge if it's not already a dependency edge
        const existingDeps = dependencies.taskDeps[task.id] || [];
        if (!existingDeps.includes(ref)) {
          edges.push({
            id: `output:${ref}->${task.id}`,
            source: ref,
            target: task.id,
            style: {
              stroke: '#22c55e',
              strokeWidth: 1,
              strokeDasharray: '2 4',
              opacity: 0.5,
            },
          });
        }
      }
    }
  }

  return edges;
}

export default function OrchestrationGraphView({ plan, dependencies }: OrchestrationGraphViewProps) {
  const nodes = useMemo(() => buildNodes(plan, dependencies), [plan, dependencies]);
  const edges = useMemo(() => buildEdges(plan, dependencies), [plan, dependencies]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <p className="text-sm text-faint">No tasks to display</p>
      </div>
    );
  }

  return (
    <div className="h-[500px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1f2937" />
        <Controls
          position="bottom-left"
          className="!bg-surface-1 !border-subtle !rounded-lg [&>button]:!bg-surface-2 [&>button]:!border-subtle [&>button]:!text-muted [&>button:hover]:!bg-surface-3"
        />
        <MiniMap
          position="bottom-right"
          className="!bg-surface-1 !border-subtle !rounded-lg"
          nodeColor={(node) => {
            const status = (node.data as Record<string, unknown>)?.status as string;
            if (status === 'running' || status === 'in_progress') return '#3b82f6';
            if (status === 'completed') return '#22c55e';
            if (status === 'failed') return '#ef4444';
            if (status === 'blocked') return '#f59e0b';
            return '#4b5563';
          }}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
