// Timeline — Phase 1.3 add-on surface (v5 design §5.3).
//
// Canvas Gantt swimlane: per-row actor, horizontal time axis, color-coded
// event blocks. Click a block to navigate to the actor's detail panel
// (Activity sub-tab is the default sub-view for personas).
//
// Data source pragmatism: backend falls back from `persona_activity_snapshots`
// (token-rich, design-intended) to `decision_events` when the snapshots table
// is empty. UI labels the active source.
//
// Window selector: 1h / 6h / 24h / 7d (matches backend interval map).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  usePersonaTimeline,
  type TimelineEvent,
  type TimelineWindow,
} from '../../api/personas';

const WINDOWS: TimelineWindow[] = ['1h', '6h', '24h', '7d'];

// Window → milliseconds for the X-axis domain.
const WINDOW_MS: Record<TimelineWindow, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

// Color palette — by event_type hash. Stable per type across renders.
const PALETTE = [
  '#34d399', // emerald
  '#60a5fa', // sky
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#f87171', // rose
  '#fb7185', // pink
  '#22d3ee', // cyan
  '#fde047', // yellow
];

function colorForType(type: string): string {
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = (hash * 31 + type.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// Row + bbox cache for hit-testing.
interface EventBox {
  event: TimelineEvent;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ROW_HEIGHT = 22;
const ROW_GAP = 4;
const AXIS_HEIGHT = 22;
const LABEL_WIDTH = 140;
const BLOCK_MIN_WIDTH = 3;
const BLOCK_HEIGHT = 14;

function formatRange(windowMs: number): { axisTicks: number; labelFmt: (d: Date) => string } {
  if (windowMs <= 60 * 60 * 1000) {
    return {
      axisTicks: 6,
      labelFmt: (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    };
  }
  if (windowMs <= 24 * 60 * 60 * 1000) {
    return {
      axisTicks: 6,
      labelFmt: (d) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    };
  }
  return {
    axisTicks: 7,
    labelFmt: (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  };
}

interface TooltipState {
  event: TimelineEvent;
  pageX: number;
  pageY: number;
}

export function TimelineView() {
  const [windowKey, setWindowKey] = useState<TimelineWindow>('1h');
  const { data, isLoading, isError } = usePersonaTimeline(windowKey);
  const navigate = useNavigate();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef<EventBox[]>([]);
  const [width, setWidth] = useState(800);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [drawerEvent, setDrawerEvent] = useState<TimelineEvent | null>(null);

  // Track container width responsively.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build per-actor row index. Sorted by event count desc, so heaviest row at top.
  const rows = useMemo(() => {
    if (!data) return [] as string[];
    const counts = new Map<string, number>();
    for (const e of data.events) counts.set(e.persona, (counts.get(e.persona) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([actor]) => actor);
  }, [data]);

  const eventTypeLegend = useMemo(() => {
    if (!data) return [] as Array<{ type: string; color: string }>;
    const types = new Set<string>();
    for (const e of data.events) types.add(e.type);
    return Array.from(types)
      .sort()
      .map((t) => ({ type: t, color: colorForType(t) }));
  }, [data]);

  const height = useMemo(
    () => AXIS_HEIGHT + Math.max(1, rows.length) * (ROW_HEIGHT + ROW_GAP),
    [rows.length],
  );

  // Draw whenever data, window, or width changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    const now = Date.now();
    const windowMs = WINDOW_MS[windowKey];
    const t0 = now - windowMs;
    const t1 = now;
    const plotLeft = LABEL_WIDTH;
    const plotWidth = Math.max(20, width - LABEL_WIDTH - 8);
    const plotRight = plotLeft + plotWidth;

    const xFor = (ts: number) => {
      const frac = (ts - t0) / (t1 - t0);
      return plotLeft + frac * plotWidth;
    };

    // Background grid.
    ctx.fillStyle = '#09090b';
    ctx.fillRect(plotLeft, AXIS_HEIGHT, plotWidth, height - AXIS_HEIGHT);

    // Time axis ticks.
    const { axisTicks, labelFmt } = formatRange(windowMs);
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.font = '10px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#71717a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= axisTicks; i++) {
      const x = plotLeft + (i / axisTicks) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, AXIS_HEIGHT);
      ctx.lineTo(x, height);
      ctx.stroke();
      const ts = t0 + (i / axisTicks) * (t1 - t0);
      ctx.fillText(labelFmt(new Date(ts)), x, AXIS_HEIGHT / 2);
    }

    // Row separators + labels.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#a1a1aa';
    for (let i = 0; i < rows.length; i++) {
      const yTop = AXIS_HEIGHT + i * (ROW_HEIGHT + ROW_GAP);
      const yMid = yTop + ROW_HEIGHT / 2;
      // Row stripe (alternating background for readability).
      if (i % 2 === 0) {
        ctx.fillStyle = '#0f0f12';
        ctx.fillRect(plotLeft, yTop, plotWidth, ROW_HEIGHT);
      }
      // Actor label (left of plot).
      ctx.fillStyle = '#d4d4d8';
      ctx.fillText(rows[i], LABEL_WIDTH - 6, yMid);
    }

    // Event blocks.
    const boxes: EventBox[] = [];
    const rowIndex = new Map<string, number>();
    rows.forEach((r, i) => rowIndex.set(r, i));

    for (const e of data.events) {
      const ri = rowIndex.get(e.persona);
      if (ri === undefined) continue;
      const ts = new Date(e.fired_at).getTime();
      if (ts < t0 || ts > t1) continue;
      const x = xFor(ts);
      const w = BLOCK_MIN_WIDTH;
      const yTop = AXIS_HEIGHT + ri * (ROW_HEIGHT + ROW_GAP) + (ROW_HEIGHT - BLOCK_HEIGHT) / 2;
      ctx.fillStyle = colorForType(e.type);
      ctx.fillRect(x - w / 2, yTop, w, BLOCK_HEIGHT);
      // Soft glow for legibility against the stripe.
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeRect(x - w / 2, yTop, w, BLOCK_HEIGHT);
      boxes.push({ event: e, x: x - w / 2, y: yTop, w, h: BLOCK_HEIGHT });
    }

    // Top axis separator.
    ctx.strokeStyle = '#3f3f46';
    ctx.beginPath();
    ctx.moveTo(plotLeft, AXIS_HEIGHT);
    ctx.lineTo(plotRight, AXIS_HEIGHT);
    ctx.stroke();

    boxesRef.current = boxes;
  }, [data, rows, windowKey, width, height]);

  // Hit-test mouse over canvas.
  const handleMouseMove = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    // Generous hit area: expand each block by 3px horizontally.
    const hit = boxesRef.current.find(
      (b) => x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y && y <= b.y + b.h,
    );
    if (hit) {
      setTooltip({ event: hit.event, pageX: ev.clientX, pageY: ev.clientY });
      canvas.style.cursor = 'pointer';
    } else {
      setTooltip(null);
      canvas.style.cursor = 'default';
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    const c = canvasRef.current;
    if (c) c.style.cursor = 'default';
  };

  const handleClick = (ev: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const hit = boxesRef.current.find(
      (b) => x >= b.x - 3 && x <= b.x + b.w + 3 && y >= b.y && y <= b.y + b.h,
    );
    if (!hit) return;
    // Strip 'persona:' / 'system:' prefix when routing to detail panel.
    // 'persona:reviewer' -> 'reviewer'; 'system:executor' has no registered
    // detail panel — guard with a check.
    const actor = hit.event.persona;
    const colon = actor.indexOf(':');
    const name = colon >= 0 ? actor.slice(colon + 1) : actor;
    if (actor.startsWith('persona:')) {
      navigate(`/personas/${name}`);
    } else {
      setDrawerEvent(hit.event);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-faint">Loading timeline…</div>;
  if (isError || !data)
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load /api/v1/persona-timeline.
      </div>
    );

  const sourceLabel =
    data.source === 'activity_snapshots'
      ? 'persona_activity_snapshots'
      : 'decision_events (fallback)';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-faint">
          window: <span className="text-tertiary">{data.window}</span>
          {'  '}·{'  '}
          source: <span className="text-tertiary">{sourceLabel}</span>
          {'  '}·{'  '}
          events: <span className="text-tertiary">{data.events.length}</span>
          {'  '}·{'  '}
          actors: <span className="text-tertiary">{rows.length}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setWindowKey(w)}
              className={`rounded px-2 py-1 ${
                windowKey === w
                  ? 'bg-accent/15 text-accent-text'
                  : 'bg-surface-1 text-tertiary hover:bg-surface-2'
              }`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      {eventTypeLegend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[10px] text-faint">
          <span className="text-disabled">event types:</span>
          {eventTypeLegend.map(({ type, color }) => (
            <span key={type} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-tertiary">{type}</span>
            </span>
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative overflow-hidden rounded border border-default bg-surface-1"
      >
        {data.events.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-faint">
            No events in this window.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
          />
        )}
      </div>

      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded border border-default bg-surface-2 px-2 py-1.5 text-[10px] text-secondary shadow-lg"
          style={{
            left: Math.min(tooltip.pageX + 12, window.innerWidth - 240),
            top: tooltip.pageY + 12,
            maxWidth: 240,
          }}
        >
          <div className="font-medium text-primary">{tooltip.event.persona}</div>
          <div className="text-tertiary">
            type: <span className="text-secondary">{tooltip.event.type}</span>
          </div>
          {tooltip.event.outcome && (
            <div className="text-tertiary">
              outcome: <span className="text-secondary">{tooltip.event.outcome}</span>
            </div>
          )}
          <div className="text-faint">{new Date(tooltip.event.fired_at).toLocaleString()}</div>
          {tooltip.event.thread_id && (
            <div className="truncate text-faint" title={tooltip.event.thread_id}>
              thread: {tooltip.event.thread_id.slice(0, 16)}…
            </div>
          )}
        </div>
      )}

      <div className="text-[10px] text-disabled">
        Click a persona block to open its detail panel. Click a system block to view event info.
      </div>

      {drawerEvent && (
        <div
          className="fixed inset-0 z-40 flex justify-end"
          onClick={() => setDrawerEvent(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setDrawerEvent(null); }}
          role="dialog"
          tabIndex={-1}
        >
          <div className="absolute inset-0 bg-black/40" />
          <aside
            className="relative z-50 w-80 overflow-y-auto border-l border-default bg-surface-1 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">Event Info</h3>
              <button onClick={() => setDrawerEvent(null)} className="text-faint hover:text-secondary">✕</button>
            </div>
            <dl className="space-y-2 text-xs">
              <div>
                <dt className="text-faint">Actor</dt>
                <dd className="text-secondary">{drawerEvent.persona}</dd>
              </div>
              <div>
                <dt className="text-faint">Event type</dt>
                <dd className="text-secondary">{drawerEvent.type}</dd>
              </div>
              {drawerEvent.outcome && (
                <div>
                  <dt className="text-faint">Outcome</dt>
                  <dd className="text-secondary">{drawerEvent.outcome}</dd>
                </div>
              )}
              <div>
                <dt className="text-faint">Timestamp</dt>
                <dd className="text-secondary">{new Date(drawerEvent.fired_at).toLocaleString()}</dd>
              </div>
              {drawerEvent.thread_id && (
                <div>
                  <dt className="text-faint">Thread ID</dt>
                  <dd className="break-all font-mono text-[10px] text-secondary">{drawerEvent.thread_id}</dd>
                </div>
              )}
            </dl>
          </aside>
        </div>
      )}
    </div>
  );
}
