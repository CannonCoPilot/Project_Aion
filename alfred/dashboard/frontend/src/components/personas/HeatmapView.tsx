// Heatmap — Phase 1.3 add-on surface (v5 design §5.5).
//
// Four PoC visualizations across the past window_days (default 7d):
//   1. Calendar heatmap (DOW × hour intensity)
//   2. Time-series trend (event count per actor per hour, line chart)
//   3. Ranked bar (top actors by event count)
//   4. Sankey diagram — custom SVG; actor → decision_type → outcome flow
//
// Data source pragmatism: backend falls back from `persona_activity_snapshots`
// (the design-intended source — token-rich) to `decision_events` when the
// snapshots table is empty. UI labels the active source so reviewers see
// the data provenance.
//
// Recharts (not D3) used per the v5 design's "D3 v7" suggestion — Recharts
// wraps D3 internally and is already in deps. Net-zero new dependency cost.

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts';
import { usePersonaHeatmap, type HeatmapCell, type SankeyFlow } from '../../api/personas';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ---- Calendar heatmap (7 × 24 grid with intensity coloring) ----

function CalendarHeatmap({ cells }: { cells: HeatmapCell[] }) {
  // Build a 7×24 lookup table; missing cells = 0.
  const grid = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const c of cells) {
      if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) {
        g[c.dow][c.hour] = c.count;
        if (c.count > max) max = c.count;
      }
    }
    return { g, max };
  }, [cells]);

  if (grid.max === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-faint">
        No activity in this window.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-0.5 pl-9 text-[8px] text-faint">
        {HOURS.map((h) => (
          <div key={h} className="w-3 text-center">{h % 6 === 0 ? h : ''}</div>
        ))}
      </div>
      {DOW_LABELS.map((label, dow) => (
        <div key={dow} className="flex items-center gap-0.5">
          <div className="w-8 pr-1 text-right text-[10px] text-faint">{label}</div>
          {HOURS.map((h) => {
            const count = grid.g[dow][h];
            const intensity = count === 0 ? 0 : Math.max(0.12, count / grid.max);
            return (
              <div
                key={h}
                className="h-3 w-3 rounded-sm border border-default/30"
                style={{
                  backgroundColor: count === 0
                    ? 'transparent'
                    : `rgba(56, 189, 248, ${intensity.toFixed(2)})`, // sky-400 ramp
                }}
                title={`${label} ${h}:00 — ${count} events`}
              />
            );
          })}
        </div>
      ))}
      <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-faint">
        <span>0</span>
        <div className="h-2 w-24 rounded-sm" style={{
          background: 'linear-gradient(to right, rgba(56,189,248,0.12), rgba(56,189,248,1))',
        }} />
        <span>{grid.max}</span>
      </div>
    </div>
  );
}

// ---- Time-series line chart (per-actor hourly event counts) ----

interface TrendChartProps {
  trends: Array<{ persona: string; bucket: string; event_count: number }>;
}

const LINE_COLORS = [
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f87171', // rose
  '#60a5fa', // sky
  '#a78bfa', // violet
  '#fb7185', // pink
];

function TrendChart({ trends }: TrendChartProps) {
  // Pivot to wide format: rows = bucket, columns = persona.
  const { rows, personas } = useMemo(() => {
    const personaSet = new Set<string>();
    const byBucket: Record<string, Record<string, number>> = {};
    for (const t of trends) {
      personaSet.add(t.persona);
      const b = new Date(t.bucket).getTime();
      const key = String(b);
      if (!byBucket[key]) byBucket[key] = { bucketMs: b };
      byBucket[key][t.persona] = t.event_count;
    }
    const rows = Object.values(byBucket).sort((a, b) => (a.bucketMs as number) - (b.bucketMs as number));
    return { rows, personas: Array.from(personaSet) };
  }, [trends]);

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-faint">
        No trend data.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={rows} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="bucketMs"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tickFormatter={(v) => new Date(Number(v)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })}
          tick={{ fontSize: 10, fill: '#71717a' }}
          stroke="#27272a"
        />
        <YAxis tick={{ fontSize: 10, fill: '#71717a' }} stroke="#27272a" />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11 }}
          labelFormatter={(label) => label != null ? new Date(Number(label)).toLocaleString() : ''}
        />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {personas.map((p, i) => (
          <Line
            key={p}
            type="monotone"
            dataKey={p}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- Ranked horizontal bar chart ----

function RankedBar({ rank }: { rank: Array<{ persona: string; event_count: number }> }) {
  if (rank.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-faint">
        No actor activity in this window.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(150, rank.length * 22)}>
      <BarChart data={rank} layout="vertical" margin={{ top: 5, right: 10, left: 80, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis type="number" tick={{ fontSize: 10, fill: '#71717a' }} stroke="#27272a" />
        <YAxis
          type="category"
          dataKey="persona"
          tick={{ fontSize: 10, fill: '#a1a1aa' }}
          stroke="#27272a"
          width={80}
        />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11 }}
        />
        <Bar dataKey="event_count" fill="#60a5fa" radius={[0, 2, 2, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Sankey diagram (actor → decision_type → outcome) ----

const SANKEY_COLORS = [
  '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa',
  '#fb7185', '#2dd4bf', '#e879f9', '#38bdf8', '#facc15',
];

function SankeyDiagram({ flows }: { flows: SankeyFlow[] }) {
  const layout = useMemo(() => {
    if (flows.length === 0) return null;

    const actors = [...new Set(flows.map((f) => f.actor))];
    const types = [...new Set(flows.map((f) => f.decision_type))];
    const outcomes = [...new Set(flows.map((f) => f.outcome))];

    const W = 440, H = Math.max(180, (actors.length + types.length + outcomes.length) * 14);
    const colX = [10, W / 2 - 30, W - 70];
    const nodeW = 60;

    type SNode = { id: string; col: number; x: number; y: number; h: number; total: number; label: string; color: string };
    type SLink = { x0: number; y0: number; x1: number; y1: number; w: number; color: string };

    const nodeMap = new Map<string, SNode>();

    const actorTotals = actors.map((a) => ({ a, t: flows.filter((f) => f.actor === a).reduce((s, f) => s + f.count, 0) }));
    const typeTotals = types.map((t) => ({ t, total: flows.filter((f) => f.decision_type === t).reduce((s, f) => s + f.count, 0) }));
    const outTotals = outcomes.map((o) => ({ o, total: flows.filter((f) => f.outcome === o).reduce((s, f) => s + f.count, 0) }));
    const maxTotal = Math.max(...actorTotals.map((a) => a.t), ...typeTotals.map((t) => t.total), ...outTotals.map((o) => o.total), 1);

    let yOff = 8;
    for (const { a, t } of actorTotals) {
      const h = Math.max(8, (t / maxTotal) * (H - 20));
      nodeMap.set(`a:${a}`, { id: `a:${a}`, col: 0, x: colX[0], y: yOff, h, total: t, label: a, color: SANKEY_COLORS[nodeMap.size % SANKEY_COLORS.length] });
      yOff += h + 4;
    }
    yOff = 8;
    for (const { t: ty, total } of typeTotals) {
      const h = Math.max(8, (total / maxTotal) * (H - 20));
      nodeMap.set(`t:${ty}`, { id: `t:${ty}`, col: 1, x: colX[1], y: yOff, h, total, label: ty, color: SANKEY_COLORS[nodeMap.size % SANKEY_COLORS.length] });
      yOff += h + 4;
    }
    yOff = 8;
    for (const { o, total } of outTotals) {
      const h = Math.max(8, (total / maxTotal) * (H - 20));
      nodeMap.set(`o:${o}`, { id: `o:${o}`, col: 2, x: colX[2], y: yOff, h, total, label: o, color: SANKEY_COLORS[nodeMap.size % SANKEY_COLORS.length] });
      yOff += h + 4;
    }

    const links: SLink[] = [];
    const srcOff = new Map<string, number>();
    const dstOff = new Map<string, number>();
    for (const f of flows) {
      const src = nodeMap.get(`a:${f.actor}`);
      const mid = nodeMap.get(`t:${f.decision_type}`);
      if (src && mid) {
        const w = Math.max(1, (f.count / maxTotal) * (H - 20));
        const so = srcOff.get(src.id) ?? 0;
        const di = dstOff.get(mid.id) ?? 0;
        links.push({ x0: src.x + nodeW, y0: src.y + so + w / 2, x1: mid.x, y1: mid.y + di + w / 2, w, color: src.color });
        srcOff.set(src.id, so + w);
        dstOff.set(mid.id, di + w);
      }
    }
    const srcOff2 = new Map<string, number>();
    const dstOff2 = new Map<string, number>();
    for (const f of flows) {
      const mid = nodeMap.get(`t:${f.decision_type}`);
      const dst = nodeMap.get(`o:${f.outcome}`);
      if (mid && dst) {
        const w = Math.max(1, (f.count / maxTotal) * (H - 20));
        const so = srcOff2.get(mid.id) ?? 0;
        const di = dstOff2.get(dst.id) ?? 0;
        links.push({ x0: mid.x + nodeW, y0: mid.y + so + w / 2, x1: dst.x, y1: dst.y + di + w / 2, w, color: mid.color });
        srcOff2.set(mid.id, so + w);
        dstOff2.set(dst.id, di + w);
      }
    }

    return { W, H, nodes: [...nodeMap.values()], links, nodeW };
  }, [flows]);

  if (!layout) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-faint">
        No decision flow data in this window.
      </div>
    );
  }

  const { W, H, nodes, links, nodeW } = layout;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }}>
      {links.map((l, i) => {
        const cx = (l.x0 + l.x1) / 2;
        return (
          <path
            key={i}
            d={`M${l.x0},${l.y0} C${cx},${l.y0} ${cx},${l.y1} ${l.x1},${l.y1}`}
            fill="none"
            stroke={l.color}
            strokeWidth={Math.max(1, l.w)}
            opacity={0.25}
          />
        );
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={2} fill={n.color} opacity={0.7} />
          <text
            x={n.col === 2 ? n.x + nodeW + 3 : n.x - 3}
            y={n.y + n.h / 2}
            dy="0.35em"
            textAnchor={n.col === 2 ? 'start' : 'end'}
            fill="#a1a1aa"
            fontSize={8}
          >
            {n.label.length > 18 ? n.label.slice(0, 16) + '…' : n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---- Root ----

export function HeatmapView() {
  const [windowDays, setWindowDays] = useState(7);
  const { data, isLoading, isError } = usePersonaHeatmap(windowDays);

  if (isLoading) {
    return <div className="py-12 text-center text-faint">Loading heatmap…</div>;
  }
  if (isError || !data) {
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load /api/v1/persona-heatmap.
      </div>
    );
  }

  const source = data.source ?? 'unknown';
  const sourceLabel = source === 'activity_snapshots'
    ? 'persona_activity_snapshots'
    : 'decision_events (fallback)';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-faint">
          window: <span className="text-tertiary">{data.window_days}d</span>
          {'  '}·{'  '}
          source: <span className="text-tertiary">{sourceLabel}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              className={`rounded px-2 py-1 ${
                windowDays === d
                  ? 'bg-accent/15 text-accent-text'
                  : 'bg-surface-1 text-tertiary hover:bg-surface-2'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel title="Activity by day-of-week × hour" subtitle={`${data.heatmap.length} cells`}>
          <CalendarHeatmap cells={data.heatmap} />
        </Panel>

        <Panel title="Event count by actor (hourly)" subtitle={`${data.trends.length} buckets`}>
          <TrendChart trends={data.trends} />
        </Panel>

        <Panel title="Ranked actors by event count" subtitle={`top ${data.rank.length}`}>
          <RankedBar rank={data.rank} />
        </Panel>

        <Panel title="Decision flow (Sankey)" subtitle={`${data.sankey.length} flows`}>
          <SankeyDiagram flows={data.sankey} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-default bg-surface-1 p-3">
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[11px] uppercase tracking-wider text-tertiary">{title}</h3>
        {subtitle && <span className="text-[9px] text-disabled">{subtitle}</span>}
      </header>
      <div className="min-h-[180px]">{children}</div>
    </section>
  );
}
