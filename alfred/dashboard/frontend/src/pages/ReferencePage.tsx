import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { useLiveLabels, useBlockedReasons } from '../api/tasks';

// --- Copy / Print utilities ---

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback for non-HTTPS contexts
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

function mdTable(headers: string[], rows: string[][]) {
  const sep = headers.map(() => '---');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function DownloadButton({
  getText,
  filename,
  label = 'Download',
}: {
  getText: () => string;
  filename: string;
  label?: string;
}) {
  const handleDownload = () => {
    const blob = new Blob([getText()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={handleDownload}
      className="shrink-0 text-[10px] px-2 py-1 rounded border border-default text-faint hover:text-secondary hover:bg-surface-2 transition-colors"
      title={`Download as ${filename}`}
    >
      {label}
    </button>
  );
}

function CopyButton({ getText, label = 'Copy' }: { getText: () => string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 text-[10px] px-2 py-1 rounded border border-default text-faint hover:text-secondary hover:bg-surface-2 transition-colors"
      title={`Copy as Markdown`}
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function CardHeader({
  title,
  subtitle,
  getText,
  borderColor,
}: {
  title: string;
  subtitle?: string;
  getText: () => string;
  borderColor?: string;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className={`text-sm font-semibold ${borderColor ?? 'text-secondary'}`}>
        {title}
        {subtitle && <span className="text-xs font-normal text-faint ml-2">{subtitle}</span>}
      </h2>
      <CopyButton getText={getText} label="Copy" />
    </div>
  );
}

// Process diagram node and edge definitions
type FlowNode = {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  color: string;
  w: number;
  isProcess?: boolean;
};

// Unified color palette — same meaning across ALL diagrams on this page
//
// BOARD COLUMN COLORS (states):
//   Gray (#9ca3af)     = Backlog
//   Purple (#a78bfa)   = Ready
//   Blue (#38bdf8)     = In Progress
//   Green (#34d399)    = Done
//   Red (#f87171)      = Blocked
//   Dark gray (#6b7280)= Deferred
//   Stone (#78716c)    = Archived
//
// ROLE COLORS:
//   Cyan (#06b6d4)     = Sources / entry points
//   Amber (#f59e0b)    = Human gates (requires David)
//   Indigo (#818cf8)   = Automated process / engine
//
// ARROW COLORS:
//   Green (#34d399)    = Automated transition (Nexus)
//   Amber (#f59e0b)    = Human action
//   Blue (#60a5fa)     = Either / context-dependent

const FLOW_NODES: FlowNode[] = [
  // Row 0 (y=20): Entry points — where tasks come from
  {
    id: 'session',
    label: 'Claude Code',
    sublabel: 'Interactive session',
    x: 15,
    y: 20,
    color: '#06b6d4',
    w: 120,
  },
  {
    id: 'headless',
    label: 'Nexus Jobs',
    sublabel: 'Health, ABS, Aurora...',
    x: 155,
    y: 20,
    color: '#06b6d4',
    w: 120,
  },
  {
    id: 'claude-app',
    label: 'Claude App',
    sublabel: 'Web / mobile',
    x: 295,
    y: 20,
    color: '#06b6d4',
    w: 120,
  },
  {
    id: 'manual',
    label: 'Manual / CLI',
    sublabel: 'pulse create',
    x: 435,
    y: 20,
    color: '#06b6d4',
    w: 120,
  },

  // Row 1 (y=95): Evaluation
  {
    id: 'evaluate',
    label: 'Task Evaluator',
    sublabel: 'stage:intake → stage:route',
    x: 185,
    y: 95,
    color: '#818cf8',
    w: 200,
    isProcess: true,
  },

  // Row 2 (y=175): Routing outcomes — three lanes
  {
    id: 'safe-auto',
    label: 'Direct to Queue',
    sublabel: 'stage:queue (fast-track)',
    x: 15,
    y: 175,
    color: '#a78bfa',
    w: 145,
  },
  {
    id: 'needs-approval',
    label: 'Review Gate',
    sublabel: 'stage:review',
    x: 210,
    y: 175,
    color: '#f59e0b',
    w: 150,
  },
  {
    id: 'needs-input',
    label: 'Needs Input',
    sublabel: 'stage:review + waiting:david',
    x: 410,
    y: 175,
    color: '#f87171',
    w: 140,
  },

  // Row 3 (y=255): Human review lane
  {
    id: 'task-reviewer',
    label: 'Task Reviewer',
    sublabel: 'Triages waiting:david queue',
    x: 410,
    y: 255,
    color: '#f59e0b',
    w: 140,
    isProcess: true,
  },
  {
    id: 'david-review',
    label: 'David Reviews',
    sublabel: 'Dashboard or session',
    x: 210,
    y: 255,
    color: '#f59e0b',
    w: 150,
    isProcess: true,
  },

  // Row 4 (y=340): Queue / Parked
  {
    id: 'ready',
    label: 'Queue',
    sublabel: 'stage:queue',
    x: 120,
    y: 340,
    color: '#a78bfa',
    w: 130,
  },
  { id: 'parked', label: 'Parked', sublabel: 'Deferred', x: 430, y: 340, color: '#6b7280', w: 110 },

  // Row 5 (y=420): Executors (stage:execute)
  {
    id: 'executor',
    label: 'Task Executor',
    sublabel: 'stage:execute · code',
    x: 15,
    y: 420,
    color: '#818cf8',
    w: 135,
    isProcess: true,
  },
  {
    id: 'research',
    label: 'Researcher',
    sublabel: 'stage:execute · research',
    x: 175,
    y: 420,
    color: '#818cf8',
    w: 135,
    isProcess: true,
  },
  {
    id: 'infra',
    label: 'Infra Deployer',
    sublabel: 'stage:execute · infra',
    x: 320,
    y: 420,
    color: '#818cf8',
    w: 135,
    isProcess: true,
  },

  // Row 6 (y=500): Done → Archived
  {
    id: 'done',
    label: 'Done',
    sublabel: 'status: closed',
    x: 120,
    y: 500,
    color: '#34d399',
    w: 120,
  },
  {
    id: 'archived',
    label: 'Archived',
    sublabel: 'closed > N days',
    x: 320,
    y: 500,
    color: '#78716c',
    w: 120,
  },
];

type FlowEdge = {
  from: string;
  to: string;
  label?: string;
  dashed?: boolean;
};

const FLOW_EDGES: FlowEdge[] = [
  // Entry → Evaluate
  { from: 'session', to: 'evaluate' },
  { from: 'headless', to: 'evaluate' },
  { from: 'claude-app', to: 'evaluate' },
  { from: 'manual', to: 'evaluate' },

  // Evaluate → Three routing lanes
  { from: 'evaluate', to: 'safe-auto', label: 'fast-track' },
  { from: 'evaluate', to: 'needs-approval', label: 'stage:route → review' },
  { from: 'evaluate', to: 'needs-input', label: 'needs input' },

  // Approval lane
  { from: 'needs-approval', to: 'david-review' },
  { from: 'needs-input', to: 'task-reviewer' },
  { from: 'task-reviewer', to: 'david-review', label: 'escalate' },
  { from: 'task-reviewer', to: 'ready', label: 'resolve' },

  // David's decisions
  { from: 'david-review', to: 'ready', label: 'approve' },
  { from: 'david-review', to: 'parked', label: 'defer', dashed: true },

  // Auto-approved → Ready (fully automated)
  { from: 'safe-auto', to: 'ready' },

  // Ready → Executors (routed by capability)
  { from: 'ready', to: 'executor', label: 'file-ops / code' },
  { from: 'ready', to: 'research', label: 'type:research' },
  { from: 'ready', to: 'infra', label: 'capability:infra' },

  // Executors → Done
  { from: 'executor', to: 'done' },
  { from: 'research', to: 'done' },
  { from: 'infra', to: 'done' },

  // Done → Archived (time-based auto-transition)
  { from: 'done', to: 'archived', label: 'after N days', dashed: true },
];

function ProcessDiagram() {
  const svgW = 570;
  const svgH = 545;

  const nodeMap = new Map(FLOW_NODES.map((n) => [n.id, n]));

  // "Automated flow" = green arrows for paths that don't require human intervention
  const AUTO_NODES = new Set(['safe-auto', 'ready', 'executor', 'research', 'infra', 'done']);
  const APPROVAL_LABELS = new Set(['approve', 'resolve']);

  function getEdgePath(edge: FlowEdge) {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return '';

    const fromCx = from.x + from.w / 2;
    const fromCy = from.y + 32;
    const toCx = to.x + to.w / 2;
    const toCy = to.y;

    // task-reviewer → david-review: horizontal arrow, left side to right side (same row)
    if (edge.from === 'task-reviewer' && edge.to === 'david-review') {
      const fromX = from.x;
      const fromY = from.y + 16;
      const toX = to.x + to.w;
      const toY = to.y + 16;
      return `M ${fromX} ${fromY} C ${fromX - 20} ${fromY}, ${toX + 20} ${toY}, ${toX} ${toY}`;
    }

    // For the task-reviewer → ready edge, use a wider curve to avoid crossing other lines
    if (edge.from === 'task-reviewer' && edge.to === 'ready') {
      const midX = (fromCx + toCx) / 2 + 40;
      return `M ${fromCx} ${fromCy} Q ${midX} ${(fromCy + toCy) / 2}, ${toCx} ${toCy}`;
    }

    const dy = toCy - fromCy;
    return `M ${fromCx} ${fromCy} C ${fromCx} ${fromCy + dy * 0.4}, ${toCx} ${fromCy + dy * 0.6}, ${toCx} ${toCy}`;
  }

  function getEdgeMid(edge: FlowEdge): { x: number; y: number } {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    if (!from || !to) return { x: 0, y: 0 };

    const fromCx = from.x + from.w / 2;
    const fromCy = from.y + 32;
    const toCx = to.x + to.w / 2;
    const toCy = to.y;

    // task-reviewer → david-review: label centered between the two boxes
    if (edge.from === 'task-reviewer' && edge.to === 'david-review') {
      return { x: (from.x + to.x + to.w) / 2, y: from.y + 16 };
    }

    if (edge.from === 'task-reviewer' && edge.to === 'ready') {
      return { x: (fromCx + toCx) / 2 + 20, y: (fromCy + toCy) / 2 };
    }

    return { x: (fromCx + toCx) / 2, y: (fromCy + toCy) / 2 };
  }

  function isAutoEdge(edge: FlowEdge): boolean {
    if (APPROVAL_LABELS.has(edge.label ?? '')) return true;
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    return !!(from && to && AUTO_NODES.has(from.id) && AUTO_NODES.has(to.id));
  }

  return (
    <div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#4b5563" />
          </marker>
          <marker
            id="arrow-green"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#34d399" />
          </marker>
        </defs>

        {/* Row labels (left side) */}
        <text
          x="2"
          y="10"
          fill="#374151"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          SOURCES
        </text>
        <text
          x="2"
          y="90"
          fill="#374151"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          EVALUATE
        </text>
        <text
          x="2"
          y="170"
          fill="#374151"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          ROUTE
        </text>
        <text
          x="2"
          y="250"
          fill="#374151"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          REVIEW
        </text>
        <text
          x="2"
          y="335"
          fill="#374151"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          QUEUE
        </text>
        <text
          x="2"
          y="415"
          fill="#374151"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          EXECUTE
        </text>

        {/* Edges */}
        {FLOW_EDGES.map((edge, i) => {
          const path = getEdgePath(edge);
          const mid = getEdgeMid(edge);
          const auto = isAutoEdge(edge);
          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke={auto ? '#34d399' : '#4b5563'}
                strokeWidth={auto ? 1.5 : 1}
                strokeDasharray={edge.dashed ? '4 3' : undefined}
                strokeOpacity={edge.dashed ? 0.5 : 0.8}
                markerEnd={auto ? 'url(#arrow-green)' : 'url(#arrow)'}
              />
              {edge.label && (
                <text
                  x={mid.x}
                  y={mid.y - 5}
                  textAnchor="middle"
                  className="text-[7px]"
                  fill={auto ? '#6ee7b7' : '#9ca3af'}
                  style={{ fontFamily: 'system-ui' }}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {FLOW_NODES.map((node) => {
          const h = 32;
          const r = node.isProcess ? 4 : 8;
          return (
            <g key={node.id}>
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={h}
                rx={r}
                fill={node.isProcess ? `${node.color}08` : `${node.color}12`}
                stroke={node.color}
                strokeWidth={1}
                strokeDasharray={node.isProcess ? '4 3' : undefined}
              />
              <text
                x={node.x + node.w / 2}
                y={node.y + 13}
                textAnchor="middle"
                fill={node.color}
                className="text-[10px] font-semibold"
                style={{ fontFamily: 'system-ui, sans-serif' }}
              >
                {node.label}
              </text>
              <text
                x={node.x + node.w / 2}
                y={node.y + 25}
                textAnchor="middle"
                fill="#6b7280"
                className="text-[7.5px]"
                style={{ fontFamily: 'system-ui, sans-serif' }}
              >
                {node.sublabel}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend — clean row below diagram */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-default text-[10px] text-faint">
        <span className="text-disabled mr-1">Nodes:</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded border border-cyan-500/50 bg-cyan-500/10" />
          <span>Source</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded border"
            style={{ borderColor: '#a78bfa80', backgroundColor: '#a78bfa12' }}
          />
          <span style={{ color: '#a78bfa' }}>Ready</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded border"
            style={{ borderColor: '#f8717180', backgroundColor: '#f8717112' }}
          />
          <span style={{ color: '#f87171' }}>Blocked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded border"
            style={{ borderColor: '#34d39980', backgroundColor: '#34d39912' }}
          />
          <span style={{ color: '#34d399' }}>Done</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded border"
            style={{ borderColor: '#6b728080', backgroundColor: '#6b728012' }}
          />
          <span style={{ color: '#6b7280' }}>Deferred</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded-sm border border-indigo-400/50"
            style={{ borderStyle: 'dashed' }}
          />
          <span style={{ color: '#818cf8' }}>Process</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-2.5 rounded-sm border border-amber-400/50"
            style={{ borderStyle: 'dashed' }}
          />
          <span style={{ color: '#f59e0b' }}>Human gate</span>
        </div>
        <span className="text-disabled ml-2 mr-1">Arrows:</span>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="8">
            <line x1="0" y1="4" x2="16" y2="4" stroke="#34d399" strokeWidth="1.5" />
          </svg>
          <span className="text-emerald-400/70">Automated</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="8">
            <line x1="0" y1="4" x2="16" y2="4" stroke="#4b5563" strokeWidth="1" />
          </svg>
          <span>Manual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="8">
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke="#4b5563"
              strokeWidth="1"
              strokeDasharray="3 2"
            />
          </svg>
          <span>Optional</span>
        </div>
      </div>
    </div>
  );
}

// Board lifecycle diagram — the high-level "where is my stuff" view
// Uses hand-tuned paths for bidirectional edges to prevent overlap
function BoardLifecycleDiagram() {
  const svgW = 570;
  const svgH = 300;
  const nodeH = 40;

  // Node positions — spread out more to give edges room
  const nodes: {
    id: string;
    x: number;
    y: number;
    w: number;
    label: string;
    color: string;
    sub: string;
  }[] = [
    {
      id: 'backlog',
      x: 10,
      y: 75,
      w: 100,
      label: 'Backlog',
      color: '#9ca3af',
      sub: 'Unsorted / new',
    },
    { id: 'ready', x: 145, y: 75, w: 90, label: 'Ready', color: '#a78bfa', sub: 'auto:ready' },
    {
      id: 'in_progress',
      x: 270,
      y: 75,
      w: 115,
      label: 'In Progress',
      color: '#38bdf8',
      sub: 'Being worked on',
    },
    { id: 'done', x: 420, y: 75, w: 80, label: 'Done', color: '#34d399', sub: 'Closed' },
    {
      id: 'blocked',
      x: 75,
      y: 210,
      w: 105,
      label: 'Blocked',
      color: '#f87171',
      sub: 'Needs human action',
    },
    {
      id: 'deferred',
      x: 310,
      y: 210,
      w: 105,
      label: 'Deferred',
      color: '#6b7280',
      sub: 'Parked / on hold',
    },
  ];

  // Hand-tuned edges with explicit path offsets to prevent overlap
  type Edge = {
    path: string;
    labelX: number;
    labelY: number;
    label: string;
    who: 'nexus' | 'human' | 'either';
    dashed?: boolean;
  };

  // Helper coords
  const bk = nodes[0],
    rd = nodes[1],
    ip = nodes[2],
    dn = nodes[3],
    bl = nodes[4],
    df = nodes[5];

  const edges: Edge[] = [
    // Backlog → Ready (top arc)
    {
      path: `M ${bk.x + bk.w + 3} ${bk.y + 18} Q ${(bk.x + bk.w + rd.x) / 2} ${bk.y - 2}, ${rd.x - 3} ${rd.y + 18}`,
      labelX: (bk.x + bk.w + rd.x) / 2,
      labelY: bk.y - 6,
      label: 'Nexus evaluates',
      who: 'nexus',
    },
    // Ready → In Progress (top arc)
    {
      path: `M ${rd.x + rd.w + 3} ${rd.y + 18} Q ${(rd.x + rd.w + ip.x) / 2} ${rd.y - 2}, ${ip.x - 3} ${ip.y + 18}`,
      labelX: (rd.x + rd.w + ip.x) / 2,
      labelY: rd.y - 6,
      label: 'claim',
      who: 'either',
    },
    // In Progress → Done (top arc)
    {
      path: `M ${ip.x + ip.w + 3} ${ip.y + 18} Q ${(ip.x + ip.w + dn.x) / 2} ${ip.y - 2}, ${dn.x - 3} ${dn.y + 18}`,
      labelX: (ip.x + ip.w + dn.x) / 2,
      labelY: ip.y - 6,
      label: 'complete',
      who: 'either',
    },
    // Ready → Blocked (left side, going down)
    {
      path: `M ${rd.x + 20} ${rd.y + nodeH} C ${rd.x + 10} ${rd.y + nodeH + 35}, ${bl.x + bl.w - 10} ${bl.y - 35}, ${bl.x + bl.w - 20} ${bl.y}`,
      labelX: rd.x - 15,
      labelY: (rd.y + nodeH + bl.y) / 2 + 5,
      label: 'needs approval',
      who: 'nexus',
    },
    // Blocked → Ready (right side, going up) — offset from the Ready→Blocked path
    {
      path: `M ${bl.x + bl.w} ${bl.y + 10} C ${bl.x + bl.w + 40} ${bl.y - 30}, ${rd.x + rd.w + 10} ${rd.y + nodeH + 30}, ${rd.x + rd.w - 10} ${rd.y + nodeH}`,
      labelX: bl.x + bl.w + 48,
      labelY: (rd.y + nodeH + bl.y) / 2 + 5,
      label: 'approve',
      who: 'human',
    },
    // In Progress → Deferred (going down)
    {
      path: `M ${ip.x + ip.w / 2 + 15} ${ip.y + nodeH} C ${ip.x + ip.w / 2 + 15} ${ip.y + nodeH + 40}, ${df.x + df.w / 2} ${df.y - 40}, ${df.x + df.w / 2} ${df.y}`,
      labelX: ip.x + ip.w / 2 + 50,
      labelY: (ip.y + nodeH + df.y) / 2,
      label: 'park',
      who: 'human',
      dashed: true,
    },
    // Deferred → Ready (going up-left, wide arc)
    {
      path: `M ${df.x} ${df.y + 10} C ${df.x - 60} ${df.y - 40}, ${rd.x + rd.w / 2 - 20} ${rd.y + nodeH + 60}, ${rd.x + rd.w / 2} ${rd.y + nodeH}`,
      labelX: df.x - 60,
      labelY: df.y - 15,
      label: 'unpark',
      who: 'human',
      dashed: true,
    },
    // Blocked → Deferred (horizontal on bottom row)
    {
      path: `M ${bl.x + bl.w + 3} ${bl.y + 22} Q ${(bl.x + bl.w + df.x) / 2} ${bl.y + 40}, ${df.x - 3} ${df.y + 22}`,
      labelX: (bl.x + bl.w + df.x) / 2,
      labelY: bl.y + 48,
      label: 'defer',
      who: 'human',
      dashed: true,
    },
  ];

  function arrowId(who: string): string {
    if (who === 'nexus') return 'url(#b-arr-green)';
    if (who === 'human') return 'url(#b-arr-amber)';
    return 'url(#b-arr-blue)';
  }
  function edgeColor(who: string): string {
    if (who === 'nexus') return '#34d399';
    if (who === 'human') return '#f59e0b';
    return '#60a5fa';
  }

  return (
    <div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
        <defs>
          <marker
            id="b-arr-green"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#34d399" />
          </marker>
          <marker
            id="b-arr-amber"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#f59e0b" />
          </marker>
          <marker
            id="b-arr-blue"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#60a5fa" />
          </marker>
        </defs>

        {/* Section labels */}
        <text
          x={svgW / 2}
          y="18"
          textAnchor="middle"
          fill="#374151"
          className="text-[9px]"
          style={{ fontFamily: 'system-ui', letterSpacing: '0.08em' }}
        >
          MAIN FLOW
        </text>
        <line x1="10" y1="175" x2={svgW - 60} y2="175" stroke="#1f2937" strokeWidth="0.5" />
        <text
          x={230}
          y="192"
          textAnchor="middle"
          fill="#374151"
          className="text-[9px]"
          style={{ fontFamily: 'system-ui', letterSpacing: '0.08em' }}
        >
          SIDE STATES
        </text>

        {/* Direction arrow on main flow */}
        <text
          x={svgW - 40}
          y="96"
          fill="#374151"
          className="text-[20px]"
          style={{ fontFamily: 'system-ui' }}
        >
          →
        </text>

        {/* Edges — hand-tuned paths */}
        {edges.map((e, i) => {
          const color = edgeColor(e.who);
          return (
            <g key={i}>
              <path
                d={e.path}
                fill="none"
                stroke={color}
                strokeWidth={1.2}
                strokeDasharray={e.dashed ? '4 3' : undefined}
                strokeOpacity={e.dashed ? 0.5 : 0.7}
                markerEnd={arrowId(e.who)}
              />
              <text
                x={e.labelX}
                y={e.labelY}
                textAnchor="middle"
                fill={color}
                className="text-[8px]"
                style={{ fontFamily: 'system-ui' }}
                opacity={0.9}
              >
                {e.label}
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.w}
              height={nodeH}
              rx={7}
              fill={`${node.color}12`}
              stroke={node.color}
              strokeWidth={1}
            />
            <text
              x={node.x + node.w / 2}
              y={node.y + 17}
              textAnchor="middle"
              fill={node.color}
              className="text-[11px] font-semibold"
              style={{ fontFamily: 'system-ui' }}
            >
              {node.label}
            </text>
            <text
              x={node.x + node.w / 2}
              y={node.y + 31}
              textAnchor="middle"
              fill="#6b7280"
              className="text-[8px]"
              style={{ fontFamily: 'system-ui' }}
            >
              {node.sub}
            </text>
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-default text-[11px] text-faint">
        <div className="flex items-center gap-1.5">
          <svg width="20" height="8">
            <line x1="0" y1="4" x2="20" y2="4" stroke="#34d399" strokeWidth="1.5" />
          </svg>
          <span className="text-emerald-400/80">Nexus (automated)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="8">
            <line x1="0" y1="4" x2="20" y2="4" stroke="#f59e0b" strokeWidth="1.5" />
          </svg>
          <span className="text-amber-400/80">David (manual)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="8">
            <line x1="0" y1="4" x2="20" y2="4" stroke="#60a5fa" strokeWidth="1.5" />
          </svg>
          <span className="text-accent-text/80">Either (human or Nexus)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="8">
            <line
              x1="0"
              y1="4"
              x2="20"
              y2="4"
              stroke="#6b7280"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          </svg>
          <span>Optional transition</span>
        </div>
      </div>
    </div>
  );
}

// Nexus Operations diagram — what's running in the background
function NexusOperationsDiagram() {
  type Job = {
    name: string;
    schedule: string;
    desc: string;
    output: string;
    drops?: string; // which board column the output lands in
  };

  const generators: Job[] = [
    {
      name: 'Health Summary',
      schedule: '6h',
      desc: 'Docker container health checks',
      output: 'Infra tasks',
      drops: 'Backlog',
    },
    {
      name: 'ABS Librarian',
      schedule: '6h',
      desc: 'AudioBookShelf naming enforcement',
      output: 'Rename / restructure tasks',
      drops: 'Backlog',
    },
    {
      name: 'Backup Validate',
      schedule: '12h',
      desc: 'Restic backup verification',
      output: 'Alert tasks',
      drops: 'Backlog',
    },
    {
      name: 'Docker Cleanup',
      schedule: 'Sun @4am',
      desc: 'Dangling volumes & images',
      output: 'Cleanup tasks',
      drops: 'Backlog',
    },
    {
      name: 'Threat Intel',
      schedule: 'Mon @6am',
      desc: 'Security threat research',
      output: 'Research notes',
      drops: 'Obsidian',
    },
    {
      name: 'Upgrade Discover',
      schedule: 'Sun @6am',
      desc: 'Claude Code / MCP updates',
      output: 'Upgrade tasks',
      drops: 'Backlog',
    },
    {
      name: 'Doc Sync Check',
      schedule: '24h',
      desc: 'Drift between code and docs',
      output: 'Sync tasks',
      drops: 'Backlog',
    },
    {
      name: 'Creative Sync',
      schedule: 'Sun @6am',
      desc: 'CreativeProjects hook drift',
      output: 'Sync tasks',
      drops: 'Backlog',
    },
  ];

  const pipeline: Job[] = [
    {
      name: 'Task Scoring',
      schedule: 'Daily @8pm',
      desc: 'Stamps auto: + risk: labels',
      output: 'Labels applied',
      drops: 'Backlog → Backlog',
    },
    {
      name: 'Task Evaluator',
      schedule: '1h',
      desc: 'intake → route (or queue fast-track)',
      output: 'stage: transitions',
      drops: 'Backlog → Ready or Blocked',
    },
    {
      name: 'Task Investigator',
      schedule: 'Daily @9pm',
      desc: 'route → queue or review',
      output: 'stage: transitions',
      drops: 'Backlog → Ready',
    },
    {
      name: 'Task Executor',
      schedule: '2h',
      desc: 'queue → execute, closes on success',
      output: 'Tasks completed',
      drops: 'Ready → Done',
    },
    {
      name: 'Infra Deployer',
      schedule: '1h',
      desc: 'Docker / infrastructure deployments',
      output: 'Containers deployed',
      drops: 'Ready → Done',
    },
    {
      name: 'Task Research',
      schedule: '1h',
      desc: 'Runs pipeline:approved research tasks',
      output: 'Notes → Obsidian',
      drops: 'Ready → Done',
    },
    {
      name: 'Task Reviewer',
      schedule: '2h',
      desc: 'Triages waiting:david queue',
      output: 'Decisions + approvals',
      drops: 'Blocked → Ready',
    },
    {
      name: 'Pipeline Review',
      schedule: '12h',
      desc: 'Reviews pipeline health + proposals',
      output: 'Review actions',
      drops: 'Blocked → Ready',
    },
    {
      name: 'Pipeline Watchdog',
      schedule: '5 min',
      desc: 'Label integrity, gate validation, stuck detection',
      output: 'Auto-fixes + alerts',
      drops: 'Blocked → Ready',
    },
  ];

  const aurora: Job[] = [
    {
      name: 'Think',
      schedule: 'Daily @12am',
      desc: 'Generates creative ideas',
      output: 'Aurora tasks',
      drops: 'Aurora pipeline',
    },
    {
      name: 'Build',
      schedule: 'Daily @2am',
      desc: 'Builds approved projects',
      output: 'Code / artifacts',
      drops: 'In Progress',
    },
    {
      name: 'Action',
      schedule: '6h',
      desc: 'Executes approved Aurora tasks',
      output: 'Deliverables',
      drops: 'In Progress → Done',
    },
    {
      name: 'Present',
      schedule: 'Daily @6am',
      desc: 'Delivers to David',
      output: 'Telegram surprise',
      drops: 'Done',
    },
    {
      name: 'Feedback',
      schedule: 'Daily @9pm',
      desc: "Processes David's reactions",
      output: 'Route next steps',
      drops: 'Ready or Deferred',
    },
  ];

  const infra = [
    { name: 'Dispatcher', schedule: '*/5 min', desc: 'Master scheduler — only cron job' },
    {
      name: 'Dispatcher Watchdog',
      schedule: '15 min',
      desc: 'Alerts via Telegram if dispatcher stalls',
    },
    { name: 'Msg Relay', schedule: '*/5 min', desc: 'DND-aware notification delivery' },
    {
      name: 'Event Watcher',
      schedule: '*/2 min',
      desc: 'Detects task events, stamps stage:intake',
    },
  ];

  // Color drops text to match unified board column colors
  function dropsColor(drops: string): string {
    if (drops.includes('Done')) return '#34d399';
    if (drops.includes('Ready')) return '#a78bfa';
    if (drops.includes('Blocked')) return '#f87171';
    if (drops.includes('In Progress')) return '#38bdf8';
    if (drops.includes('Backlog')) return '#9ca3af';
    if (drops.includes('Deferred')) return '#6b7280';
    return '#9ca3af'; // fallback (Obsidian, Aurora pipeline, etc.)
  }

  const svgW = 570;
  const rowH = 20;
  const colW = 135;
  const groupGap = 14;

  // Calculate heights
  const genH = generators.length * rowH;
  const pipH = pipeline.length * rowH;
  const aurH = aurora.length * rowH;
  const infraH = infra.length * rowH;

  const genY = 50;
  const pipY = genY + genH + groupGap + 28;
  const aurY = pipY + pipH + groupGap + 28;
  const infraY = aurY + aurH + groupGap + 28;
  const svgH = infraY + infraH + 15;

  // Arrow from generators to pipeline (conceptual flow)
  const arrowY = pipY - groupGap / 2 - 6;
  const arrow2Y = aurY - groupGap / 2 - 6;

  function renderGroup(
    label: string,
    sublabel: string,
    items: { name: string; schedule: string; desc: string; output?: string; drops?: string }[],
    startY: number,
    color: string,
    showDrops: boolean,
  ) {
    return (
      <g>
        {/* Group header */}
        <text
          x="8"
          y={startY - 8}
          fill={color}
          className="text-[10px] font-semibold"
          style={{ fontFamily: 'system-ui' }}
        >
          {label}
        </text>
        <text
          x={8 + label.length * 6.2}
          y={startY - 8}
          fill="#4b5563"
          className="text-[8px]"
          style={{ fontFamily: 'system-ui' }}
        >
          {' '}
          {sublabel}
        </text>

        {/* Background band */}
        <rect
          x="4"
          y={startY - 2}
          width={svgW - 8}
          height={items.length * rowH + 4}
          rx="4"
          fill={`${color}06`}
          stroke={`${color}20`}
          strokeWidth="0.5"
        />

        {/* Column headers */}
        <text
          x="12"
          y={startY + 10}
          fill="#4b5563"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          JOB
        </text>
        <text
          x={colW}
          y={startY + 10}
          fill="#4b5563"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          SCHEDULE
        </text>
        <text
          x={colW + 62}
          y={startY + 10}
          fill="#4b5563"
          className="text-[7px]"
          style={{ fontFamily: 'system-ui' }}
        >
          WHAT IT DOES
        </text>
        {showDrops && (
          <text
            x={svgW - 130}
            y={startY + 10}
            fill="#4b5563"
            className="text-[7px]"
            style={{ fontFamily: 'system-ui' }}
          >
            LANDS IN
          </text>
        )}

        {/* Rows */}
        {items.map((item, i) => {
          const y = startY + 12 + (i + 1) * rowH - 6;
          return (
            <g key={item.name}>
              {i > 0 && (
                <line
                  x1="12"
                  y1={y - 14}
                  x2={svgW - 12}
                  y2={y - 14}
                  stroke="#1f2937"
                  strokeWidth="0.3"
                />
              )}
              <text
                x="12"
                y={y}
                fill={color}
                className="text-[9px] font-medium"
                style={{ fontFamily: 'system-ui' }}
              >
                {item.name}
              </text>
              <text
                x={colW}
                y={y}
                fill="#6b7280"
                className="text-[8px]"
                style={{ fontFamily: 'system-ui, monospace' }}
              >
                {item.schedule}
              </text>
              <text
                x={colW + 62}
                y={y}
                fill="#9ca3af"
                className="text-[8px]"
                style={{ fontFamily: 'system-ui' }}
              >
                {item.desc}
              </text>
              {showDrops && item.drops && (
                <text
                  x={svgW - 130}
                  y={y}
                  fill={dropsColor(item.drops)}
                  className="text-[8px]"
                  style={{ fontFamily: 'system-ui' }}
                >
                  → {item.drops}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
        {/* Flow arrows between sections */}
        <text
          x={svgW / 2}
          y={arrowY}
          textAnchor="middle"
          fill="#374151"
          className="text-[8px]"
          style={{ fontFamily: 'system-ui' }}
        >
          ▼ tasks created flow into pipeline ▼
        </text>
        <text
          x={svgW / 2}
          y={arrow2Y}
          textAnchor="middle"
          fill="#374151"
          className="text-[8px]"
          style={{ fontFamily: 'system-ui' }}
        >
          ▼ creative pipeline ▼
        </text>

        {/* Section: Generators */}
        {renderGroup(
          'Generators',
          '— monitor systems, create tasks',
          generators,
          genY,
          '#06b6d4',
          true,
        )}

        {/* Section: Pipeline */}
        {renderGroup('Pipeline', '— move tasks through lifecycle', pipeline, pipY, '#a78bfa', true)}

        {/* Section: Aurora */}
        {renderGroup('Aurora', '— creative surprise system', aurora, aurY, '#ec4899', true)}

        {/* Section: Infrastructure */}
        {renderGroup(
          'Infrastructure',
          '— keeps Nexus itself running',
          infra,
          infraY,
          '#6b7280',
          false,
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-default text-[11px] text-faint">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-cyan-500/10 border border-cyan-500/30" />
          <span className="text-cyan-400/70">Generators</span>
          <span>— create new tasks from monitoring</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-purple-500/10 border border-purple-500/30" />
          <span className="text-purple-400/70">Pipeline</span>
          <span>— move existing tasks toward completion</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-pink-500/10 border border-pink-500/30" />
          <span className="text-pink-400/70">Aurora</span>
          <span>— creative surprise tenant</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-surface-muted/10 border border-b-muted/30" />
          <span>Infrastructure</span>
          <span>— keeps the system alive</span>
        </div>
      </div>
    </div>
  );
}

const PREFIX_COLORS: Record<string, string> = {
  auto: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  risk: 'bg-red-500/20 text-red-300 border-red-500/30',
  pipeline: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  domain: 'bg-accent/20 text-accent-text-light border-accent/30',
  project: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  source: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  capability: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  aurora: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  waiting: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  status: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  severity: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  action: 'bg-green-500/20 text-green-300 border-green-500/30',
  agent: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  type: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  review: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  stage: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  parent: 'bg-surface-muted/20 text-tertiary border-b-muted/30',
  'follow-up': 'bg-surface-muted/20 text-tertiary border-b-muted/30',
  blocked: 'bg-red-500/20 text-red-300 border-red-500/30',
  orchestration: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  phase: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
};

function getLabelColor(prefix: string) {
  return PREFIX_COLORS[prefix] ?? 'bg-surface-muted/20 text-tertiary border-b-muted/30';
}

// Labels that block progress — canonical set from label-taxonomy.yaml
const BLOCKER_LABELS = new Set([
  'waiting:david',
  'waiting:external',
  'waiting:subtasks',
  'waiting:session',
  'needs-input',
  'manual-action',
  'pipeline:needs-approval',
  'blocked:dependency',
]);

type DocTab = 'overview' | 'labels' | 'pipeline' | 'architecture';

const DOC_TABS: { key: DocTab; label: string; desc: string }[] = [
  { key: 'overview', label: 'Overview', desc: 'How tasks flow through the system' },
  { key: 'labels', label: 'Labels', desc: 'Live label taxonomy and rules' },
  { key: 'pipeline', label: 'Pipeline', desc: 'Execution, routing, and safety' },
  { key: 'architecture', label: 'Architecture', desc: 'Sources of truth and file registry' },
];

// Sources of truth data — canonical reference: .claude/.claude/context/systems/nexus-sources-of-truth.md
const SOT_CONFIG = [
  {
    file: '.claude/context/tools/label-taxonomy.yaml',
    purpose:
      'All label definitions — prefixes, values, mutual exclusions, gate-stage rules, state transitions',
    format: 'YAML',
    mutable: false,
  },
  {
    file: '.claude/jobs/lib/routing-rules.yaml',
    purpose:
      'Executor pickup criteria, stage transitions, dispatch routing, trust levels, fast-track rules',
    format: 'YAML',
    mutable: false,
  },
  {
    file: '.claude/jobs/registry.yaml',
    purpose: 'Job definitions — schedule, budget, persona, model, pre_checks, quiet hours',
    format: 'YAML',
    mutable: false,
  },
  {
    file: 'paths-registry.yaml',
    purpose: 'All external paths — project locations, hosts, service endpoints, NAS shares',
    format: 'YAML',
    mutable: false,
  },
  {
    file: '.claude/context/tools/pulse-reference.md',
    purpose: 'Pulse CLI/API reference — endpoints, labels, task lifecycle conventions',
    format: 'Markdown',
    mutable: false,
  },
  {
    file: '.claude/settings.json',
    purpose: 'Claude Code permissions — hooks, MCP servers, plugins',
    format: 'JSON',
    mutable: false,
  },
];

const SOT_SCRIPTS = [
  {
    file: '.claude/jobs/lib/label-ops.sh',
    purpose: 'All label mutations — single chokepoint, mutex enforcement, deprecated rejection',
    mirrors: 'label-taxonomy.yaml',
  },
  {
    file: '.claude/jobs/lib/routing-helpers.sh',
    purpose: 'Bash routing logic — eligibility checks, stage transitions',
    mirrors: 'routing-rules.yaml',
  },
  {
    file: '.claude/jobs/dispatcher.sh',
    purpose: 'Master scheduler — reads registry, job locking, post-cycle housekeeping',
    mirrors: 'registry.yaml',
  },
  {
    file: '.claude/jobs/executor.sh',
    purpose: 'Persona-aware LLM runner — retries, metrics, logging',
    mirrors: 'registry.yaml + personas',
  },
  {
    file: '.claude/jobs/event-watcher.sh',
    purpose: 'Task event detection — stage:intake stamping, project advancement',
    mirrors: 'routing-helpers.sh + label-ops.sh',
  },
  {
    file: '.claude/jobs/pipeline-watchdog.sh',
    purpose: 'Label integrity enforcement — gate-stage validation, stuck detection, auto-fixes',
    mirrors: 'label-taxonomy.yaml + routing-rules.yaml',
  },
  {
    file: '.claude/jobs/lib/pulse-api.sh',
    purpose: 'Pulse API bash layer — single chokepoint for all bash-to-Pulse communication',
    mirrors: 'Pulse API (localhost:8700)',
  },
  {
    file: '.claude/jobs/lib/common.sh',
    purpose:
      'Base utility library — logging, path resolution, error handling (sourced by 10+ scripts)',
    mirrors: 'None (foundational)',
  },
];

const SOT_STATE = [
  {
    file: '.claude/jobs/state/nexus.db',
    purpose: 'Primary state database — events + job_state tables (SQLite WAL)',
    writer: 'nexusdb.py',
  },
  {
    file: 'Pulse PostgreSQL (localhost:8700)',
    purpose: 'Task database — all task records, metadata, labels, projects',
    writer: 'Pulse API',
  },
  {
    file: '.claude/jobs/state/dispatcher-heartbeat',
    purpose: 'Dispatcher liveness proof (mtime checked every 15 min)',
    writer: 'dispatcher.sh',
  },
  {
    file: '.claude/jobs/state/event-watcher-cursor',
    purpose: 'Event cursor position for incremental processing',
    writer: 'event-watcher.sh',
  },
];

const SOT_AUDIT = [
  {
    file: '.claude/data/label-mutations.jsonl',
    purpose: 'Every label change — task_id, scenario, source, action, label, timestamp',
    writer: 'label-ops.sh',
  },
  {
    file: '.claude/data/pipeline-health.jsonl',
    purpose: 'Watchdog integrity check results — violations, fixes, metrics',
    writer: 'pipeline-watchdog.sh',
  },
  {
    file: '.claude/logs/headless/nexus.jsonl',
    purpose: 'Structured JSON logging (Loki-compatible) — all Nexus scripts',
    writer: 'All scripts',
  },
  {
    file: '.claude/logs/headless/executions/',
    purpose: 'Per-job execution logs — JSON output + latest-* symlinks',
    writer: 'executor.sh',
  },
  {
    file: '.claude/agent-output/results/task-reviewer/*.jsonl',
    purpose: 'Task Reviewer decisions + feedback learning data',
    writer: 'task-reviewer job',
  },
];

const SOT_CASCADES = [
  {
    changed: 'label-taxonomy.yaml',
    update: 'label-ops.sh (mutex/deprecated arrays), pulse-reference.md, dashboard labels.ts',
    reason: 'Label definitions must sync across all consumers',
  },
  {
    changed: 'routing-rules.yaml',
    update: 'routing-helpers.sh, persona prompts, registry.yaml pre_checks',
    reason: 'Routing logic must be identical in YAML and bash',
  },
  {
    changed: 'registry.yaml',
    update: 'Documentation files, persona configs (if overrides change)',
    reason: 'Job config drives scheduling and execution',
  },
  {
    changed: 'label-ops.sh',
    update:
      'Test all scripts that source it (event-watcher, executor, watchdog, obsidian-watch-monitor, directive-runner, nexus-label)',
    reason: 'Single chokepoint — breakage cascades everywhere',
  },
];

const SOT_DOCS = [
  {
    file: '.claude/context/systems/nexus.md',
    purpose: 'Overall Nexus architecture and component map',
  },
  {
    file: '.claude/context/systems/nexus-plumbing-map.md',
    purpose: 'Script-level architecture — call graphs, data flows, label state machine',
  },
  {
    file: '.claude/context/systems/nexus-sources-of-truth.md',
    purpose: 'THIS file registry — canonical reference for all authoritative files',
  },
  {
    file: '.claude/context/systems/stage-lifecycle.md',
    purpose: 'Pipeline stage definitions, transition rules, fast-track conditions',
  },
  {
    file: '.claude/context/systems/workflow-inventory.md',
    purpose: 'All 7 task entry points, user/system actions, error cases',
  },
  {
    file: '.claude/context/tools/pulse-reference.md',
    purpose: 'Pulse CLI/API reference — endpoints, labels, task lifecycle conventions',
  },
  {
    file: '.claude/jobs/lib/autofix-scoring-rules.md',
    purpose: 'Deterministic promotion criteria (candidate → ready)',
  },
];

// --- Markdown generators for each section ---

function mdArchitectureTab() {
  let md = '# Nexus Architecture — Sources of Truth\n\n';
  md += '## Configuration Files\n\n';
  md += mdTable(
    ['File', 'Source of Truth For', 'Format'],
    SOT_CONFIG.map((r) => [`\`${r.file}\``, r.purpose, r.format]),
  );
  md += '\n\n## Chokepoint Scripts\n\n';
  md += mdTable(
    ['File', 'Authoritative For', 'Must Mirror'],
    SOT_SCRIPTS.map((r) => [`\`${r.file}\``, r.purpose, `\`${r.mirrors}\``]),
  );
  md +=
    '\n\n## Persona System\n\nEach persona at `.claude/jobs/personas/<name>/` has: `prompt.md`, `config.yaml`, `permissions.yaml`.\n\n';
  md +=
    'Active (23): ' +
    [
      'task-reviewer',
      'analyst',
      'autofix-executor',
      'aurora-action',
      'aurora-builder',
      'aurora-feedback',
      'aurora-presenter',
      'aurora-thinker',
      'backend-eng',
      'bug-fixer',
      'db-eng',
      'infrastructure-deployer',
      'investigator',
      'librarian',
      'pipeline-reviewer',
      'project-manager',
      'researcher',
      'security-reviewer',
      'task-evaluator',
      'task-investigator',
      'team-verdict',
      'troubleshooter',
      'ux-eng',
    ]
      .map((p) => `\`${p}\``)
      .join(', ') +
    '\n';
  md += '\n## Runtime State\n\n';
  md += mdTable(
    ['File', 'Authoritative For', 'Written By'],
    SOT_STATE.map((r) => [`\`${r.file}\``, r.purpose, r.writer]),
  );
  md += '\n\n## Audit Trails\n\n';
  md += mdTable(
    ['File', 'Records', 'Written By'],
    SOT_AUDIT.map((r) => [`\`${r.file}\``, r.purpose, r.writer]),
  );
  md += '\n\n## Dangerous Update Cascades\n\n';
  md += mdTable(
    ['If You Change', 'Must Also Update', 'Why'],
    SOT_CASCADES.map((r) => [`\`${r.changed}\``, r.update, r.reason]),
  );
  md += '\n\n## Reference Documentation\n\n';
  md += mdTable(
    ['File', 'Documents'],
    SOT_DOCS.map((r) => [`\`${r.file}\``, r.purpose]),
  );
  return md;
}

function mdPipelineTab() {
  let md = '# Nexus Pipeline\n\n';
  md += '## Execution Matrix\n\n';
  md += mdTable(
    ['', 'risk:safe', 'risk:moderate', 'risk:destructive'],
    [
      ['auto:ready', 'Auto-execute (batch)', 'Individual approve', 'Manual only'],
      ['auto:candidate', 'Suggested in digest', 'Manual only', 'Manual only'],
      ['waiting:david', 'Manual', 'Manual', 'Manual'],
    ],
  );
  md += '\n\n## Execution Eligibility\n\n';
  md += mdTable(
    ['Executor', 'Eligible If', 'Capability', 'Skip If Any'],
    [
      [
        'task-executor',
        'stage:queue AND (risk:safe OR pipeline:approved)',
        'file-ops, code',
        'waiting:david, needs-input, type:research, parked, capability:infrastructure',
      ],
      [
        'infra-deployer',
        'stage:queue AND capability:infrastructure AND (risk:safe OR risk:moderate)',
        'infrastructure',
        'waiting:david, needs-input, parked, risk:destructive',
      ],
      [
        'task-research',
        'stage:queue AND pipeline:approved AND type:research',
        'research',
        'waiting:david, needs-input, parked',
      ],
    ],
  );
  md += '\n\n## Gate-Stage Validation\n\n';
  const gates = [
    ['waiting:david', 'review'],
    ['waiting:external', 'review'],
    ['waiting:subtasks', 'review'],
    ['waiting:session', 'review'],
    ['needs-input', 'review'],
    ['manual-action', 'review'],
    ['pipeline:needs-approval', 'review'],
    ['auto:candidate', 'route'],
    ['auto:ready', 'queue, execute'],
    ['blocked:dependency', 'queue'],
    ['aurora:executing', 'execute'],
    ['review:pending', 'review'],
    ['review:escalated', 'review'],
    ['review:ready', 'review'],
  ];
  md += mdTable(
    ['Gate Label', 'Valid Stage(s)'],
    gates.map(([g, s]) => [`\`${g}\``, `stage:${s}`]),
  );
  md += '\n\n## Source Trust Levels\n\n';
  md += mdTable(
    ['Trust Level', 'Sources', 'Auto-Approve'],
    [
      ['High', 'claude-code, priority, project', 'risk:safe'],
      ['Medium', 'session, claude-app', 'risk:safe'],
      ['System', 'headless', 'risk:safe'],
      ['Low', 'ad-hoc', 'None — always requires review'],
    ],
  );
  md += '\n\n## Capability Routing\n\n';
  md += mdTable(
    ['Capability', 'Executor', 'Persona'],
    [
      ['capability:infrastructure', 'task-executor-infra', 'infrastructure-deployer'],
      ['capability:research', 'task-research', 'researcher'],
      ['capability:code', 'task-executor', 'autofix-executor'],
      ['capability:file-ops', 'task-executor', 'autofix-executor'],
      ['none (default)', 'task-executor', 'autofix-executor'],
    ],
  );
  md += '\n\n## Safety Rails\n\n';
  md += '- Max 10 tasks per executor run, 5 for infra-deployer\n';
  md += '- Git stash checkpoint before any changes\n';
  md += '- task-executor never touches: audio files, Docker, SSH, git push, own config\n';
  md +=
    '- infra-deployer: 10-min timeout per task, always health-checks after deploy, rollback on failure\n';
  md += '- Dispatcher watchdog alerts via Telegram if scheduling stalls (15-min heartbeat check)\n';
  md += '- Pipeline watchdog validates label integrity every 5 min\n';
  md += '- Quiet hours enforced: weekdays 10PM–7AM, weekends 11PM–9AM MT\n';
  return md;
}

type LabelCategory = {
  prefix: string;
  name: string;
  description: string;
  function: string;
  group: string;
  labels: { label: string; open: number; closed: number }[];
};
type LabelGroup = { key: string; name: string; description: string };

function mdLabelsTab(categories: LabelCategory[], groups: LabelGroup[]) {
  let md = '# Nexus Labels\n\n';
  for (const group of groups) {
    const cats = categories.filter((c) => c.group === group.key);
    if (cats.length === 0) continue;
    md += `## ${group.name}\n\n${group.description}\n\n`;
    for (const cat of cats) {
      md += `### ${cat.name} (\`${cat.prefix}:\`)\n\n`;
      md += `Function: ${cat.function} — ${cat.description}\n\n`;
      md += mdTable(
        ['Label', 'Open', 'Closed'],
        cat.labels.map((l) => [`\`${l.label}\``, String(l.open), String(l.closed)]),
      );
      md += '\n\n';
    }
  }
  md += '## Mutual Exclusions\n\n';
  const mutexes = [
    {
      set: [
        'stage:intake',
        'stage:evaluate',
        'stage:route',
        'stage:review',
        'stage:queue',
        'stage:execute',
      ],
      desc: 'Exactly one pipeline stage per task',
    },
    { set: ['auto:ready', 'auto:candidate'], desc: 'Either ready to execute or still a candidate' },
    {
      set: ['pipeline:approved', 'pipeline:needs-approval'],
      desc: 'Either approved or awaiting approval',
    },
    {
      set: ['risk:safe', 'risk:moderate', 'risk:destructive'],
      desc: 'Exactly one risk level per task',
    },
    {
      set: ['waiting:david', 'waiting:external', 'waiting:subtasks', 'waiting:session'],
      desc: 'Ball can only be in one court',
    },
  ];
  for (const m of mutexes) {
    md += `- ${m.set.map((l) => `\`${l}\``).join(', ')} — ${m.desc}\n`;
  }
  md += '\n## Deprecated Labels\n\n';
  const deprecated = [
    ['pipeline:evaluated', 'stage: progression'],
    ['pipeline:task-reviewer-approved', 'pipeline:approved'],
    ['pipeline:modified', 'stage:evaluate (re-evaluate)'],
    ['auto-approved', 'pipeline:approved'],
    ['auto:blocked', 'use status field or blocker labels'],
    ['gap:no-executor', 'blocked:dependency'],
    ['waiting:pipeline', 'blocked:dependency'],
    ['waiting:nexus', 'blocked:dependency'],
  ];
  md += mdTable(
    ['Old Label', 'Replacement'],
    deprecated.map(([o, r]) => [`~~\`${o}\`~~`, `\`${r}\``]),
  );
  return md;
}

function mdOverviewTab() {
  let md = '# Nexus Overview\n\n';
  md +=
    'Tasks flow through a label-driven lifecycle managed by the Nexus autonomous operations platform.\n\n';
  md += '## Workflow Views\n\n';
  md += mdTable(
    ['View', 'What it means', 'Classification rule'],
    [
      ['In Progress', 'Actively being worked on', 'status = in_progress'],
      [
        'Ready',
        'Evaluated, scored, eligible for execution',
        'auto:ready OR stage:queue (no blocker)',
      ],
      [
        'Blocked',
        'Needs human approval, input, or external event',
        'waiting:david | waiting:external | needs-input | manual-action | pipeline:needs-approval',
      ],
      [
        'Backlog',
        'Not yet evaluated or auto:candidate',
        'open, no auto:ready, no blocker, no defer',
      ],
      ['Deferred', 'On hold — deliberately paused', 'status = deferred | parked'],
      ['Closed', 'Recently completed', 'status = closed (within archive threshold)'],
      ['Archived', 'Older completed tasks', 'status = closed (beyond archive threshold)'],
    ],
  );
  md += '\n\n*Diagrams are visual-only and not included in markdown export.*\n';
  return md;
}

function ArchitectureTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <p className="text-xs text-faint mb-1">
          Canonical source:{' '}
          <code className="text-muted bg-surface-2 px-1 rounded">
            .claude/.claude/context/systems/nexus-sources-of-truth.md
          </code>
        </p>
        <p className="text-sm text-muted">
          Every authoritative file in Nexus — the ones where data lives and everything else derives
          from. Changes to any file here may cascade to dependent systems.
        </p>
      </div>

      {/* Configuration Files */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <CardHeader
          title="Configuration Files"
          getText={() =>
            '## Configuration Files\n\n' +
            mdTable(
              ['File', 'Source of Truth For', 'Format'],
              SOT_CONFIG.map((r) => [`\`${r.file}\``, r.purpose, r.format]),
            )
          }
        />
        <p className="text-xs text-faint mb-3">
          Define the rules. Changes here cascade to all consumers.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-subtle">
                <th className="text-left py-2 pr-3">File</th>
                <th className="text-left py-2 px-3">Source of Truth For</th>
                <th className="text-left py-2 px-3">Format</th>
              </tr>
            </thead>
            <tbody className="text-tertiary">
              {SOT_CONFIG.map((r) => (
                <tr key={r.file} className="border-b border-default last:border-0">
                  <td className="py-2 pr-3 font-mono text-cyan-400/80 whitespace-nowrap">
                    {r.file}
                  </td>
                  <td className="py-2 px-3">{r.purpose}</td>
                  <td className="py-2 px-3 text-faint">{r.format}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chokepoint Scripts */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <CardHeader
          title="Chokepoint Scripts"
          getText={() =>
            '## Chokepoint Scripts\n\n' +
            mdTable(
              ['File', 'Authoritative For', 'Must Mirror'],
              SOT_SCRIPTS.map((r) => [`\`${r.file}\``, r.purpose, `\`${r.mirrors}\``]),
            )
          }
        />
        <p className="text-xs text-faint mb-3">
          Implement the rules. Must stay in sync with configuration files.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-subtle">
                <th className="text-left py-2 pr-3">File</th>
                <th className="text-left py-2 px-3">Authoritative For</th>
                <th className="text-left py-2 px-3">Must Mirror</th>
              </tr>
            </thead>
            <tbody className="text-tertiary">
              {SOT_SCRIPTS.map((r) => (
                <tr key={r.file} className="border-b border-default last:border-0">
                  <td className="py-2 pr-3 font-mono text-indigo-400/80 whitespace-nowrap">
                    {r.file}
                  </td>
                  <td className="py-2 px-3">{r.purpose}</td>
                  <td className="py-2 px-3 font-mono text-amber-400/60">{r.mirrors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Persona System */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <CardHeader
          title="Persona System"
          getText={() =>
            '## Persona System\n\nEach persona at `.claude/jobs/personas/<name>/` has: `prompt.md`, `config.yaml`, `permissions.yaml`.\n\nActive: ' +
            [
              'task-reviewer',
              'analyst',
              'autofix-executor',
              'aurora-action',
              'aurora-builder',
              'aurora-feedback',
              'aurora-presenter',
              'aurora-thinker',
              'infrastructure-deployer',
              'investigator',
              'librarian',
              'pipeline-reviewer',
              'researcher',
              'task-evaluator',
              'task-investigator',
              'troubleshooter',
            ]
              .map((p) => `\`${p}\``)
              .join(', ')
          }
        />
        <p className="text-xs text-faint mb-3">
          Each persona at{' '}
          <code className="text-muted bg-surface-2 px-1 rounded">
            .claude/jobs/personas/&lt;name&gt;/
          </code>{' '}
          has: <code className="text-muted">prompt.md</code> (system prompt),{' '}
          <code className="text-muted">config.yaml</code> (limits),{' '}
          <code className="text-muted">permissions.yaml</code> (tool allowlist).
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'task-reviewer',
            'analyst',
            'autofix-executor',
            'aurora-action',
            'aurora-builder',
            'aurora-feedback',
            'aurora-presenter',
            'aurora-thinker',
            'infrastructure-deployer',
            'investigator',
            'librarian',
            'pipeline-reviewer',
            'researcher',
            'task-evaluator',
            'task-investigator',
            'troubleshooter',
          ].map((p) => (
            <span
              key={p}
              className="text-xs font-mono bg-surface-2 text-tertiary px-2 py-1 rounded border border-subtle"
            >
              {p}
            </span>
          ))}
        </div>
        <p className="text-xs text-faint mt-3">
          Task Reviewer also has{' '}
          <code className="text-muted bg-surface-2 px-1 rounded">learned-patterns.yaml</code>{' '}
          (decision patterns from feedback) and{' '}
          <code className="text-muted bg-surface-2 px-1 rounded">feedback.jsonl</code> (learning
          data).
        </p>
      </div>

      {/* Runtime State */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <CardHeader
          title="Runtime State"
          getText={() =>
            '## Runtime State\n\n' +
            mdTable(
              ['File', 'Authoritative For', 'Written By'],
              SOT_STATE.map((r) => [`\`${r.file}\``, r.purpose, r.writer]),
            )
          }
        />
        <p className="text-xs text-faint mb-3">
          Mutated at runtime by Nexus scripts. Do NOT edit manually.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-subtle">
                <th className="text-left py-2 pr-3">File</th>
                <th className="text-left py-2 px-3">Authoritative For</th>
                <th className="text-left py-2 px-3">Written By</th>
              </tr>
            </thead>
            <tbody className="text-tertiary">
              {SOT_STATE.map((r) => (
                <tr key={r.file} className="border-b border-default last:border-0">
                  <td className="py-2 pr-3 font-mono text-emerald-400/80 whitespace-nowrap">
                    {r.file}
                  </td>
                  <td className="py-2 px-3">{r.purpose}</td>
                  <td className="py-2 px-3 text-faint">{r.writer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Trails */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <CardHeader
          title="Audit Trails"
          getText={() =>
            '## Audit Trails\n\n' +
            mdTable(
              ['File', 'Records', 'Written By'],
              SOT_AUDIT.map((r) => [`\`${r.file}\``, r.purpose, r.writer]),
            )
          }
        />
        <p className="text-xs text-faint mb-3">Append-only logs. Never truncate or overwrite.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-subtle">
                <th className="text-left py-2 pr-3">File</th>
                <th className="text-left py-2 px-3">Records</th>
                <th className="text-left py-2 px-3">Written By</th>
              </tr>
            </thead>
            <tbody className="text-tertiary">
              {SOT_AUDIT.map((r) => (
                <tr key={r.file} className="border-b border-default last:border-0">
                  <td className="py-2 pr-3 font-mono text-amber-400/80 whitespace-nowrap">
                    {r.file}
                  </td>
                  <td className="py-2 px-3">{r.purpose}</td>
                  <td className="py-2 px-3 text-faint">{r.writer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Update Cascades */}
      <div className="rounded-lg border border-red-500/20 bg-surface-1 p-4">
        <CardHeader
          title="Dangerous Update Cascades"
          borderColor="text-red-400"
          getText={() =>
            '## Dangerous Update Cascades\n\n' +
            mdTable(
              ['If You Change', 'Must Also Update', 'Why'],
              SOT_CASCADES.map((r) => [`\`${r.changed}\``, r.update, r.reason]),
            )
          }
        />
        <p className="text-xs text-faint mb-3">
          When you change one of these, you MUST update all dependents.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-subtle">
                <th className="text-left py-2 pr-3">If You Change</th>
                <th className="text-left py-2 px-3">Must Also Update</th>
                <th className="text-left py-2 px-3">Why</th>
              </tr>
            </thead>
            <tbody className="text-tertiary">
              {SOT_CASCADES.map((r) => (
                <tr key={r.changed} className="border-b border-default last:border-0">
                  <td className="py-2 pr-3 font-mono text-red-400/80 whitespace-nowrap">
                    {r.changed}
                  </td>
                  <td className="py-2 px-3">{r.update}</td>
                  <td className="py-2 px-3 text-faint">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs text-amber-400">
            Known gap: No automated check validates that{' '}
            <code className="bg-surface-2 px-1 rounded">routing-rules.yaml</code> and{' '}
            <code className="bg-surface-2 px-1 rounded">routing-helpers.sh</code> stay in sync.
            Manual code review only.
          </p>
        </div>
      </div>

      {/* Reference Documentation */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <CardHeader
          title="Reference Documentation"
          getText={() =>
            '## Reference Documentation\n\n' +
            mdTable(
              ['File', 'Documents'],
              SOT_DOCS.map((r) => [`\`${r.file}\``, r.purpose]),
            )
          }
        />
        <p className="text-xs text-faint mb-3">
          Human-maintained docs that describe the system. Must stay accurate.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-subtle">
                <th className="text-left py-2 pr-3">File</th>
                <th className="text-left py-2 px-3">Documents</th>
              </tr>
            </thead>
            <tbody className="text-tertiary">
              {SOT_DOCS.map((r) => (
                <tr key={r.file} className="border-b border-default last:border-0">
                  <td className="py-2 pr-3 font-mono text-muted whitespace-nowrap">{r.file}</td>
                  <td className="py-2 px-3">{r.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ReferencePage() {
  const [activeTab, setActiveTab] = useState<DocTab>('overview');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const { data, isLoading } = useLiveLabels();
  const { data: blockedData } = useBlockedReasons();

  const categories = data?.categories ?? [];

  return (
    <div className="space-y-6 max-w-4xl">
      <Header title="Nexus Documentation" />

      <p className="text-sm text-muted">
        Nexus is the autonomous operations platform — dispatcher, executor, persona system, message
        bus, task automation pipeline, and observability.
        {data && (
          <span className="text-faint ml-2">
            ({data.totalTasks} tasks scanned · updated {new Date(data.lastUpdated).toLocaleString()}
            )
          </span>
        )}
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-default">
        {DOC_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-secondary hover:border-default'
            }`}
            title={tab.desc}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab actions toolbar */}
      <div className="flex items-center gap-2">
        <CopyButton
          label="Copy Tab"
          getText={() => {
            if (activeTab === 'overview') return mdOverviewTab();
            if (activeTab === 'labels')
              return mdLabelsTab(
                categories as LabelCategory[],
                (data?.groups ?? []) as LabelGroup[],
              );
            if (activeTab === 'pipeline') return mdPipelineTab();
            if (activeTab === 'architecture') return mdArchitectureTab();
            return '';
          }}
        />
        <CopyButton
          label="Copy All"
          getText={() =>
            [
              mdOverviewTab(),
              mdLabelsTab(categories as LabelCategory[], (data?.groups ?? []) as LabelGroup[]),
              mdPipelineTab(),
              mdArchitectureTab(),
            ].join('\n\n---\n\n')
          }
        />
        <DownloadButton
          label="Download .md"
          filename="nexus-documentation.md"
          getText={() =>
            [
              mdOverviewTab(),
              mdLabelsTab(categories as LabelCategory[], (data?.groups ?? []) as LabelGroup[]),
              mdPipelineTab(),
              mdArchitectureTab(),
            ].join('\n\n---\n\n')
          }
        />
        <button
          onClick={() => window.print()}
          className="text-[10px] px-2 py-1 rounded border border-default text-faint hover:text-secondary hover:bg-surface-2 transition-colors"
          title="Print page / Save as PDF"
        >
          Print
        </button>
      </div>

      {/* ===== OVERVIEW TAB ===== */}
      {activeTab === 'overview' && (
        <>
          {/* Shared color key */}
          <div className="rounded-lg border border-default bg-surface-1/50 px-4 py-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[11px]">
              <span className="text-muted font-medium mr-1">Color key</span>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ borderColor: '#9ca3af60', backgroundColor: '#9ca3af15' }}
                />
                <span style={{ color: '#9ca3af' }}>Backlog</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ borderColor: '#a78bfa60', backgroundColor: '#a78bfa15' }}
                />
                <span style={{ color: '#a78bfa' }}>Ready</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ borderColor: '#38bdf860', backgroundColor: '#38bdf815' }}
                />
                <span style={{ color: '#38bdf8' }}>In Progress</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ borderColor: '#34d39960', backgroundColor: '#34d39915' }}
                />
                <span style={{ color: '#34d399' }}>Done</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ borderColor: '#f8717160', backgroundColor: '#f8717115' }}
                />
                <span style={{ color: '#f87171' }}>Blocked</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border"
                  style={{ borderColor: '#6b728060', backgroundColor: '#6b728015' }}
                />
                <span style={{ color: '#6b7280' }}>Deferred</span>
              </div>
              <span className="text-disabled mx-1">|</span>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded border border-cyan-500/40 bg-cyan-500/10" />
                <span className="text-cyan-400/80">Source</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border border-amber-400/40"
                  style={{ borderStyle: 'dashed' }}
                />
                <span className="text-amber-400/80">Human gate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded border border-indigo-400/40"
                  style={{ borderStyle: 'dashed' }}
                />
                <span className="text-indigo-400/80">Process</span>
              </div>
              <span className="text-disabled mx-1">|</span>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="8">
                  <line x1="0" y1="4" x2="14" y2="4" stroke="#34d399" strokeWidth="1.5" />
                </svg>
                <span className="text-emerald-400/70">Automated</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="8">
                  <line x1="0" y1="4" x2="14" y2="4" stroke="#f59e0b" strokeWidth="1.5" />
                </svg>
                <span className="text-amber-400/70">Human</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="8">
                  <line x1="0" y1="4" x2="14" y2="4" stroke="#60a5fa" strokeWidth="1.5" />
                </svg>
                <span className="text-accent-text/70">Either</span>
              </div>
            </div>
          </div>

          {/* Board lifecycle — high-level "where is my stuff" view */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Project Lifecycle</h2>
            <p className="text-xs text-faint mb-2">
              How tasks move between board columns. Arrow colors match the key above.
            </p>
            <BoardLifecycleDiagram />
          </div>

          {/* Pipeline process diagram — detailed automation internals */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">
              Task Lifecycle{' '}
              <span className="text-xs font-normal text-faint">— stage pipeline detail</span>
            </h2>
            <p className="text-xs text-faint mb-3">
              Tasks flow through explicit{' '}
              <code className="text-amber-400/80 bg-surface-2 px-1 rounded">stage:</code> labels:
              intake → evaluate → route → review → queue → execute → CLOSED. Each task has exactly
              one stage label. Rounded nodes are states, dashed boxes are processes.
            </p>
            <ProcessDiagram />
          </div>

          {/* Workflow views — how tasks are classified into dashboard views */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Workflow Views</h2>
            <p className="text-xs text-muted mb-3">
              The task list groups tasks into workflow views based on status + labels. These map to
              the filter buttons and Kanban board columns.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-subtle">
                    <th className="text-left py-2 pr-3">View</th>
                    <th className="text-left py-2 px-3">What it means</th>
                    <th className="text-left py-2 px-3">Classification rule</th>
                  </tr>
                </thead>
                <tbody className="text-tertiary">
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-accent-text">In Progress</td>
                    <td className="py-2 px-3">Actively being worked on by Nexus or human</td>
                    <td className="py-2 px-3 text-muted font-mono">status = in_progress</td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-amber-400">Ready</td>
                    <td className="py-2 px-3">Evaluated, scored, and eligible for execution</td>
                    <td className="py-2 px-3 text-muted font-mono">
                      auto:ready OR stage:queue (no blocker labels)
                    </td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-red-400">Blocked</td>
                    <td className="py-2 px-3">
                      Can't move forward — needs human approval, input, or external event
                    </td>
                    <td className="py-2 px-3 text-muted font-mono">
                      waiting:david | waiting:external | needs-input | manual-action |
                      pipeline:needs-approval
                    </td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-tertiary">Backlog</td>
                    <td className="py-2 px-3">
                      Not yet evaluated, or auto:candidate awaiting investigation
                    </td>
                    <td className="py-2 px-3 text-muted font-mono">
                      open, no auto:ready, no blocker, no defer
                    </td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-muted">Deferred</td>
                    <td className="py-2 px-3">On hold — valid work, deliberately paused</td>
                    <td className="py-2 px-3 text-muted font-mono">
                      status = deferred | parked | label contains "defer"
                    </td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-muted">Closed</td>
                    <td className="py-2 px-3">Recently completed (within archive threshold)</td>
                    <td className="py-2 px-3 text-muted font-mono">
                      status = closed, closed_at &lt; archive_days ago
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-stone-400">Archived</td>
                    <td className="py-2 px-3">
                      Completed tasks older than archive threshold — kept for reference
                    </td>
                    <td className="py-2 px-3 text-muted font-mono">
                      status = closed, closed_at &ge; archive_days ago (default: 7 days)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== LABELS TAB ===== */}
      {activeTab === 'labels' && (
        <>
          <p className="text-xs text-faint">
            Canonical source:{' '}
            <code className="text-muted bg-surface-2 px-1 rounded">
              .claude/.claude/context/tools/label-taxonomy.yaml
            </code>{' '}
            — all label definitions, mutual exclusions, blocker rules, board classification, and
            state transitions are defined there.
          </p>

          {/* Label categories — LIVE from actual task data, grouped by function */}
          {isLoading && <p className="text-sm text-faint">Loading labels...</p>}

          {(data?.groups ?? []).map((group) => {
            const groupCats = categories.filter((c) => c.group === group.key);
            if (groupCats.length === 0) return null;
            return (
              <div key={group.key} className="space-y-3">
                <div className="border-b border-subtle pb-2">
                  <h2 className="text-sm font-semibold text-secondary">
                    {group.name}
                    <span className="text-xs font-normal text-faint ml-2">live from task data</span>
                  </h2>
                  <p className="text-xs text-faint mt-1">{group.description}</p>
                </div>

                {groupCats.map((cat) => {
                  const isOpen = activeSection === cat.prefix;
                  const openCount = cat.labels.reduce(
                    (s: number, l: { open: number }) => s + l.open,
                    0,
                  );
                  const blockerCount = cat.labels
                    .filter((l: { label: string }) => BLOCKER_LABELS.has(l.label))
                    .reduce((s: number, l: { open: number }) => s + l.open, 0);
                  return (
                    <div
                      key={cat.prefix}
                      className="rounded-lg border border-default bg-surface-1 overflow-hidden"
                    >
                      <button
                        onClick={() => setActiveSection(isOpen ? null : cat.prefix)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-surface-2/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block rounded border px-2 py-0.5 text-xs font-mono ${getLabelColor(cat.prefix)}`}
                          >
                            {cat.prefix === 'status' ? 'standalone' : `${cat.prefix}:`}
                          </span>
                          <span className="text-sm font-medium text-secondary">{cat.name}</span>
                          {cat.function && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                cat.function === 'position'
                                  ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10'
                                  : cat.function === 'gate'
                                    ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                                    : cat.function === 'authorization'
                                      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                                      : cat.function === 'attribute'
                                        ? 'text-purple-400 border-purple-500/30 bg-purple-500/10'
                                        : 'text-muted border-b-muted bg-surface-2'
                              }`}
                            >
                              {cat.function}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {blockerCount > 0 && (
                            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5">
                              {blockerCount} blocking
                            </span>
                          )}
                          <span className="text-xs text-faint">{cat.labels.length} labels</span>
                          <span className="text-xs text-disabled">{openCount} active</span>
                          <span className="text-faint">{isOpen ? '\u25B2' : '\u25BC'}</span>
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-default p-3 space-y-1">
                          <p className="text-xs text-muted mb-3">{cat.description}</p>
                          <div className="grid gap-1">
                            {cat.labels.map(
                              (l: { label: string; open: number; closed: number }) => (
                                <div key={l.label} className="flex items-center gap-3 text-sm py-1">
                                  <code
                                    className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-mono ${getLabelColor(cat.prefix)}`}
                                  >
                                    {l.label}
                                  </code>
                                  {BLOCKER_LABELS.has(l.label) && l.open > 0 && (
                                    <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/25 rounded px-1 py-0.5">
                                      blocks execution
                                    </span>
                                  )}
                                  <div className="flex items-center gap-2 ml-auto text-xs">
                                    <span className="text-tertiary">{l.open} open</span>
                                    {l.closed > 0 && (
                                      <span className="text-disabled">{l.closed} closed</span>
                                    )}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Mutual Exclusions — labels that can't coexist */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Mutual Exclusions</h2>
            <p className="text-xs text-faint mb-3">
              Labels within the same set cannot coexist on a task. When adding one, all others in
              the set must be removed. Violations indicate a broken state that needs cleanup.
            </p>
            <div className="space-y-2">
              {[
                {
                  set: [
                    'stage:intake',
                    'stage:evaluate',
                    'stage:route',
                    'stage:review',
                    'stage:queue',
                    'stage:execute',
                  ],
                  desc: 'Exactly one pipeline stage per task',
                },
                {
                  set: ['auto:ready', 'auto:candidate'],
                  desc: 'Either ready to execute or still a candidate',
                },
                {
                  set: ['pipeline:approved', 'pipeline:needs-approval'],
                  desc: 'Either approved or awaiting approval',
                },
                {
                  set: ['risk:safe', 'risk:moderate', 'risk:destructive'],
                  desc: 'Exactly one risk level per task',
                },
                {
                  set: ['waiting:david', 'waiting:external', 'waiting:subtasks', 'waiting:session'],
                  desc: 'Ball can only be in one court',
                },
                {
                  set: ['review:pending', 'review:escalated', 'review:ready'],
                  desc: 'One review state at a time',
                },
                {
                  set: [
                    'parked',
                    'waiting:david',
                    'waiting:external',
                    'waiting:subtasks',
                    'waiting:session',
                    'blocked:dependency',
                  ],
                  desc: "Parked tasks are shelved — not in anyone's court",
                },
              ].map((rule, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 py-1.5 border-b border-default last:border-0"
                >
                  <div className="flex flex-wrap gap-1 shrink-0">
                    {rule.set.map((label) => (
                      <code
                        key={label}
                        className="text-[11px] font-mono bg-surface-2 text-tertiary px-1.5 py-0.5 rounded border border-subtle"
                      >
                        {label}
                      </code>
                    ))}
                  </div>
                  <span className="text-xs text-faint pt-0.5">{rule.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* State Transitions — what happens when you take an action */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">State Transitions</h2>
            <p className="text-xs text-faint mb-3">
              Named actions and the label changes they produce. These are enforced by the dashboard
              pipeline API.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-subtle">
                    <th className="text-left py-2 pr-3">Action</th>
                    <th className="text-left py-2 px-3">Adds</th>
                    <th className="text-left py-2 px-3">Removes</th>
                    <th className="text-left py-2 px-3">Description</th>
                  </tr>
                </thead>
                <tbody className="text-tertiary">
                  {[
                    {
                      action: 'approve',
                      adds: ['pipeline:approved', 'auto:ready', 'stage:queue'],
                      removes: [
                        'pipeline:needs-approval',
                        'auto:candidate',
                        'waiting:david',
                        'needs-input',
                        'stage:review',
                      ],
                      desc: 'Approve task for execution → stage:queue',
                    },
                    {
                      action: 'modify',
                      adds: ['stage:evaluate'],
                      removes: ['pipeline:needs-approval', 'stage:review', 'stage:route'],
                      desc: 'Send back for re-evaluation → stage:evaluate',
                    },
                    {
                      action: 'pause',
                      adds: ['parked', 'stage:review'],
                      removes: [
                        'pipeline:needs-approval',
                        'waiting:david',
                        'auto:ready',
                        'stage:queue',
                      ],
                      desc: 'Defer a task → stage:review',
                    },
                    {
                      action: 'cancel',
                      adds: [],
                      removes: ['pipeline:needs-approval', 'waiting:david'],
                      desc: 'Close without completing',
                    },
                    {
                      action: 'route-to-david',
                      adds: ['waiting:david'],
                      removes: ['waiting:external'],
                      desc: "Route to David's queue",
                    },
                    {
                      action: 'route-to-queue',
                      adds: ['auto:candidate'],
                      removes: ['waiting:david', 'waiting:external'],
                      desc: 'Route to automation queue',
                    },
                    {
                      action: 'unpark',
                      adds: [],
                      removes: ['parked'],
                      desc: 'Resume a deferred task',
                    },
                    {
                      action: 'claim',
                      adds: ['stage:execute'],
                      removes: ['waiting:david', 'parked', 'stage:queue'],
                      desc: 'Start working → stage:execute',
                    },
                    {
                      action: 'executor-fail',
                      adds: ['parked', 'stage:review'],
                      removes: ['auto:ready', 'stage:execute', 'stage:queue'],
                      desc: 'Auto-execution failed → stage:review',
                    },
                    {
                      action: 'route-to-session',
                      adds: ['waiting:session', 'stage:review'],
                      removes: [
                        'waiting:david',
                        'blocked:dependency',
                        'waiting:external',
                        'auto:ready',
                        'stage:route',
                        'stage:queue',
                      ],
                      desc: 'Too complex for Nexus — needs CLI session',
                    },
                    {
                      action: 'route-to-external',
                      adds: ['waiting:external', 'stage:review'],
                      removes: [
                        'waiting:david',
                        'blocked:dependency',
                        'stage:route',
                        'stage:queue',
                      ],
                      desc: 'Waiting on external dependency',
                    },
                    {
                      action: 'complete',
                      adds: [],
                      removes: ['stage:*'],
                      desc: 'Mark task as done (close task)',
                    },
                    {
                      action: 'evaluate',
                      adds: ['stage:evaluate'],
                      removes: ['stage:intake'],
                      desc: 'Task evaluator picks up intake task',
                    },
                    {
                      action: 'evaluate-complete-route',
                      adds: ['stage:route', 'auto:candidate'],
                      removes: ['stage:evaluate'],
                      desc: 'Evaluation done, needs routing',
                    },
                    {
                      action: 'evaluate-complete-fasttrack',
                      adds: ['stage:queue', 'auto:ready'],
                      removes: ['stage:evaluate'],
                      desc: 'Evaluation done, fast-tracked (risk:safe)',
                    },
                    {
                      action: 'dispatch',
                      adds: ['stage:execute'],
                      removes: ['stage:queue', 'auto:ready'],
                      desc: 'Executor picks up a queued task',
                    },
                  ].map((t) => (
                    <tr key={t.action} className="border-b border-default last:border-0">
                      <td className="py-2 pr-3 font-medium font-mono text-amber-300">{t.action}</td>
                      <td className="py-2 px-3">
                        {t.adds.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.adds.map((l) => (
                              <code key={l} className="text-emerald-400/80 text-[10px]">
                                +{l}
                              </code>
                            ))}
                          </div>
                        ) : (
                          <span className="text-disabled">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {t.removes.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {t.removes.map((l) => (
                              <code key={l} className="text-red-400/80 text-[10px]">
                                -{l}
                              </code>
                            ))}
                          </div>
                        ) : (
                          <span className="text-disabled">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-faint">{t.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Deprecated Labels — migration guide */}
          <div className="rounded-lg border border-amber-500/20 bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-amber-300 mb-3">Deprecated Labels</h2>
            <p className="text-xs text-faint mb-3">
              These labels should be migrated when encountered. If you see them in the live data
              above, they need cleanup.
            </p>
            <div className="space-y-2">
              {[
                {
                  old: 'pipeline:evaluated',
                  replacement: 'stage: progression',
                  reason: 'Replaced by stage lifecycle — stage advancement implies evaluation',
                },
                {
                  old: 'pipeline:task-reviewer-approved',
                  replacement: 'pipeline:approved',
                  reason: 'Consolidated into single approval label',
                },
                {
                  old: 'pipeline:modified',
                  replacement: 'stage:evaluate (re-evaluate)',
                  reason: 'Replaced by stage transition — re-evaluation is a stage rewind',
                },
                {
                  old: 'auto-approved',
                  replacement: 'pipeline:approved',
                  reason: 'Legacy standalone label',
                },
                {
                  old: 'auto:blocked',
                  replacement: 'use status field or blocker labels',
                  reason: 'Ambiguous — be specific about why',
                },
                {
                  old: 'gap:no-executor',
                  replacement: 'blocked:dependency',
                  reason: 'Capability gaps use blocked:dependency + capability label',
                },
                {
                  old: 'waiting:pipeline',
                  replacement: 'blocked:dependency',
                  reason: 'Redundant — use blocked:dependency for pipeline blocks',
                },
                {
                  old: 'waiting:nexus',
                  replacement: 'blocked:dependency',
                  reason:
                    'Removed in session 325 — stages handle routing, blocked:dependency handles project deps',
                },
              ].map((d) => (
                <div
                  key={d.old}
                  className="flex items-center gap-3 py-1.5 border-b border-default last:border-0"
                >
                  <code className="text-xs font-mono line-through text-faint bg-surface-2 px-1.5 py-0.5 rounded">
                    {d.old}
                  </code>
                  <span className="text-disabled">→</span>
                  <code className="text-xs font-mono text-emerald-400 bg-surface-2 px-1.5 py-0.5 rounded">
                    {d.replacement}
                  </code>
                  <span className="text-xs text-disabled">{d.reason}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Blocked Reasons — computed filter, not stored labels */}
          {blockedData && blockedData.totalBlocked > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-surface-1 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-secondary">
                  Blocked Reasons
                  <span className="text-xs font-normal text-faint ml-2">computed from labels</span>
                </h2>
                <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded px-2 py-0.5">
                  {blockedData.totalBlocked} of {blockedData.totalOpen} open tasks blocked
                </span>
              </div>
              <p className="text-xs text-faint">
                Virtual categories derived from existing labels — not stored as separate labels. Use{' '}
                <code className="text-muted bg-surface-2 px-1 rounded">
                  ?blockedReason=decision
                </code>{' '}
                to filter the task API.
              </p>
              <div className="grid gap-1.5">
                {blockedData.reasons.map((r) => (
                  <div
                    key={r.reason}
                    className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-surface-2/50"
                  >
                    <span className="shrink-0 rounded border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs font-mono text-red-400">
                      {r.reason}
                    </span>
                    <span className="text-sm text-tertiary">{r.label}</span>
                    <span className="text-xs text-faint hidden sm:inline">{r.description}</span>
                    <div className="ml-auto flex items-center gap-3 shrink-0">
                      <span className="text-xs text-faint">
                        from{' '}
                        {r.derivedFrom.map((d) => (
                          <code key={d} className="text-muted bg-surface-2 px-1 rounded mx-0.5">
                            {d}
                          </code>
                        ))}
                      </span>
                      <span className="text-xs font-medium text-red-400">{r.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== PIPELINE TAB ===== */}
      {activeTab === 'pipeline' && (
        <>
          {/* Nexus Operations — what's running in the background */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">
              Nexus Operations{' '}
              <span className="text-xs font-normal text-faint">— what runs in the background</span>
            </h2>
            <p className="text-xs text-faint mb-2">
              All headless jobs managed by the dispatcher. Generators create new tasks from
              monitoring. Pipeline jobs move tasks toward completion. All schedules respect quiet
              hours (10PM–7AM weekdays, 11PM–9AM weekends).
            </p>
            <NexusOperationsDiagram />
          </div>

          {/* Execution matrix */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Execution Matrix</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-subtle">
                    <th className="text-left py-2 pr-3"></th>
                    <th className="text-left py-2 px-3">risk:safe</th>
                    <th className="text-left py-2 px-3">risk:moderate</th>
                    <th className="text-left py-2 px-3">risk:destructive</th>
                  </tr>
                </thead>
                <tbody className="text-tertiary">
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-purple-300">auto:ready</td>
                    <td className="py-2 px-3 text-emerald-400">Auto-execute (batch)</td>
                    <td className="py-2 px-3 text-yellow-400">Individual approve</td>
                    <td className="py-2 px-3 text-red-400">Manual only</td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-purple-300">auto:candidate</td>
                    <td className="py-2 px-3 text-muted">Suggested in digest</td>
                    <td className="py-2 px-3 text-muted">Manual only</td>
                    <td className="py-2 px-3 text-red-400">Manual only</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-purple-300">waiting:david</td>
                    <td className="py-2 px-3 text-muted">Manual</td>
                    <td className="py-2 px-3 text-muted">Manual</td>
                    <td className="py-2 px-3 text-red-400">Manual</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Execution Eligibility — per-executor pickup criteria */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Execution Eligibility</h2>
            <p className="text-xs text-faint mb-3">
              Each executor has specific pickup criteria. Tasks at{' '}
              <code className="text-amber-400/80 bg-surface-2 px-1 rounded">stage:queue</code> are
              matched to executors by capability and risk level.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-subtle">
                    <th className="text-left py-2 pr-3">Executor</th>
                    <th className="text-left py-2 px-3">Eligible If</th>
                    <th className="text-left py-2 px-3">Capability</th>
                    <th className="text-left py-2 px-3">Skip If Any</th>
                  </tr>
                </thead>
                <tbody className="text-tertiary">
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-indigo-300">task-executor</td>
                    <td className="py-2 px-3 font-mono text-muted">
                      stage:queue AND (risk:safe OR pipeline:approved)
                    </td>
                    <td className="py-2 px-3">
                      <code className="text-emerald-400/80">file-ops, code</code>
                    </td>
                    <td className="py-2 px-3 text-faint">
                      waiting:david, needs-input, type:research, parked, capability:infrastructure
                    </td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-indigo-300">infra-deployer</td>
                    <td className="py-2 px-3 font-mono text-muted">
                      stage:queue AND capability:infrastructure AND (risk:safe OR risk:moderate)
                    </td>
                    <td className="py-2 px-3">
                      <code className="text-emerald-400/80">infrastructure</code>
                    </td>
                    <td className="py-2 px-3 text-faint">
                      waiting:david, needs-input, parked, risk:destructive
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-indigo-300">task-research</td>
                    <td className="py-2 px-3 font-mono text-muted">
                      stage:queue AND pipeline:approved AND type:research
                    </td>
                    <td className="py-2 px-3">
                      <code className="text-emerald-400/80">research</code>
                    </td>
                    <td className="py-2 px-3 text-faint">waiting:david, needs-input, parked</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Gate-Stage Validation — where gate labels belong */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Gate-Stage Validation</h2>
            <p className="text-xs text-faint mb-3">
              Gate labels are only meaningful at their associated stage. Presence at the wrong stage
              is a data integrity issue flagged by the pipeline-watchdog.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-subtle">
                    <th className="text-left py-2 pr-3">Gate Label</th>
                    <th className="text-left py-2 px-3">Valid Stage(s)</th>
                  </tr>
                </thead>
                <tbody className="text-tertiary">
                  {[
                    { gate: 'waiting:david', stages: 'review' },
                    { gate: 'waiting:external', stages: 'review' },
                    { gate: 'waiting:subtasks', stages: 'review' },
                    { gate: 'waiting:session', stages: 'review' },
                    { gate: 'needs-input', stages: 'review' },
                    { gate: 'manual-action', stages: 'review' },
                    { gate: 'pipeline:needs-approval', stages: 'review' },
                    { gate: 'auto:candidate', stages: 'route' },
                    { gate: 'auto:ready', stages: 'queue, execute' },
                    { gate: 'blocked:dependency', stages: 'queue' },
                    { gate: 'aurora:executing', stages: 'execute' },
                    { gate: 'review:pending', stages: 'review' },
                    { gate: 'review:escalated', stages: 'review' },
                    { gate: 'review:ready', stages: 'review' },
                  ].map((r) => (
                    <tr key={r.gate} className="border-b border-default last:border-0">
                      <td className="py-1.5 pr-3">
                        <code className="text-xs font-mono text-amber-300">{r.gate}</code>
                      </td>
                      <td className="py-1.5 px-3 font-mono text-muted">stage:{r.stages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Source Trust Levels — how task origin affects approval */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Source Trust Levels</h2>
            <p className="text-xs text-faint mb-3">
              The <code className="text-cyan-400/80 bg-surface-2 px-1 rounded">source:</code> label
              affects how aggressively tasks are auto-approved.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-subtle">
                    <th className="text-left py-2 pr-3">Trust Level</th>
                    <th className="text-left py-2 px-3">Sources</th>
                    <th className="text-left py-2 px-3">Auto-Approve</th>
                  </tr>
                </thead>
                <tbody className="text-tertiary">
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-emerald-400">High</td>
                    <td className="py-2 px-3">
                      <code className="text-muted">claude-code, priority, project</code>
                    </td>
                    <td className="py-2 px-3">risk:safe</td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-yellow-400">Medium</td>
                    <td className="py-2 px-3">
                      <code className="text-muted">session, claude-app</code>
                    </td>
                    <td className="py-2 px-3">risk:safe</td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3 font-medium text-cyan-400">System</td>
                    <td className="py-2 px-3">
                      <code className="text-muted">headless</code>
                    </td>
                    <td className="py-2 px-3">risk:safe</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 font-medium text-red-400">Low</td>
                    <td className="py-2 px-3">
                      <code className="text-muted">ad-hoc</code>
                    </td>
                    <td className="py-2 px-3 text-faint">None — always requires review</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Capability Routing — which executor handles what */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Capability Routing</h2>
            <p className="text-xs text-faint mb-3">
              The <code className="text-emerald-400/80 bg-surface-2 px-1 rounded">capability:</code>{' '}
              label determines which executor picks up a task from the queue.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted border-b border-subtle">
                    <th className="text-left py-2 pr-3">Capability</th>
                    <th className="text-left py-2 px-3">Executor</th>
                    <th className="text-left py-2 px-3">Persona</th>
                  </tr>
                </thead>
                <tbody className="text-tertiary">
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3">
                      <code className="text-emerald-400/80">capability:infrastructure</code>
                    </td>
                    <td className="py-2 px-3">task-executor-infra</td>
                    <td className="py-2 px-3 text-muted">infrastructure-deployer</td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3">
                      <code className="text-emerald-400/80">capability:research</code>
                    </td>
                    <td className="py-2 px-3">task-research</td>
                    <td className="py-2 px-3 text-muted">researcher</td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3">
                      <code className="text-emerald-400/80">capability:code</code>
                    </td>
                    <td className="py-2 px-3">task-executor</td>
                    <td className="py-2 px-3 text-muted">autofix-executor</td>
                  </tr>
                  <tr className="border-b border-default">
                    <td className="py-2 pr-3">
                      <code className="text-emerald-400/80">capability:file-ops</code>
                    </td>
                    <td className="py-2 px-3">task-executor</td>
                    <td className="py-2 px-3 text-muted">autofix-executor</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-3 text-faint italic">none (default)</td>
                    <td className="py-2 px-3">task-executor</td>
                    <td className="py-2 px-3 text-muted">autofix-executor</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Safety rails */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <h2 className="text-sm font-semibold text-secondary mb-3">Safety Rails</h2>
            <ul className="text-xs text-muted space-y-1.5">
              <li>Max 10 tasks per executor run, 5 for infra-deployer</li>
              <li>Git stash checkpoint before any changes</li>
              <li>task-executor never touches: audio files, Docker, SSH, git push, own config</li>
              <li>
                infra-deployer: 10-min timeout per task, always health-checks after deploy, rollback
                on failure
              </li>
              <li>
                Dispatcher watchdog alerts via Telegram if scheduling stalls (15-min heartbeat
                check)
              </li>
              <li>
                Pipeline watchdog validates label integrity every 5 min (gate-stage rules, mutex,
                deprecated cleanup)
              </li>
              <li>All execution logged to .claude/logs/headless/executions/</li>
              <li>Label mutation audit trail: .claude/data/label-mutations.jsonl</li>
              <li>
                Quiet hours enforced: weekdays 10PM–7AM, weekends 11PM–9AM MT (severity:critical
                bypasses)
              </li>
            </ul>
          </div>
        </>
      )}

      {/* ===== ARCHITECTURE TAB ===== */}
      {activeTab === 'architecture' && <ArchitectureTab />}
    </div>
  );
}
