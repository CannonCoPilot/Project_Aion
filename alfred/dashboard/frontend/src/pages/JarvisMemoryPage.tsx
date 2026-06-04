import { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid,
  RadialBarChart, RadialBar, PolarAngleAxis,
  Treemap,
} from 'recharts';
import {
  useContextTimeline,
  useCompressionEffectiveness,
  useRagCollections,
  useLayerHealthHistory,
  useGraphitiOverview,
} from '../api/jarvis-memory.js';

interface FullState {
  timestamp: string;
  context: {
    tokens: number; used_pct: number; window_size: number;
    soft_threshold: number; hard_threshold: number;
    burn_rate_tpm: number; soft_eta_min: number; hard_eta_min: number;
    output_tokens_last: number; action: string;
  };
  cache: {
    hit_rate: number; read_tokens: number; creation_tokens: number;
    creation_5m: number; creation_1h: number;
  };
  jicm_cycle: {
    last_timestamp: string; method: string; llm_model: string;
    output_lines: number; output_bytes: number; duration_seconds: number;
    nlp_ratio: number; user_msg_count: number; session_state_stale_min: number;
  } | null;
  fullness: {
    scratchpad: { lines: number; cap: number; pct: number };
    insights: { entries: number; cap: number; bytes: number; pct: number };
    session_state: { bytes: number; age_min: number; fresh_threshold: number; stale_threshold: number };
    active_plan: { bytes: number; age_min: number };
    current_plans: { bytes: number; age_min: number };
    checkpoint: { age_min: number; bytes: number };
    self_corrections: { bytes: number; lines: number };
    context_window: { tokens: number; cap: number; pct: number };
  };
  force_loaded: {
    total_bytes: number;
    estimated_tokens: number;
    files: { name: string; bytes: number }[];
  };
  archives: { scratchpad: number; insights: number; checkpoints: number; session_states: number };
  connections: Record<string, { status: 'up' | 'down'; latency_ms: number; detail?: string }>;
  ingest: { last_at: string; chunks: number; dedup_score: number; dedup_threshold: number; collection: string } | null;
  processes: { watcher: { alive: boolean; pid: number | null } };
  signals: Record<string, 'present' | 'absent'>;
  git: { branch: string; ahead: number; dirty: number };
  focus: string;
  watcher_log: string[];
}

interface HealthData {
  overall: string;
  warnings: string[];
  layers: Record<string, { status: string; [k: string]: unknown }>;
  file_age_ms?: number;
}

const STATUS_COLORS: Record<string, string> = { ok: '#22c55e', warn: '#f59e0b', critical: '#ef4444', unknown: '#6b7280' };

function formatK(n: number): string { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n) }
function formatAge(min: number): string {
  if (min < 0) return '—';
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.round(min / 60)}h${min % 60}m`;
  return `${Math.round(min / 1440)}d`;
}
function formatTokensTick(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
function formatTs(ts: number): string {
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function GaugeBar({ pct, label, thresholds, height = 22 }: { pct: number; label: string; thresholds?: { soft?: number; hard?: number; auto?: number }; height?: number }) {
  const barColor = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '2px' }}>
        <span>{label}</span><span>{pct}%</span>
      </div>
      <div style={{ position: 'relative', height: `${height}px`, background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', height: '100%', width: `${Math.min(100, pct)}%`, background: barColor, transition: 'width 0.5s', borderRadius: '4px' }} />
        {thresholds?.soft != null && <div style={{ position: 'absolute', height: '100%', width: '2px', left: `${thresholds.soft}%`, background: '#f59e0b', opacity: 0.6 }} />}
        {thresholds?.hard != null && <div style={{ position: 'absolute', height: '100%', width: '2px', left: `${thresholds.hard}%`, background: '#ef4444', opacity: 0.7 }} />}
        {thresholds?.auto != null && <div style={{ position: 'absolute', height: '100%', width: '2px', left: `${thresholds.auto}%`, background: '#8b5cf6', opacity: 0.6 }} />}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem', padding: '0.75rem', border: '1px solid #334155', borderRadius: '8px', background: '#1e1b4b08' }}>
      <h3 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h3>
      {children}
    </div>
  );
}

function Metric({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <span style={{ marginRight: '1rem', fontSize: '0.8rem' }}>
      <span style={{ color: '#64748b' }}>{label}: </span>
      <span style={{ color: warn ? '#f59e0b' : '#e2e8f0' }}>{value}</span>
    </span>
  );
}

function SignalDot({ state }: { state: 'present' | 'absent' }) {
  return <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: state === 'present' ? '#f59e0b' : '#334155', marginRight: '4px' }} />;
}

// ── Analytics Tab ──────────────────────────────────────────────────────────────

function ContextWindowTimeline() {
  const [timelineHours, setTimelineHours] = useState(168);
  const { data, isLoading, isError } = useContextTimeline(timelineHours);

  const points = useMemo(() => (data?.points ?? []).map(p => ({ ts: p.ts, tokens: p.tokens })), [data]);
  const events = data?.events ?? [];
  const thresholds = data?.thresholds ?? { soft: 250000, hard: 300000, window: 1000000 };

  const eventColor = (type: string) => {
    if (type === 'compression') return '#3b82f6';
    if (type === 'rest') return '#22c55e';
    if (type === 'meditate') return '#8b5cf6';
    return '#64748b';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const tokens = payload[0]?.value as number;
    const nearEvent = events.find(e => Math.abs(e.ts - label) < 300);
    return (
      <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
        <div style={{ color: '#94a3b8', marginBottom: '2px' }}>{formatTs(label)}</div>
        <div style={{ color: '#e2e8f0' }}>{formatTokensTick(tokens)} tokens</div>
        {nearEvent && <div style={{ color: eventColor(nearEvent.type), marginTop: '2px' }}>{nearEvent.label}</div>}
      </div>
    );
  };

  return (
    <Section title="Context Window Timeline">
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {([24, 72, 168] as const).map(h => (
          <button
            key={h}
            onClick={() => setTimelineHours(h)}
            style={{
              padding: '2px 10px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid #334155', cursor: 'pointer',
              background: timelineHours === h ? '#3b82f6' : '#1e293b',
              color: timelineHours === h ? '#fff' : '#94a3b8',
            }}
          >
            {h}h
          </button>
        ))}
      </div>
      {isLoading && <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center' }}>Loading timeline...</div>}
      {isError && <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '1rem 0' }}>Timeline data unavailable</div>}
      {!isLoading && !isError && points.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center' }}>No timeline data yet</div>
      )}
      {!isLoading && points.length > 0 && (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <defs>
              <linearGradient id="ctxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="ts"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTs}
              tick={{ fill: '#64748b', fontSize: 10 }}
              scale="time"
            />
            <YAxis
              domain={[0, thresholds.window]}
              tickFormatter={formatTokensTick}
              tick={{ fill: '#64748b', fontSize: 10 }}
              width={42}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={thresholds.soft} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'soft', fill: '#f59e0b', fontSize: 9 }} />
            <ReferenceLine y={thresholds.hard} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'hard', fill: '#ef4444', fontSize: 9 }} />
            {events.map((ev, i) => (
              <ReferenceLine key={i} x={ev.ts} stroke={eventColor(ev.type)} strokeOpacity={0.6} strokeWidth={1} />
            ))}
            <Area type="monotone" dataKey="tokens" stroke="#3b82f6" strokeWidth={1.5} fill="url(#ctxGrad)" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.7rem', color: '#64748b' }}>
        <span style={{ color: '#3b82f6' }}>■ compression</span>
        <span style={{ color: '#22c55e' }}>■ rest</span>
        <span style={{ color: '#8b5cf6' }}>■ meditate</span>
      </div>
    </Section>
  );
}

function CompressionEfficiencyGauge() {
  const { data, isLoading, isError } = useCompressionEffectiveness();

  const value = data?.efficiency_pct ?? 0;
  const gaugeColor = value < 30 ? '#ef4444' : value < 60 ? '#f59e0b' : '#22c55e';
  const gaugeData = [{ value }];

  const components = data?.components ?? { preservation: 0, stage1_reduction: 0, dedup: 0 };
  const stats = data?.stats ?? { total_compressions: 0, avg_duration_s: 0, cumulative_tokens_saved: 0 };

  const bars = [
    { label: 'Preservation (40%)', pct: components.preservation },
    { label: 'Stage-1 Reduction (40%)', pct: components.stage1_reduction },
    { label: 'Dedup (20%)', pct: components.dedup },
  ];

  return (
    <Section title="Compression Efficiency">
      {isLoading && <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>Loading...</div>}
      {isError && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>Compression data unavailable</div>}
      {!isLoading && !isError && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '200px', height: '120px', flexShrink: 0 }}>
              <RadialBarChart
                width={200}
                height={120}
                cx={100}
                cy={110}
                innerRadius="70%"
                outerRadius="100%"
                startAngle={180}
                endAngle={0}
                data={gaugeData}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar
                  background={{ fill: '#1e293b' }}
                  dataKey="value"
                  fill={gaugeColor}
                  cornerRadius={4}
                />
              </RadialBarChart>
              <div style={{
                position: 'absolute', bottom: '8px', left: 0, right: 0,
                textAlign: 'center', pointerEvents: 'none',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: gaugeColor, lineHeight: 1 }}>{value}%</div>
                <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '2px' }}>Memory Efficiency</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              {bars.map(bar => (
                <div key={bar.label} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748b', marginBottom: '2px' }}>
                    <span>{bar.label}</span><span>{Math.round(bar.pct)}%</span>
                  </div>
                  <div style={{ height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, bar.pct)}%`, background: '#3b82f6', borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.8rem' }}>
            <Metric label="Compressions" value={stats.total_compressions} />
            <Metric label="Avg duration" value={`${stats.avg_duration_s.toFixed(1)}s`} />
            <Metric label="Tokens saved" value={formatTokensTick(stats.cumulative_tokens_saved)} />
          </div>
        </>
      )}
    </Section>
  );
}

function LayerHealthHeatmap() {
  const { data, isLoading, isError } = useLayerHealthHistory(72);
  const buckets = data?.buckets ?? [];

  const LAYER_KEYS = ['L1_sensory', 'L2_working', 'L3_shortterm', 'L4_declarative', 'L5_procedural', 'L6_meta'];
  const LAYER_LABELS: Record<string, string> = {
    L1_sensory: 'L1 Sensory', L2_working: 'L2 Working', L3_shortterm: 'L3 Short-Term',
    L4_declarative: 'L4 Declarative', L5_procedural: 'L5 Procedural', L6_meta: 'L6 Meta',
  };
  const cellColor = (status: string) => {
    if (status === 'ok') return '#22c55e';
    if (status === 'warn') return '#f59e0b';
    if (status === 'critical') return '#ef4444';
    return '#1e293b';
  };

  return (
    <Section title="Layer Health Heatmap (72h)">
      {isLoading && <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>Loading...</div>}
      {isError && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>Health history unavailable</div>}
      {!isLoading && !isError && buckets.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1.5rem 0', textAlign: 'center' }}>Insufficient telemetry data</div>
      )}
      {!isLoading && !isError && buckets.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          {LAYER_KEYS.map(layer => (
            <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span style={{ width: '110px', fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0, textAlign: 'right' }}>
                {LAYER_LABELS[layer]}
              </span>
              <div style={{ display: 'flex', gap: '2px' }}>
                {buckets.map((bucket, i) => (
                  <div
                    key={i}
                    title={`${formatTs(bucket.ts)} — ${bucket.layers[layer] ?? 'unknown'}`}
                    style={{
                      width: '12px', height: '12px', borderRadius: '2px',
                      background: cellColor(bucket.layers[layer] ?? ''),
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.7rem' }}>
            <span style={{ color: '#22c55e' }}>■ ok</span>
            <span style={{ color: '#f59e0b' }}>■ warn</span>
            <span style={{ color: '#ef4444' }}>■ critical</span>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Stores Tab ─────────────────────────────────────────────────────────────────

function RagCollectionsTreemap() {
  const { data, isLoading, isError } = useRagCollections();

  const collections = data?.collections ?? [];
  const treemapData = collections.map(c => ({
    name: c.name,
    size: c.points_count,
    fill: c.status === 'green' ? '#22c55e' : c.status === 'yellow' ? '#f59e0b' : '#3b82f6',
  }));

  const CustomContent = (props: any) => {
    const { x, y, width, height, name, fill } = props;
    if (width < 30 || height < 20) return <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0f172a" strokeWidth={1} />;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0f172a" strokeWidth={1} fillOpacity={0.85} />
        <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={10} fontWeight={600}>
          {name}
        </text>
      </g>
    );
  };

  return (
    <Section title="RAG Collections (Qdrant)">
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', fontSize: '0.8rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <Metric label="Total points" value={(data?.total_points ?? 0).toLocaleString()} />
        <Metric label="Collections" value={collections.length} />
        <span style={{ fontSize: '0.8rem' }}>
          <span style={{ color: data?.qdrant_up ? '#22c55e' : '#ef4444', marginRight: '4px' }}>●</span>
          <span style={{ color: '#94a3b8' }}>Qdrant {data?.qdrant_up ? 'up' : 'down'}</span>
        </span>
      </div>
      {isLoading && <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center' }}>Loading...</div>}
      {isError && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>RAG data unavailable</div>}
      {!isLoading && !isError && treemapData.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <Treemap
              data={treemapData}
              dataKey="size"
              stroke="#0f172a"
              content={<CustomContent />}
            />
          </ResponsiveContainer>
          <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>
            {collections.map(c => (
              <div key={c.name} style={{ padding: '0.4rem 0.6rem', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '0.75rem' }}>
                <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '2px' }}>{c.name}</div>
                <div style={{ color: '#64748b' }}>{c.points_count.toLocaleString()} pts · {c.indexed_count.toLocaleString()} idx</div>
                <div style={{ color: '#64748b' }}>{c.dimensions}d · <span style={{ color: c.status === 'green' ? '#22c55e' : '#f59e0b' }}>{c.status}</span></div>
              </div>
            ))}
          </div>
        </>
      )}
      {!isLoading && !isError && treemapData.length === 0 && (
        <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1.5rem 0', textAlign: 'center' }}>No collections found</div>
      )}
    </Section>
  );
}

function GraphitiOverview() {
  const { data, isLoading, isError } = useGraphitiOverview(30);

  const stats = data?.stats ?? { entities: 0, edges: 0, episodes: 0, communities: 0 };
  const topEntities = data?.top_entities ?? [];
  const recentEpisodes = data?.recent_episodes ?? [];
  const sampleGraph = data?.sample_graph ?? { nodes: [], edges: [] };

  const graphLayout = useMemo(() => {
    const nodes = sampleGraph.nodes;
    const edges = sampleGraph.edges;
    if (!nodes.length) return { nodes: [], edges: [] };

    const W = 600, H = 400, CX = W / 2, CY = H / 2, R = Math.min(CX, CY) - 40;
    const posMap: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      posMap[n.id] = { x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
    });

    // 50 spring-force iterations
    for (let iter = 0; iter < 50; iter++) {
      const forces: Record<string, { fx: number; fy: number }> = {};
      nodes.forEach(n => { forces[n.id] = { fx: 0, fy: 0 }; });

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = posMap[nodes[i].id], b = posMap[nodes[j].id];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = 3000 / (dist * dist);
          forces[nodes[i].id].fx += (dx / dist) * f;
          forces[nodes[i].id].fy += (dy / dist) * f;
          forces[nodes[j].id].fx -= (dx / dist) * f;
          forces[nodes[j].id].fy -= (dy / dist) * f;
        }
      }

      // Attraction along edges
      edges.forEach(e => {
        const a = posMap[e.source], b = posMap[e.target];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = dist * 0.05;
        forces[e.source].fx += (dx / dist) * f;
        forces[e.source].fy += (dy / dist) * f;
        forces[e.target].fx -= (dx / dist) * f;
        forces[e.target].fy -= (dy / dist) * f;
      });

      // Apply, clamped to canvas
      nodes.forEach(n => {
        const p = posMap[n.id];
        const f = forces[n.id];
        p.x = Math.max(20, Math.min(W - 20, p.x + f.fx * 0.1));
        p.y = Math.max(20, Math.min(H - 20, p.y + f.fy * 0.1));
      });
    }

    return {
      nodes: nodes.map(n => ({ ...n, ...posMap[n.id] })),
      edges: edges.map(e => ({
        ...e,
        x1: posMap[e.source]?.x ?? 0, y1: posMap[e.source]?.y ?? 0,
        x2: posMap[e.target]?.x ?? 0, y2: posMap[e.target]?.y ?? 0,
      })),
    };
  }, [sampleGraph]);

  const statCards = [
    { label: 'Entities', value: stats.entities },
    { label: 'Edges', value: stats.edges },
    { label: 'Episodes', value: stats.episodes },
    { label: 'Communities', value: stats.communities },
  ];

  return (
    <Section title="Graphiti Knowledge Graph">
      {isLoading && <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '2rem 0', textAlign: 'center' }}>Loading...</div>}
      {isError && <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>Graphiti data unavailable</div>}
      {!isLoading && !isError && (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
            {statCards.map(card => (
              <div key={card.label} style={{ padding: '0.6rem 0.75rem', background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#e2e8f0' }}>{card.value.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{card.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            {/* Top entities */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Top Entities</div>
              {topEntities.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No entities</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <tbody>
                    {topEntities.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '3px 4px', color: '#e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' }}>{e.name}</td>
                        <td style={{ padding: '3px 4px', color: '#64748b', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.summary}</td>
                        <td style={{ padding: '3px 4px', color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{e.edge_count} edges</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Recent episodes */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Recent Episodes</div>
              {recentEpisodes.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>No episodes</div>
              ) : (
                <div style={{ fontSize: '0.75rem' }}>
                  {recentEpisodes.map((ep, i) => (
                    <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ep.name}</span>
                      <span style={{ color: '#64748b', flexShrink: 0 }}>{ep.created_at ? new Date(ep.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Subgraph SVG */}
          <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Sample Subgraph</div>
          {graphLayout.nodes.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '0.8rem', padding: '1rem 0', textAlign: 'center' }}>Graph data unavailable</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #1e293b', borderRadius: '6px', background: '#0c1220' }}>
              <svg width={600} height={400} style={{ display: 'block' }}>
                {graphLayout.edges.map((e, i) => (
                  <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="#334155" strokeWidth={1} strokeOpacity={0.6} />
                ))}
                {graphLayout.nodes.map(n => (
                  <g key={n.id}>
                    <circle cx={n.x} cy={n.y} r={6} fill="#3b82f6" />
                    <text x={n.x + 9} y={n.y + 4} fontSize={8} fill="#94a3b8" style={{ userSelect: 'none' }}>
                      {n.name.length > 16 ? n.name.slice(0, 14) + '…' : n.name}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type TabId = 'overview' | 'analytics' | 'stores';

export default function JarvisMemoryPage() {
  const [state, setState] = useState<FullState | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [tab, setTab] = useState<TabId>('overview');

  // All analytics/stores hooks called unconditionally (React rules)
  const _timeline = useContextTimeline(168);
  const _compression = useCompressionEffectiveness();
  const _ragCollections = useRagCollections();
  const _layerHealth = useLayerHealthHistory(72);
  const _graphiti = useGraphitiOverview(30);
  void _timeline; void _compression; void _ragCollections; void _layerHealth; void _graphiti;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [stateRes, healthRes] = await Promise.all([
          fetch('/api/jarvis/full-state'),
          fetch('/api/jarvis/memory-health'),
        ]);
        setState(await stateRes.json());
        setHealth(await healthRes.json());
        setError(null);
        setLastRefresh(Date.now());
      } catch (e) {
        setError('Failed to fetch Jarvis state');
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  if (error) return <div style={{ padding: '2rem', color: '#ef4444' }}>{error}</div>;
  if (!state) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Connecting to Jarvis Memory System...</div>;

  const ctx = state.context;
  const cache = state.cache;
  const full = state.fullness;
  const healthWarnings = health?.warnings || [];
  const healthLayers = health?.layers || {};
  const overallStatus = health?.overall || 'unknown';
  const overallColor = STATUS_COLORS[overallStatus] || STATUS_COLORS.unknown;

  const softPct = Math.round((ctx.soft_threshold / ctx.window_size) * 100);
  const hardPct = Math.round((ctx.hard_threshold / ctx.window_size) * 100);
  const autoPct = 70;

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'stores', label: 'Stores' },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1000px', color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Jarvis Memory System</h1>
        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: overallColor, boxShadow: `0 0 8px ${overallColor}` }} />
        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>
          {ctx.action} · {formatK(ctx.tokens)} tok · refreshed {Math.round((Date.now() - lastRefresh) / 1000)}s ago
        </span>
      </div>

      {/* Warnings */}
      {healthWarnings.length > 0 && (
        <div style={{ padding: '0.5rem 0.75rem', marginBottom: '1rem', background: '#451a0320', border: '1px solid #78350f', borderRadius: '6px' }}>
          {healthWarnings.map((w, i) => <div key={i} style={{ color: '#fbbf24', fontSize: '0.8rem' }}>⚠ {w}</div>)}
        </div>
      )}

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', borderBottom: '1px solid #334155' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.85rem',
              background: '#0f172a',
              color: tab === t.id ? '#e2e8f0' : '#64748b',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab — all original content preserved */}
      {tab === 'overview' && (
        <>
          {/* Context Window Gauge */}
          <Section title="Context Window">
            <GaugeBar pct={ctx.used_pct} label={`${formatK(ctx.tokens)} / ${formatK(ctx.window_size)} tokens`} thresholds={{ soft: softPct, hard: hardPct, auto: autoPct }} height={26} />
            <div style={{ display: 'flex', fontSize: '0.7rem', color: '#64748b', gap: '1rem', marginTop: '4px' }}>
              <span>■ soft {softPct}%</span><span style={{ color: '#ef4444' }}>■ hard {hardPct}%</span><span style={{ color: '#8b5cf6' }}>■ auto {autoPct}%</span>
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <Metric label="Burn" value={`${ctx.burn_rate_tpm}/min`} />
              <Metric label="Soft ETA" value={ctx.soft_eta_min ? `${ctx.soft_eta_min}m` : '—'} />
              <Metric label="Hard ETA" value={ctx.hard_eta_min ? `${ctx.hard_eta_min}m` : '—'} />
              <Metric label="Last output" value={`${ctx.output_tokens_last} tok`} />
            </div>
          </Section>

          {/* Cache & Cost */}
          <Section title="Cache & Cost">
            <Metric label="Hit rate" value={`${(cache.hit_rate * 100).toFixed(0)}%`} />
            <Metric label="Read" value={formatK(cache.read_tokens)} />
            <Metric label="Create" value={formatK(cache.creation_tokens)} />
            <Metric label="5m" value={formatK(cache.creation_5m)} />
            <Metric label="1h" value={formatK(cache.creation_1h)} />
            {cache.creation_tokens > 0 && <Metric label="eph_1h" value={`${Math.round((cache.creation_1h / cache.creation_tokens) * 100)}%`} />}
          </Section>

          {/* File Fullness Gauges */}
          <Section title="Memory File Health">
            <GaugeBar pct={full.scratchpad.pct} label={`Scratchpad: ${full.scratchpad.lines} / ${full.scratchpad.cap} lines`} />
            <GaugeBar pct={full.insights.pct} label={`Insights Log: ${full.insights.entries} / ${full.insights.cap} entries (${(full.insights.bytes / 1024).toFixed(0)}KB)`} />
            <GaugeBar pct={full.context_window.pct} label={`Context Window: ${formatK(full.context_window.tokens)} / ${formatK(full.context_window.cap)}`} thresholds={{ soft: softPct, hard: hardPct }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.8rem' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Session State</div>
                <div style={{ color: full.session_state.age_min > full.session_state.stale_threshold ? '#f59e0b' : '#e2e8f0' }}>
                  {formatAge(full.session_state.age_min)} old · {((full.session_state.bytes || 0) / 1024).toFixed(1)}KB
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Active Plan</div>
                <div style={{ color: '#e2e8f0' }}>
                  {formatAge(full.active_plan?.age_min ?? -1)} old · {((full.active_plan?.bytes || 0) / 1024).toFixed(1)}KB
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Current Plans</div>
                <div style={{ color: '#e2e8f0' }}>
                  {formatAge(full.current_plans?.age_min ?? -1)} old · {((full.current_plans?.bytes || 0) / 1024).toFixed(1)}KB
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Checkpoint</div>
                <div style={{ color: full.checkpoint.age_min > 180 ? '#f59e0b' : '#e2e8f0' }}>
                  {formatAge(full.checkpoint.age_min)} old · {(full.checkpoint.bytes / 1024).toFixed(1)}KB
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Self-Corrections</div>
                <div style={{ color: '#e2e8f0' }}>
                  {full.self_corrections?.lines || 0} lines · {((full.self_corrections?.bytes || 0) / 1024).toFixed(1)}KB
                </div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Corrections JSONL</div>
                <div style={{ color: '#e2e8f0' }}>
                  {full.insights?.entries || 0} captured
                </div>
              </div>
            </div>
          </Section>

          {/* Force-Loaded Files (context budget) */}
          {state.force_loaded && (
            <Section title={`Force-Loaded Files (${formatK(state.force_loaded.estimated_tokens)} tokens always in context)`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {state.force_loaded.files.map(f => (
                  <div key={f.name} style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#1e293b', borderRadius: '4px', border: '1px solid #334155' }}>
                    <span style={{ color: '#94a3b8' }}>{f.name}</span>
                    <span style={{ color: '#64748b', marginLeft: '4px' }}>{(f.bytes / 1024).toFixed(1)}K</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                Total: {(state.force_loaded.total_bytes / 1024).toFixed(0)}KB ≈ {formatK(state.force_loaded.estimated_tokens)} tokens ({Math.round((state.force_loaded.estimated_tokens / state.context.window_size) * 100)}% of context window)
              </div>
            </Section>
          )}

          {/* Connection Health */}
          {state.connections && (
            <Section title="Service Connections">
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                {Object.entries(state.connections).map(([name, conn]) => (
                  <div key={name} style={{ fontSize: '0.8rem' }}>
                    <span style={{ color: conn.status === 'up' ? '#22c55e' : '#ef4444' }}>●</span>
                    {' '}<span style={{ color: '#e2e8f0' }}>{name}</span>
                    {' '}<span style={{ color: '#64748b' }}>({conn.latency_ms}ms)</span>
                    {conn.detail && <span style={{ color: '#94a3b8', marginLeft: '4px' }}>{conn.detail}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Archives */}
          {state.archives && (
            <Section title="Archive Counts">
              <Metric label="Scratchpad" value={state.archives.scratchpad} />
              <Metric label="Insights" value={state.archives.insights} />
              <Metric label="Checkpoints" value={state.archives.checkpoints} />
              <Metric label="Session states" value={state.archives.session_states} />
            </Section>
          )}

          {/* JICM Cycle */}
          <Section title="JICM Cycles">
            {state.jicm_cycle ? (
              <>
                <Metric label="Last" value={state.jicm_cycle.last_timestamp} />
                <Metric label="Method" value={state.jicm_cycle.method} />
                <Metric label="LLM" value={state.jicm_cycle.llm_model} />
                <Metric label="Duration" value={`${state.jicm_cycle.duration_seconds}s`} />
                <br />
                <Metric label="Output" value={`${state.jicm_cycle.output_lines} lines / ${(state.jicm_cycle.output_bytes / 1024).toFixed(1)}KB`} />
                <Metric label="User msgs" value={state.jicm_cycle.user_msg_count} />
                <Metric label="SS stale" value={`${state.jicm_cycle.session_state_stale_min}m`} warn={state.jicm_cycle.session_state_stale_min > 360} />
              </>
            ) : <span style={{ color: '#64748b', fontSize: '0.8rem' }}>No compression data available</span>}
            {state.ingest && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1e293b' }}>
                <Metric label="Last RAG ingest" value={state.ingest.last_at} />
                <Metric label="Chunks" value={state.ingest.chunks} />
                <Metric label="Dedup score" value={state.ingest.dedup_score.toFixed(3)} />
                <Metric label="Threshold" value={state.ingest.dedup_threshold} />
              </div>
            )}
          </Section>

          {/* Memory Layers */}
          <Section title="Memory Layers (6-Layer Model)">
            {Object.entries(healthLayers).map(([layer, data]) => {
              const labels: Record<string, string> = {
                L1_sensory: 'L1 Sensory', L2_working: 'L2 Working', L3_shortterm: 'L3 Short-Term',
                L4_declarative: 'L4 Declarative', L5_procedural: 'L5 Procedural', L6_meta: 'L6 Meta',
              };
              const color = STATUS_COLORS[data.status] || STATUS_COLORS.unknown;
              const metrics = Object.entries(data).filter(([k]) => k !== 'status');
              return (
                <div key={layer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.8rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ width: '100px', color: '#cbd5e1' }}>{labels[layer] || layer}</span>
                  <span style={{ color: '#64748b' }}>
                    {metrics.map(([k, v]) => `${k.replace(/_/g, ' ')}=${typeof v === 'number' ? v.toLocaleString() : v}`).join(' · ')}
                  </span>
                </div>
              );
            })}
          </Section>

          {/* Signals & Processes */}
          <Section title="Signals & Processes">
            <div style={{ display: 'flex', gap: '2rem' }}>
              <div>
                {Object.entries(state.signals).map(([name, status]) => (
                  <div key={name} style={{ fontSize: '0.75rem', marginBottom: '2px' }}>
                    <SignalDot state={status} /><span style={{ color: '#94a3b8' }}>{name.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.8rem' }}>
                <div><span style={{ color: state.processes.watcher.alive ? '#22c55e' : '#ef4444' }}>●</span> Watcher {state.processes.watcher.alive ? `PID ${state.processes.watcher.pid}` : 'DOWN'}</div>
              </div>
            </div>
          </Section>

          {/* Project Focus & Git */}
          <Section title="Project Focus & Git">
            <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.5rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.focus || '(no focus line)'}
            </div>
            <Metric label="Branch" value={state.git.branch} />
            <Metric label="Ahead" value={`↑${state.git.ahead}`} />
            <Metric label="Dirty" value={`*${state.git.dirty}`} warn={state.git.dirty > 20} />
          </Section>

          {/* Watcher Log */}
          <Section title="Watcher Log (live tail)">
            <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#94a3b8', lineHeight: '1.4' }}>
              {state.watcher_log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </Section>
        </>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <>
          <ContextWindowTimeline />
          <CompressionEfficiencyGauge />
          <LayerHealthHeatmap />
        </>
      )}

      {/* Stores Tab */}
      {tab === 'stores' && (
        <>
          <RagCollectionsTreemap />
          <GraphitiOverview />
        </>
      )}
    </div>
  );
}
