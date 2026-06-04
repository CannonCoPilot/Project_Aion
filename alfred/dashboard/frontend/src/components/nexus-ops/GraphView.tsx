import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraph, type GraphNode, type GraphEdge } from '../../api/nexus-ops';
import type { Alert } from '../../api/nexus-ops';
import { TaskNode } from './nodes/TaskNode';
import { JobNode } from './nodes/JobNode';
import { PersonaNode } from './nodes/PersonaNode';
import { ProjectNode } from './nodes/ProjectNode';
import { EventNode } from './nodes/EventNode';

const nodeTypes = {
  task: TaskNode,
  job: JobNode,
  persona: PersonaNode,
  project: ProjectNode,
  event: EventNode,
};

interface GraphViewProps {
  from?: string;
  to?: string;
  filters?: { project?: string; job?: string; persona?: string };
  onNodeClick?: (nodeId: string, nodeType: string) => void;
  /** Active unacknowledged alerts — nodes referenced in alert context will glow red */
  activeAlerts?: Alert[];
}

const EDGE_STYLES: Record<
  GraphEdge['type'],
  { stroke: string; strokeDasharray?: string; strokeWidth?: number }
> = {
  triggered: { stroke: '#6b7280' },
  processed_by: { stroke: '#3b82f6', strokeDasharray: '5 5' },
  produced: { stroke: '#22c55e', strokeDasharray: '2 4' },
  approved: { stroke: '#22c55e', strokeWidth: 2.5 },
  escalated: { stroke: '#ef4444', strokeDasharray: '5 5' },
  feedback: { stroke: '#f59e0b', strokeDasharray: '2 4' },
};

const COLUMN_X: Record<string, number> = {
  persona: 0,
  job: 300,
  task: 600,
  project: 900,
  event: 450,
};

const Y_SPACING = 100;

/** Extract node IDs affected by active cascade alerts from their context */
function getCascadeHighlightIds(alerts: Alert[]): Set<string> {
  const ids = new Set<string>();
  for (const alert of alerts) {
    if (alert.acknowledged) continue;
    if (alert.severity !== 'error' && alert.severity !== 'critical') continue;
    const ctx = alert.context;
    // Context fields that may reference graph node IDs
    if (typeof ctx.job === 'string') ids.add(ctx.job);
    if (typeof ctx.persona === 'string') ids.add(ctx.persona);
    if (typeof ctx.task_id === 'string') ids.add(ctx.task_id);
    if (typeof ctx.node_id === 'string') ids.add(ctx.node_id);
  }
  return ids;
}

function layoutNodes(graphNodes: GraphNode[], highlightIds: Set<string>): Node[] {
  // Group nodes by type and assign positions in columns
  const columns: Record<string, GraphNode[]> = {};
  for (const node of graphNodes) {
    const col = node.type;
    if (!columns[col]) columns[col] = [];
    columns[col].push(node);
  }

  const flowNodes: Node[] = [];

  for (const [type, nodes] of Object.entries(columns)) {
    const x = COLUMN_X[type] ?? 450;
    const startY = (-(nodes.length - 1) * Y_SPACING) / 2;

    nodes.forEach((node, i) => {
      const isCascadeAffected = highlightIds.has(node.id);
      flowNodes.push({
        id: node.id,
        type: node.type,
        position: { x, y: startY + i * Y_SPACING },
        data: { ...node, cascadeAlert: isCascadeAffected },
        style: isCascadeAffected
          ? { boxShadow: '0 0 14px 4px rgba(239,68,68,0.7)', borderRadius: 8 }
          : undefined,
      });
    });
  }

  return flowNodes;
}

function layoutEdges(graphEdges: GraphEdge[], runningNodeIds: Set<string>): Edge[] {
  return graphEdges.map((edge) => {
    const style = EDGE_STYLES[edge.type] ?? EDGE_STYLES.triggered;
    const isAnimated =
      edge.animated || runningNodeIds.has(edge.source) || runningNodeIds.has(edge.target);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: isAnimated,
      label: edge.label,
      style: {
        stroke: style.stroke,
        strokeDasharray: style.strokeDasharray,
        strokeWidth: style.strokeWidth ?? 1.5,
      },
      labelStyle: { fill: '#9ca3af', fontSize: 10 },
      labelBgStyle: { fill: '#111827', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
    };
  });
}

export function GraphView({ from, to, filters, onNodeClick, activeAlerts = [] }: GraphViewProps) {
  const { data, isLoading, isError } = useGraph(from, to, filters);

  const runningNodeIds = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.nodes.filter((n) => n.status === 'running').map((n) => n.id));
  }, [data]);

  const cascadeHighlightIds = useMemo(() => getCascadeHighlightIds(activeAlerts), [activeAlerts]);

  const initialNodes = useMemo(
    () => (data ? layoutNodes(data.nodes, cascadeHighlightIds) : []),
    [data, cascadeHighlightIds],
  );
  const initialEdges = useMemo(
    () => (data ? layoutEdges(data.edges, runningNodeIds) : []),
    [data, runningNodeIds],
  );

  const [, , onNodesChange] = useNodesState(initialNodes);
  const [, , onEdgesChange] = useEdgesState(initialEdges);

  // Re-key the ReactFlow component when data changes to force re-init
  const flowKey = useMemo(
    () => (data ? JSON.stringify(data.nodes.map((n) => n.id).sort()) : 'empty'),
    [data],
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const graphData = node.data as unknown as GraphNode;
      onNodeClick?.(node.id, graphData.type);
    },
    [onNodeClick],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px] rounded-lg border border-default bg-surface-1">
        <div className="text-sm text-faint">Loading graph data...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-[600px] rounded-lg border border-red-500/30 bg-red-500/10">
        <div className="text-sm text-red-400">Failed to load graph data</div>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-[600px] rounded-lg border border-default bg-surface-1">
        <div className="text-sm text-faint">No graph data for the selected time range</div>
      </div>
    );
  }

  return (
    <div className="h-[600px] rounded-lg border border-default bg-surface-base">
      <ReactFlow
        key={flowKey}
        nodes={initialNodes}
        edges={initialEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
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
            const d = node.data as unknown as GraphNode;
            if (d.status === 'running') return '#3b82f6';
            if (d.status === 'completed') return '#22c55e';
            if (d.status === 'failed') return '#ef4444';
            if (d.status === 'waiting') return '#f59e0b';
            return '#4b5563';
          }}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  );
}
