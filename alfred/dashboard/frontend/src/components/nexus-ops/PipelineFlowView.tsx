import { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  usePipelineDAG,
  type PipelineDAGTask,
  type StageAggregate,
  type PipelineFlowEdge,
} from '../../api/nexus-ops';
import { StageHeaderNode } from './nodes/StageHeaderNode';
import { PipelineTaskNode } from './nodes/PipelineTaskNode';
import type { StageHeaderData } from './nodes/StageHeaderNode';
import type { PipelineTaskData } from './nodes/PipelineTaskNode';

const nodeTypes = {
  stageHeader: StageHeaderNode,
  pipelineTask: PipelineTaskNode,
};

const STAGES = [
  { id: 'intake', label: 'Intake', x: 0 },
  { id: 'evaluate', label: 'Evaluate', x: 280 },
  { id: 'route', label: 'Route', x: 560 },
  { id: 'review', label: 'Review', x: 840 },
  { id: 'queue', label: 'Queue', x: 1120 },
  { id: 'execute', label: 'Execute', x: 1400 },
  { id: 'closed', label: 'Closed', x: 1680 },
] as const;

const HEADER_Y = 0;
const TASK_START_Y = 100;
const TASK_Y_SPACING = 65;

const MINIMAP_COLORS: Record<string, string> = {
  open: '#f59e0b',
  in_progress: '#3b82f6',
  closed: '#22c55e',
  deferred: '#4b5563',
};

interface PipelineFlowViewProps {
  onNodeClick?: (nodeId: string, nodeType: string) => void;
}

function buildNodes(
  tasks: PipelineDAGTask[],
  aggregates: StageAggregate[],
  bottleneckStage: string | null,
  focusedTaskId: string | null,
  stageFilter: string | null,
): Node[] {
  const nodes: Node[] = [];
  const aggMap = new Map(aggregates.map((a) => [a.stage, a]));

  // Stage header nodes
  for (const stage of STAGES) {
    const agg = aggMap.get(stage.id);
    const closedCount =
      stage.id === 'closed' ? tasks.filter((t) => t.currentStage === 'closed').length : undefined;

    if (stageFilter && stageFilter !== stage.id) continue;

    nodes.push({
      id: `stage:${stage.id}`,
      type: 'stageHeader',
      position: { x: stage.x, y: HEADER_Y },
      draggable: false,
      selectable: false,
      data: {
        label: stage.label,
        count: closedCount ?? agg?.count ?? 0,
        avgDurationSecs: agg?.avgDurationSecs ?? 0,
        throughputPerDay: agg?.throughputPerDay ?? 0,
        isBottleneck: stage.id === bottleneckStage,
      } satisfies StageHeaderData,
    });
  }

  // Task nodes grouped by stage
  const tasksByStage = new Map<string, PipelineDAGTask[]>();
  for (const task of tasks) {
    if (!task.currentStage) continue;
    if (stageFilter && task.currentStage !== stageFilter) continue;
    const list = tasksByStage.get(task.currentStage) ?? [];
    list.push(task);
    tasksByStage.set(task.currentStage, list);
  }

  for (const stage of STAGES) {
    const stageTasks = tasksByStage.get(stage.id) ?? [];
    // Sort by priority (P0 first), then oldest first
    stageTasks.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const aTime = a.stageEnteredAt ? new Date(a.stageEnteredAt).getTime() : 0;
      const bTime = b.stageEnteredAt ? new Date(b.stageEnteredAt).getTime() : 0;
      return aTime - bTime;
    });

    const stageX = stage.x;
    stageTasks.forEach((task, i) => {
      nodes.push({
        id: `task:${task.id}`,
        type: 'pipelineTask',
        position: { x: stageX, y: TASK_START_Y + i * TASK_Y_SPACING },
        data: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          stageEnteredAt: task.stageEnteredAt,
          labels: task.labels,
          decision: task.decision,
          dimmed: focusedTaskId !== null && focusedTaskId !== task.id,
          focused: focusedTaskId === task.id,
        } satisfies PipelineTaskData,
      });
    });
  }

  return nodes;
}

function buildEdges(
  flowEdges: PipelineFlowEdge[],
  tasks: PipelineDAGTask[],
  focusedTaskId: string | null,
): Edge[] {
  const edges: Edge[] = [];

  if (focusedTaskId) {
    // Focus mode: show the focused task's transition path
    const task = tasks.find((t) => t.id === focusedTaskId);
    if (task) {
      task.transitions.forEach((t, i) => {
        const isLoop =
          STAGES.findIndex((s) => s.id === t.from) > STAGES.findIndex((s) => s.id === t.to);
        edges.push({
          id: `focus-${i}`,
          source: `stage:${t.from}`,
          target: `stage:${t.to}`,
          type: 'default',
          animated: true,
          label: t.outcome ?? '',
          style: {
            stroke: isLoop ? '#f59e0b' : '#3b82f6',
            strokeWidth: 2,
            strokeDasharray: isLoop ? '5 5' : undefined,
          },
          labelStyle: { fontSize: 10, fill: '#9ca3af' },
          labelBgStyle: { fill: '#1a1a2e', fillOpacity: 0.8 },
          labelBgPadding: [4, 2] as [number, number],
        });
      });
    }
  } else {
    // Overview mode: aggregate flow edges between stage headers
    const maxCount = Math.max(1, ...flowEdges.map((e) => e.count));

    for (const flow of flowEdges) {
      const fromIdx = STAGES.findIndex((s) => s.id === flow.from);
      const toIdx = STAGES.findIndex((s) => s.id === flow.to);
      if (fromIdx < 0 || toIdx < 0) continue;

      const isLoop = fromIdx > toIdx;
      const width = 1 + (flow.count / maxCount) * 3;

      edges.push({
        id: `flow-${flow.from}-${flow.to}`,
        source: `stage:${flow.from}`,
        target: `stage:${flow.to}`,
        type: 'default',
        animated: flow.count > 0,
        label: `${flow.count}`,
        style: {
          stroke: isLoop ? '#f59e0b' : '#4b5563',
          strokeWidth: width,
          strokeDasharray: isLoop ? '5 5' : undefined,
        },
        labelStyle: { fontSize: 10, fill: '#9ca3af' },
        labelBgStyle: { fill: '#1a1a2e', fillOpacity: 0.8 },
        labelBgPadding: [4, 2] as [number, number],
      });
    }
  }

  return edges;
}

export function PipelineFlowView({ onNodeClick }: PipelineFlowViewProps) {
  const { data, isLoading } = usePipelineDAG();
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const bottleneckStage = useMemo(() => {
    if (!data) return null;
    const nonExecute = data.stageAggregates.filter(
      (s) => s.stage !== 'execute' && s.completedTransitions > 0,
    );
    if (nonExecute.length === 0) return null;
    return nonExecute.reduce((max, s) => (s.avgDurationSecs > max.avgDurationSecs ? s : max)).stage;
  }, [data]);

  const nodes = useMemo(() => {
    if (!data) return [];
    return buildNodes(
      data.tasks,
      data.stageAggregates,
      bottleneckStage,
      focusedTaskId,
      stageFilter,
    );
  }, [data, bottleneckStage, focusedTaskId, stageFilter]);

  const edges = useMemo(() => {
    if (!data) return [];
    return buildEdges(data.flowEdges, data.tasks, focusedTaskId);
  }, [data, focusedTaskId]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (node.type === 'pipelineTask') {
        const taskId = node.id.replace('task:', '');
        if (focusedTaskId === taskId) {
          // Click again to unfocus
          setFocusedTaskId(null);
        } else {
          setFocusedTaskId(taskId);
          onNodeClick?.(taskId, 'task');
        }
      } else if (node.type === 'stageHeader') {
        const stageId = node.id.replace('stage:', '');
        setStageFilter((prev) => (prev === stageId ? null : stageId));
      }
    },
    [focusedTaskId, onNodeClick],
  );

  const handlePaneClick = useCallback(() => {
    if (focusedTaskId) setFocusedTaskId(null);
  }, [focusedTaskId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setFocusedTaskId(null);
      setStageFilter(null);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] rounded-lg border border-default bg-surface-1">
        <div className="text-sm text-faint">Loading pipeline data...</div>
      </div>
    );
  }

  return (
    <div
      className="h-[600px] rounded-lg border border-default bg-surface-base relative"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {focusedTaskId && (
        <div className="absolute top-2 left-2 z-10 bg-surface-2/90 border border-border/40 rounded px-3 py-1.5 text-xs text-secondary">
          <span className="text-faint">Focused:</span>{' '}
          <span className="font-medium">
            {data?.tasks.find((t) => t.id === focusedTaskId)?.title ?? focusedTaskId}
          </span>
          <button
            onClick={() => setFocusedTaskId(null)}
            className="ml-2 text-faint hover:text-primary"
          >
            ESC
          </button>
        </div>
      )}

      <ReactFlow
        key={JSON.stringify(nodes.map((n) => n.id).sort())}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Controls position="bottom-left" />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            if (node.type === 'stageHeader') return '#1e293b';
            const status = (node.data as unknown as PipelineTaskData)?.status;
            return MINIMAP_COLORS[status] ?? '#4b5563';
          }}
          maskColor="rgba(0,0,0,0.7)"
          style={{ background: '#0f0f23' }}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
      </ReactFlow>
    </div>
  );
}
