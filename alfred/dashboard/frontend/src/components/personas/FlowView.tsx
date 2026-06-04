// Flow — Phase 1.3 add-on surface (v5 design §5.1).
//
// Pipeline swim-lane diagram: three horizontal lanes (pipeline-v2 / creative /
// team) with stages as nodes and personas as chips inside each stage.
// Click a persona chip to navigate to its detail panel.
//
// Tech: @xyflow/react (already used by GraphView). Custom node type renders
// the stage label + persona chip stack with per-chip click handlers.

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { usePersonaFlow, type FlowStage, type PersonaFlowResponse } from '../../api/personas';

const STAGE_WIDTH = 200;
const STAGE_HEIGHT = 110;
const STAGE_GAP_X = 50;
const ROW_GAP_Y = 60;
const ROW_LABEL_WIDTH = 130;

// Color per pipeline arm (background ribbon under stage row).
const ARM_COLOR: Record<string, { bg: string; border: string; chip: string }> = {
  pipeline_v2: { bg: 'rgba(96, 165, 250, 0.06)', border: '#1e40af', chip: '#60a5fa' },
  creative_pipeline: { bg: 'rgba(167, 139, 250, 0.06)', border: '#6d28d9', chip: '#a78bfa' },
  team_pipeline: { bg: 'rgba(251, 191, 36, 0.06)', border: '#b45309', chip: '#fbbf24' },
};

const ARM_LABELS: Record<string, string> = {
  pipeline_v2: 'Pipeline v2',
  creative_pipeline: 'Creative',
  team_pipeline: 'Team',
};

// Custom node — stage box with title + clickable persona chips.
// `Record<string, unknown>` extension satisfies ReactFlow's Node data constraint.
type StageNodeData = {
  label: string;
  personas: string[];
  arm: keyof typeof ARM_COLOR;
  onPersonaClick: (name: string) => void;
} & Record<string, unknown>;

function StageNode({ data }: NodeProps<Node<StageNodeData>>) {
  const arm = ARM_COLOR[data.arm];
  return (
    <div
      className="rounded border bg-surface-1 px-2 py-1.5 text-xs"
      style={{
        width: STAGE_WIDTH,
        minHeight: STAGE_HEIGHT,
        borderColor: arm.border,
        background: arm.bg,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: arm.chip, width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right} style={{ background: arm.chip, width: 6, height: 6 }} />
      <div className="mb-1.5 text-[11px] font-medium text-secondary">{data.label}</div>
      {data.personas.length === 0 ? (
        <div className="text-[9px] italic text-disabled">no personas attached</div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {data.personas.map((p) => (
            <button
              key={p}
              onClick={(e) => {
                e.stopPropagation();
                data.onPersonaClick(p);
              }}
              className="rounded-full border px-1.5 py-0.5 text-[9px] transition-colors hover:bg-surface-2"
              style={{ borderColor: arm.chip, color: arm.chip }}
              title={`Open ${p} detail panel`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { stage: StageNode };

function buildLayout(
  data: PersonaFlowResponse,
  onPersonaClick: (name: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const arms: Array<{ key: keyof PersonaFlowResponse; stages: FlowStage[] }> = [
    { key: 'pipeline_v2', stages: data.pipeline_v2 },
    { key: 'creative_pipeline', stages: data.creative_pipeline },
    { key: 'team_pipeline', stages: data.team_pipeline },
  ];

  arms.forEach((arm, rowIdx) => {
    const y = 20 + rowIdx * (STAGE_HEIGHT + ROW_GAP_Y);
    arm.stages.forEach((s, colIdx) => {
      const x = ROW_LABEL_WIDTH + colIdx * (STAGE_WIDTH + STAGE_GAP_X);
      nodes.push({
        id: `${arm.key}-${s.id}`,
        type: 'stage',
        position: { x, y },
        data: {
          label: s.label,
          personas: s.personas,
          arm: arm.key as keyof typeof ARM_COLOR,
          onPersonaClick,
        },
        draggable: false,
      });
      if (colIdx > 0) {
        const prev = arm.stages[colIdx - 1];
        edges.push({
          id: `${arm.key}-${prev.id}->${s.id}`,
          source: `${arm.key}-${prev.id}`,
          target: `${arm.key}-${s.id}`,
          style: {
            stroke: ARM_COLOR[arm.key as keyof typeof ARM_COLOR].chip,
            strokeWidth: 1.5,
            opacity: 0.6,
          },
          type: 'default',
        });
      }
    });
  });

  return { nodes, edges };
}

export function FlowView() {
  const { data, isLoading, isError } = usePersonaFlow();
  const navigate = useNavigate();

  const onPersonaClick = (name: string) => navigate(`/personas/${name}`);

  const { nodes, edges, armStats } = useMemo<{
    nodes: Node[];
    edges: Edge[];
    armStats: Array<{ key: string; stages: number; personas: number }>;
  }>(() => {
    if (!data) return { nodes: [], edges: [], armStats: [] };
    const layout = buildLayout(data, onPersonaClick);
    const stats = (['pipeline_v2', 'creative_pipeline', 'team_pipeline'] as const).map((k) => {
      const stages = data[k];
      return {
        key: k,
        stages: stages.length,
        personas: stages.reduce((s, st) => s + st.personas.length, 0),
      };
    });
    return { ...layout, armStats: stats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (isLoading) return <div className="py-12 text-center text-faint">Loading flow…</div>;
  if (isError || !data)
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load /api/v1/persona-flow.
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded border border-default bg-surface-1 px-3 py-2 text-xs">
        {armStats.map((s) => {
          const c = ARM_COLOR[s.key as keyof typeof ARM_COLOR];
          return (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.chip }} />
              <span className="text-tertiary">{ARM_LABELS[s.key]}:</span>
              <span className="text-secondary">{s.stages} stages</span>
              <span className="text-disabled">·</span>
              <span className="text-secondary">{s.personas} personas attached</span>
            </span>
          );
        })}
        <span className="ml-auto text-[10px] italic text-disabled">
          Executor stage populates dynamically from recent decision_events.
        </span>
      </div>

      <div
        className="rounded-lg border border-default bg-surface-1"
        style={{ height: 'calc(100vh - 280px)', minHeight: 520 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.4}
          maxZoom={1.5}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} color="#27272a" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeStrokeWidth={2} maskColor="rgba(15,15,18,0.7)" />
        </ReactFlow>
      </div>

      <p className="text-[10px] text-disabled">
        Three horizontal arms: Pipeline v2 (top), Creative (middle), Team (bottom). Click a persona chip
        inside a stage to open its detail panel.
      </p>
    </div>
  );
}
