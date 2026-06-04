// GraphView — Phase 1.4 Canvas+force rewrite (v5 design §4.4).
//
// "PRIMARY DIFFERENTIATOR". Custom Canvas 2D renderer with built-in force
// simulation (charge repulsion + link springs + center gravity). Bloom/glow
// via Canvas shadowBlur. Pan/zoom via wheel + background drag.
// No external dependencies — force sim is ~50 lines.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePersonaGraph, type PersonaGraphNode, type PersonaGraphEdge } from '../../api/personas';
import { CLUSTERS, resolveCluster } from '../../lib/persona-clusters';

const TIER_COLOR: Record<string, string> = {
  A: '#52525b', B: '#52525b', C: '#9333ea', D: '#0ea5e9',
};
const FAMILY_COLOR: Record<string, string> = {
  'Built-in': '#71717a', MCP: '#14b8a6', Command: '#f97316', Skill: '#0ea5e9',
};
const EDGE_COLOR: Record<string, string> = {
  allowed: '#10b981', denied: '#f43f5e', binding: '#eab308', mentions: '#71717a',
};

interface SimNode {
  id: string;
  label: string;
  type: string;
  tier?: string;
  cluster?: string | null;
  family?: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  pinned: boolean;
}

function resolveColor(n: PersonaGraphNode): string {
  if (n.type === 'persona') {
    const c = resolveCluster(n.label, n.cluster ?? null);
    if (c) return CLUSTERS[c].hex;
    if (n.tier) return TIER_COLOR[n.tier] ?? '#3f3f46';
  } else if (n.type === 'tool') {
    return FAMILY_COLOR[n.family ?? ''] ?? '#52525b';
  } else if (n.type === 'job') {
    return '#eab308';
  }
  return '#3f3f46';
}

function initSim(nodes: PersonaGraphNode[], cx: number, cy: number): SimNode[] {
  return nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    const r = n.type === 'persona' ? 200 : n.type === 'job' ? 40 : 350;
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      tier: n.tier,
      cluster: n.cluster,
      family: n.family,
      x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 40,
      y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      radius: n.type === 'persona' ? 8 : n.type === 'job' ? 6 : 4,
      color: resolveColor(n),
      pinned: false,
    };
  });
}

function tick(
  simNodes: SimNode[],
  edges: PersonaGraphEdge[],
  nodeIndex: Map<string, number>,
  cx: number,
  cy: number,
  alpha: number,
): void {
  const n = simNodes.length;
  const charge = -120;
  const spring = 0.008;
  const idealLen = 80;
  const center = 0.01;
  const damping = 0.85;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = simNodes[j].x - simNodes[i].x;
      const dy = simNodes[j].y - simNodes[i].y;
      const dist2 = dx * dx + dy * dy + 1;
      const f = (charge * alpha) / dist2;
      const fx = (dx / Math.sqrt(dist2)) * f;
      const fy = (dy / Math.sqrt(dist2)) * f;
      simNodes[i].vx -= fx;
      simNodes[i].vy -= fy;
      simNodes[j].vx += fx;
      simNodes[j].vy += fy;
    }
  }

  for (const e of edges) {
    const si = nodeIndex.get(e.source);
    const ti = nodeIndex.get(e.target);
    if (si === undefined || ti === undefined) continue;
    const s = simNodes[si], t = simNodes[ti];
    const dx = t.x - s.x, dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (dist - idealLen) * spring * alpha;
    const fx = (dx / dist) * f, fy = (dy / dist) * f;
    s.vx += fx; s.vy += fy;
    t.vx -= fx; t.vy -= fy;
  }

  for (let i = 0; i < n; i++) {
    simNodes[i].vx += (cx - simNodes[i].x) * center * alpha;
    simNodes[i].vy += (cy - simNodes[i].y) * center * alpha;
  }

  for (let i = 0; i < n; i++) {
    if (simNodes[i].pinned) { simNodes[i].vx = 0; simNodes[i].vy = 0; continue; }
    simNodes[i].vx *= damping;
    simNodes[i].vy *= damping;
    simNodes[i].x += simNodes[i].vx;
    simNodes[i].y += simNodes[i].vy;
  }
}

function draw(
  ctx: CanvasRenderingContext2D,
  simNodes: SimNode[],
  edges: PersonaGraphEdge[],
  nodeIndex: Map<string, number>,
  w: number,
  h: number,
  cam: { x: number; y: number; zoom: number },
  hoverIdx: number | null,
) {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2 + cam.x, h / 2 + cam.y);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-w / 2, -h / 2);

  for (const e of edges) {
    const si = nodeIndex.get(e.source);
    const ti = nodeIndex.get(e.target);
    if (si === undefined || ti === undefined) continue;
    const s = simNodes[si], t = simNodes[ti];
    const isHover = hoverIdx !== null && (si === hoverIdx || ti === hoverIdx);
    ctx.strokeStyle = EDGE_COLOR[e.kind] ?? '#71717a';
    ctx.globalAlpha = isHover ? 0.8 : 0.15;
    ctx.lineWidth = isHover ? 1.5 : 0.5;
    if (e.kind === 'denied') ctx.setLineDash([4, 2]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  for (let i = 0; i < simNodes.length; i++) {
    const n = simNodes[i];
    const isHover = i === hoverIdx;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    if (isHover) {
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 18;
    }
    ctx.fillStyle = n.color;
    ctx.globalAlpha = n.type === 'tool' ? 0.55 : 0.85;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (n.type !== 'tool' || isHover) {
      ctx.fillStyle = isHover ? '#ffffff' : '#d4d4d8';
      ctx.font = `${isHover ? 10 : 9}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(n.label.length > 16 ? n.label.slice(0, 14) + '…' : n.label, n.x, n.y + n.radius + 2);
    }
  }

  ctx.restore();
}

export const GraphView = memo(function GraphView() {
  const { data, isLoading, isError } = usePersonaGraph();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const alphaRef = useRef(1);
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });
  const hoverRef = useRef<number | null>(null);
  const dragRef = useRef<{ type: 'node' | 'pan'; idx: number; startX: number; startY: number } | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  const nodeIndex = useMemo(() => {
    const m = new Map<string, number>();
    data?.nodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!data || data.nodes.length === 0) return;
    simRef.current = initSim(data.nodes, size.w / 2, size.h / 2);
    alphaRef.current = 1;
    camRef.current = { x: 0, y: 0, zoom: 1 };
  }, [data, size.w, size.h]);

  useEffect(() => {
    if (!data || data.nodes.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let raf: number;

    const loop = () => {
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
      canvas.style.width = `${size.w}px`;
      canvas.style.height = `${size.h}px`;

      if (alphaRef.current > 0.001) {
        tick(simRef.current, data.edges, nodeIndex, size.w / 2, size.h / 2, alphaRef.current);
        alphaRef.current *= 0.995;
      }
      draw(ctx, simRef.current, data.edges, nodeIndex, size.w, size.h, camRef.current, hoverRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, nodeIndex, size]);

  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = camRef.current;
    const { w, h } = size;
    return {
      x: (sx - w / 2 - cam.x) / cam.zoom + w / 2,
      y: (sy - h / 2 - cam.y) / cam.zoom + h / 2,
    };
  }, [size]);

  const findNode = useCallback((sx: number, sy: number) => {
    const { x, y } = screenToWorld(sx, sy);
    for (let i = simRef.current.length - 1; i >= 0; i--) {
      const n = simRef.current[i];
      const dx = x - n.x, dy = y - n.y;
      if (dx * dx + dy * dy <= (n.radius + 4) * (n.radius + 4)) return i;
    }
    return null;
  }, [screenToWorld]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    if (dragRef.current) {
      const d = dragRef.current;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (d.type === 'pan') {
        camRef.current.x += dx;
        camRef.current.y += dy;
      } else {
        const node = simRef.current[d.idx];
        if (node) {
          const cam = camRef.current;
          node.x += dx / cam.zoom;
          node.y += dy / cam.zoom;
          alphaRef.current = Math.max(alphaRef.current, 0.1);
        }
      }
      d.startX = e.clientX;
      d.startY = e.clientY;
      return;
    }

    const idx = findNode(sx, sy);
    hoverRef.current = idx;
    setHoverLabel(idx !== null ? simRef.current[idx].label : null);
    if (canvasRef.current) canvasRef.current.style.cursor = idx !== null ? 'pointer' : 'grab';
  }, [findNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const idx = findNode(sx, sy);
    if (idx !== null) {
      simRef.current[idx].pinned = true;
      dragRef.current = { type: 'node', idx, startX: e.clientX, startY: e.clientY };
    } else {
      dragRef.current = { type: 'pan', idx: -1, startX: e.clientX, startY: e.clientY };
    }
  }, [findNode]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current?.type === 'node') {
      simRef.current[dragRef.current.idx].pinned = false;
    }
    dragRef.current = null;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const idx = findNode(e.clientX - rect.left, e.clientY - rect.top);
    if (idx === null) return;
    const n = simRef.current[idx];
    if (n.type === 'persona') {
      const name = n.id.replace('persona:', '');
      navigate(`/personas/${name}`);
    }
  }, [findNode, navigate]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    camRef.current.zoom = Math.max(0.1, Math.min(5, camRef.current.zoom * factor));
  }, []);

  if (isLoading) return <div className="py-12 text-center text-faint">Loading graph…</div>;
  if (isError || !data)
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load /api/v1/persona-graph.
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-default bg-surface-1 p-3 text-xs">
        <span className="text-faint">
          {data.nodes.length} nodes ({data.nodes.filter((n) => n.type === 'persona').length} persona /{' '}
          {data.nodes.filter((n) => n.type === 'tool').length} tool /{' '}
          {data.nodes.filter((n) => n.type === 'job').length} job) ·{' '}
          {data.edges.length} edges
        </span>
        {hoverLabel && <span className="text-secondary">→ {hoverLabel}</span>}
        <span className="ml-auto text-disabled italic">
          Canvas + force sim + bloom. Drag nodes, scroll to zoom, drag background to pan.
        </span>
      </div>

      <div
        ref={containerRef}
        className="rounded-lg border border-default bg-surface-1 overflow-hidden"
        style={{ height: 'calc(100vh - 280px)', minHeight: 540 }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { handleMouseUp(); hoverRef.current = null; setHoverLabel(null); }}
          onClick={handleClick}
          onWheel={handleWheel}
          style={{ width: size.w, height: size.h }}
        />
      </div>

      {data.edges.length === 0 && (
        <p className="text-[11px] text-amber-300/80 italic">
          No edges yet — persona_tool_assignments is empty. Permissions backfill populates
          ~30 persona × ~15 tool edges each. Nodes render disconnected until then.
        </p>
      )}
    </div>
  );
});
