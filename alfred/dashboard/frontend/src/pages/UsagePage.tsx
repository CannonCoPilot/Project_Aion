/**
 * Usage Page — Token-based, Anthropic session-aware.
 *
 * "Session" here means Anthropic's 5h current session window,
 * NOT a Claude Code working session. These are independent concepts.
 *
 * All data comes exclusively from proxy-captured Anthropic API headers.
 * No fallback, no backfill, no estimation.
 */

import { useState, type ChangeEvent } from 'react';
import {
  Area,
  ComposedChart,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Header } from '../components/layout/Header';
import {
  useSessionWindow,
  useSessionTokens,
  useModelTokens,
  useMessageSizes,
  useMessageSizesHistorical,
  useLoadedModels,
  useSessionBudgetHistory,
  useBurnRateCurve,
  useCacheEffectiveness,
  useRejectionEvents,
} from '../api/usage';

// ── Helpers ──

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const TOOLTIP_STYLE = {
  backgroundColor: '#1f2937',
  border: '1px solid #374151',
  borderRadius: '8px',
  fontSize: '12px',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#ef4444',
};

// Sun-to-Sat gradient: violet (weekend start) → amber (weekend end). Weekdays interpolate.
const DAY_GRADIENT_START: [number, number, number] = [139, 92, 246];  // violet-500
const DAY_GRADIENT_END: [number, number, number] = [245, 158, 11];    // amber-500
const DAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
function dayGradientColor(dayName: string): string {
  const idx = DAY_INDEX[dayName] ?? 0;
  const t = idx / 6;
  const r = Math.round(DAY_GRADIENT_START[0] + (DAY_GRADIENT_END[0] - DAY_GRADIENT_START[0]) * t);
  const g = Math.round(DAY_GRADIENT_START[1] + (DAY_GRADIENT_END[1] - DAY_GRADIENT_START[1]) * t);
  const b = Math.round(DAY_GRADIENT_START[2] + (DAY_GRADIENT_END[2] - DAY_GRADIENT_START[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function format12Hour(hour: number): string {
  const h = Math.round(hour) % 24;
  if (h === 0) return '12am';
  if (h === 12) return 'noon';
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

// Browser's current local-TZ abbreviation (e.g. "MDT", "MST", "PST"). Resolved once at
// module load — DST transitions during a long-running session are rare and the worst
// case is a slightly stale label until next reload. (Multi-user TZ prefs are deferred.)
const LOCAL_TZ_ABBREV: string =
  new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(new Date())
    .find((p) => p.type === 'timeZoneName')?.value ?? '';

// Sliding-window box filter (stride 1). Averages every numeric field over a contiguous
// window; returns N - W + 1 anchor points centered at the running window's mean position.
// Two stacked passes (e.g. 4-pt then 3-pt) approximate a Gaussian kernel via the central
// limit theorem, which kills visible kinks at points where input variance changes sharply.
function boxFilterSeries<T extends Record<string, number>>(series: T[], windowSize: number): T[] {
  if (series.length < windowSize) return series.slice();
  const keys = Object.keys(series[0]);
  const out: T[] = [];
  for (let i = 0; i <= series.length - windowSize; i++) {
    const anchor: Record<string, number> = {};
    for (const k of keys) {
      let sum = 0;
      for (let j = i; j < i + windowSize; j++) sum += series[j][k] as number;
      anchor[k] = sum / windowSize;
    }
    out.push(anchor as T);
  }
  return out;
}

function formatResetCaption(resetSeconds: number, resetAt: Date | null): string {
  if (resetSeconds < 3 * 3600) {
    const h = Math.floor(resetSeconds / 3600);
    const m = Math.floor((resetSeconds % 3600) / 60);
    return `Resets in ${h}:${m.toString().padStart(2, '0')}`;
  }
  if (resetAt) {
    return `Resets ${resetAt.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })}`;
  }
  return `Resets in ${formatDuration(resetSeconds)}`;
}

function NoProxyData({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center mb-3">
        <span className="text-faint text-lg">⊘</span>
      </div>
      <div className="text-sm text-muted mb-1">No Proxy Data</div>
      <div className="text-xs text-faint max-w-sm">
        {message || 'Set ANTHROPIC_BASE_URL=http://localhost:9800 to route API traffic through the proxy.'}
      </div>
    </div>
  );
}

// ── Hero Row: at-a-glance 5h window state (Wire A — surfacing completion) ──

function HeroNoProxy({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="text-xs text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-faint">⊘ no proxy data</div>
    </div>
  );
}

function HeroTimeCard() {
  const { data } = useSessionWindow();
  if (!data || data.status === 'no_proxy_data') return <HeroNoProxy label="5h Window" />;
  const fiveH = data.five_hour;
  const util = fiveH?.utilization != null ? fiveH.utilization * 100 : null;
  const resetSec = fiveH?.reset_seconds ?? 0;
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="text-xs text-muted uppercase tracking-wide mb-1">5h Window — Remaining</div>
      <div className="text-2xl font-semibold text-secondary font-mono">
        {formatDuration(resetSec)}
      </div>
      <div className="text-xs text-muted mt-1">
        {util != null ? `${util.toFixed(1)}% utilization` : '—'}
      </div>
    </div>
  );
}

function HeroTokensCard() {
  const { data } = useSessionTokens();
  if (!data || data.status === 'no_proxy_data') return <HeroNoProxy label="Tokens This Window" />;
  const total = data.tokens_spent ?? 0;
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="text-xs text-muted uppercase tracking-wide mb-1">Tokens This Window</div>
      <div className="text-2xl font-semibold text-secondary font-mono">{formatTokens(total)}</div>
      <div className="text-xs text-muted mt-1">{data.request_count ?? 0} requests</div>
    </div>
  );
}

function HeroBurnRateTokensCard() {
  const { data: tokens } = useSessionTokens();
  const { data: win } = useSessionWindow();
  if (!tokens || tokens.status === 'no_proxy_data' || !win || win.status === 'no_proxy_data') {
    return <HeroNoProxy label="Burn Rate" />;
  }
  const elapsedSec = 18000 - (win.five_hour?.reset_seconds ?? 18000);
  const totalTokens = tokens.tokens_spent ?? 0;
  const tokensPerMin = elapsedSec > 0 ? totalTokens / (elapsedSec / 60) : 0;
  // Reference: ~250M-token Claude Pro 5h budget / 5h / 60min ≈ 833K tok/min saturation.
  // Bands: <200K/min healthy idle, <600K/min active, ≥600K saturating.
  const cls =
    tokensPerMin < 200_000
      ? 'text-emerald-400'
      : tokensPerMin < 600_000
        ? 'text-amber-400'
        : 'text-red-400';
  const projTokens = elapsedSec > 0 ? totalTokens * (18000 / elapsedSec) : null;
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="text-xs text-muted uppercase tracking-wide mb-1">Burn Rate</div>
      <div className={`text-2xl font-semibold font-mono ${cls}`}>
        {formatTokens(tokensPerMin)}
        <span className="text-base text-muted font-normal ml-1">/min</span>
      </div>
      <div className="text-xs text-muted mt-1">
        {formatTokens(tokensPerMin * 60)}/hr · proj{' '}
        {projTokens != null ? formatTokens(projTokens) : '—'}
      </div>
    </div>
  );
}

function HeroCacheCard() {
  const { data } = useSessionTokens();
  if (!data || data.status === 'no_proxy_data' || !data.tokens_spent) {
    return <HeroNoProxy label="Cache This Window" />;
  }
  const input = data.input_tokens ?? 0;
  const reads = data.cache_read_tokens ?? 0;
  const writes = data.cache_write_tokens ?? 0;
  // Hit ratio: fraction of input-equivalent that came from cache vs cold input.
  const denom = input + reads;
  const hit = denom > 0 ? (reads / denom) * 100 : null;
  // Savings: cache_read is charged at 0.1× input rate, so x-savings = input-equivalent
  // had cache misses occurred / input-equivalent actually charged.
  const charged = input + 0.1 * reads;
  const savings = charged > 0 ? denom / charged : 1;
  const hitClass =
    hit == null ? 'text-secondary' : hit >= 90 ? 'text-emerald-400' : 'text-amber-400';
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="text-xs text-muted uppercase tracking-wide mb-1">Cache This Window</div>
      <div className={`text-2xl font-semibold font-mono ${hitClass}`}>
        {hit != null ? `${hit.toFixed(1)}%` : '—'}
        <span className="text-base text-muted font-normal ml-1">hit</span>
      </div>
      <div className="text-xs text-muted mt-1">
        {formatTokens(reads)} reads · {formatTokens(writes)} writes · {savings.toFixed(1)}x
      </div>
    </div>
  );
}

// ── Panel 1: Time + Utilization Curve ──

function TimePanel() {
  const { data, isLoading } = useSessionWindow();
  const { data: burnData } = useBurnRateCurve();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Anthropic Session Window</h3>
        <div className="h-24 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  if (data?.status === 'no_proxy_data') {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Anthropic Session Window</h3>
        <NoProxyData message={data.message} />
      </div>
    );
  }

  const fiveH = data?.five_hour;
  const util5h = fiveH?.utilization != null ? fiveH.utilization * 100 : null;
  const resetSec = fiveH?.reset_seconds ?? 0;
  const resetAt = fiveH?.reset_at ? new Date(fiveH.reset_at) : null;
  const status = data?.unified_status ?? 'unknown';
  const governing = data?.representative_claim ?? 'five_hour';

  const statusColor =
    status === 'within_limit' || status === 'allowed'
      ? 'text-emerald-400'
      : status === 'limit_reached'
        ? 'text-red-400'
        : status === 'over_limit' || status === 'rejected'
          ? 'text-red-500'
          : 'text-muted';

  // Current window's utilization curve (from burn-rate data)
  const currentWindow = burnData?.windows?.length
    ? burnData.windows[burnData.windows.length - 1]
    : null;
  // Real curve points only — used for the linear regression input.
  const baseCurve = currentWindow?.points?.map((p) => ({
    elapsed_h: +(p.elapsed_seconds / 3600).toFixed(3),
    utilization: +(p.utilization * 100).toFixed(1),
    model: p.model ?? 'unknown',
  })) ?? [];

  // Model color map — each model family gets a distinct hue.
  const MODEL_COLORS: Record<string, string> = {
    'claude-opus-4-7': '#a78bfa',
    'claude-opus-4-6': '#8b5cf6',
    'claude-sonnet-4-6': '#38bdf8',
    'claude-sonnet-4-5-20241022': '#22d3ee',
    'claude-haiku-4-5-20251001': '#34d399',
  };
  const modelColor = (m: string): string =>
    MODEL_COLORS[m] ?? (m.includes('opus') ? '#8b5cf6' : m.includes('sonnet') ? '#38bdf8' : m.includes('haiku') ? '#34d399' : '#A366AB');

  // Identify distinct models in the current window for the legend.
  const windowModels = [...new Set(baseCurve.map((p) => p.model))].filter((m) => m !== 'unknown');

  // Synthetic (0, 0) anchor: every window starts at 0% utilization at hour 0.
  // If the first proxied data point arrives late (non-proxied traffic started
  // the window), prepend a synthetic origin point and build a shadow estimate
  // line connecting it to the first observed point.
  const GAP_THRESHOLD_H = 0.1;  // 6 minutes — ignore trivial startup latency
  const firstRealH = baseCurve.length ? baseCurve[0].elapsed_h : 0;
  const hasUnobservedGap = firstRealH > GAP_THRESHOLD_H;
  const shadowEstimate = hasUnobservedGap
    ? [
        { elapsed_h: 0, shadow: 0 },
        { elapsed_h: firstRealH, shadow: +baseCurve[0].utilization },
      ]
    : [];

  // Prepend synthetic anchor to baseCurve for regression when gap exists.
  const regressionInput = hasUnobservedGap
    ? [{ elapsed_h: 0, utilization: 0, model: 'unobserved' }, ...baseCurve]
    : baseCurve;

  // Through-origin linear regression for current-window trendline: y = slope * x.
  // Y-intercept fixed at 0% — every window starts at 0% utilization at hour 0.
  // Closed-form: slope = Σ(xy) / Σ(x²). Matches BurnRatePanel regression.
  let curveSlope = 0;
  const curveIntercept = 0;
  if (regressionInput.length >= 1) {
    let sumXY = 0, sumXX = 0;
    for (const p of regressionInput) {
      sumXY += p.elapsed_h * p.utilization;
      sumXX += p.elapsed_h * p.elapsed_h;
    }
    if (sumXX > 0) curveSlope = sumXY / sumXX;
  }

  // Unified data array for the chart. The main Area renders observed data only.
  // The shadow estimate (separate Line) bridges (0,0) to the first real point.
  const decorated = baseCurve.map((p) => ({
    ...p,
    trendline: +(curveSlope * p.elapsed_h + curveIntercept).toFixed(2),
  }));
  type CurvePoint = { elapsed_h: number; utilization: number | null; trendline: number; model?: string };
  const curvePoints: CurvePoint[] = baseCurve.length >= 2
    ? [
        ...decorated,
        { elapsed_h: 5, utilization: null, trendline: +(curveSlope * 5 + curveIntercept).toFixed(2) },
      ]
    : decorated;
  // Raw projection drives caption-mode selection (clamped projection is only for display)
  const curveProjectedAt5hRaw = curveSlope * 5 + curveIntercept;
  const curveProjectedAt5h = Math.max(0, Math.min(100, curveProjectedAt5hRaw));

  // Dynamic y-axis cap based on REAL current-session usage only (never the regression).
  // Tiers: <5% → cap 10; <20% → cap 25; else → cap 100 (absolute ceiling).
  const currentUsageForScale = util5h ?? 0;
  let curveYCap = 100;
  let curveYTicks: number[] = [0, 25, 50, 75, 100];
  if (currentUsageForScale < 5) {
    curveYCap = 10;
    curveYTicks = [0, 2.5, 5, 7.5, 10];
  } else if (currentUsageForScale < 20) {
    curveYCap = 25;
    curveYTicks = [0, 5, 10, 15, 20, 25];
  }

  // Caption-mode selector: if the trendline would hit 100% before reset, report time
  // remaining until 100%; otherwise report the projected value at reset.
  const currentElapsedH = baseCurve.length ? baseCurve[baseCurve.length - 1].elapsed_h : 0;
  const hitsHundred = curveSlope > 0 && curveProjectedAt5hRaw >= 100;
  let hoursTo100Label = '';
  if (hitsHundred) {
    const tAt100 = curveSlope > 0 ? (100 - curveIntercept) / curveSlope : 5;
    const hoursLeft = Math.max(0, tAt100 - currentElapsedH);
    const wholeH = Math.floor(hoursLeft);
    const minutes = Math.max(0, Math.round((hoursLeft - wholeH) * 60));
    hoursTo100Label = wholeH > 0 ? `${wholeH}h ${minutes}m` : `${minutes}m`;
  }

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-secondary">Anthropic Session Window</h3>
        <span className={`text-[10px] font-semibold uppercase ${statusColor}`}>
          {status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* 5h window progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted">5h Token Window{governing === 'five_hour' ? ' (governing)' : ''}</span>
          <span className="text-secondary font-mono">
            {util5h != null ? `${util5h.toFixed(1)}%` : '—'}
          </span>
        </div>
        <div className="relative h-3 bg-surface-2 rounded-full overflow-hidden">
          {util5h != null && (
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                util5h >= 80 ? 'bg-red-500' : util5h >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(util5h, 100)}%` }}
            />
          )}
        </div>
        {resetSec > 0 && (
          <div className="text-[10px] text-faint mt-1">
            {formatResetCaption(resetSec, resetAt)}
          </div>
        )}
      </div>

      {/* Utilization area chart — current 5h window. Includes dynamic best-fit trendline
          mirroring BurnRatePanel. Red-toned 10% gridlines + top border = visible chart frame. */}
      {baseCurve.length >= 2 && (
        <div className="mb-4">
          <div className="text-[10px] text-faint mb-1">
            Token consumption this window
            {hasUnobservedGap && (
              <span className="text-amber-500/70">
                {' '}· {firstRealH.toFixed(1)}h unobserved
              </span>
            )}
            {' '}· slope:{' '}
            <span className="text-amber-400 font-mono">
              {curveSlope >= 0 ? '+' : ''}{curveSlope.toFixed(1)}%/h
            </span>
            {hitsHundred ? (
              <>
                {' '}· projects to{' '}
                <span className="text-amber-400 font-mono">100%</span>
                {' '}in{' '}
                <span className="text-amber-400 font-mono">{hoursTo100Label}</span>
              </>
            ) : (
              <>
                {' '}· projects to{' '}
                <span className="text-amber-400 font-mono">{curveProjectedAt5h.toFixed(0)}%</span>
                {' '}at reset
              </>
            )}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={curvePoints} margin={{ top: 8, right: 5, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="utilGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A366AB" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#A366AB" stopOpacity={0.05} />
                </linearGradient>
                {/* Horizontal gradient for model color-coding along the x-axis */}
                {(() => {
                  if (windowModels.length <= 1) return null;
                  const stops: Array<{ offset: string; color: string }> = [];
                  for (let i = 0; i < baseCurve.length; i++) {
                    const p = baseCurve[i];
                    const pctX = ((p.elapsed_h / 5) * 100).toFixed(1);
                    const c = modelColor(p.model);
                    if (i === 0 || baseCurve[i - 1].model !== p.model) {
                      stops.push({ offset: `${pctX}%`, color: c });
                    }
                  }
                  if (baseCurve.length > 0) {
                    const lastPct = ((baseCurve[baseCurve.length - 1].elapsed_h / 5) * 100).toFixed(1);
                    stops.push({ offset: `${lastPct}%`, color: modelColor(baseCurve[baseCurve.length - 1].model) });
                  }
                  return (
                    <linearGradient id="modelStrokeGrad" x1="0" y1="0" x2="1" y2="0">
                      {stops.map((s, i) => (
                        <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={1} />
                      ))}
                    </linearGradient>
                  );
                })()}
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(239, 68, 68, 0.10)"
                horizontal
                vertical
              />
              <XAxis
                dataKey="elapsed_h"
                type="number"
                domain={[0, 5]}
                ticks={[0, 1, 2, 3, 4, 5]}
                tick={{ fill: '#6b7280', fontSize: 9 }}
                tickFormatter={(v) => `${v}h`}
              />
              <YAxis
                domain={[0, curveYCap]}
                ticks={curveYTicks}
                tick={{ fill: '#6b7280', fontSize: 9 }}
                tickFormatter={(v) => `${v}%`}
                allowDataOverflow
              />
              {/* Custom content filters out the trendline series — hover should report the
                  actual session usage value at the cursor x, not the linear-fit projection.
                  Filtering by `name` because Area + Line share dataKey="utilization". */}
              <Tooltip
                cursor={{ stroke: '#374151', strokeWidth: 1 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const util = payload.find((p: any) => p.name === 'session-usage');
                  if (!util || util.value == null) return null;
                  const elH = Number(label);
                  const nearestPt = baseCurve.reduce((best, p) =>
                    Math.abs(p.elapsed_h - elH) < Math.abs(best.elapsed_h - elH) ? p : best,
                    baseCurve[0]);
                  const ptModel = nearestPt?.model;
                  const ptColor = ptModel ? modelColor(ptModel) : '#A366AB';
                  const shortModel = ptModel?.replace('claude-', '') ?? '';
                  return (
                    <div style={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      fontSize: '12px',
                      padding: '8px 12px',
                    }}>
                      <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>
                        {elH.toFixed(2)}h elapsed
                        {shortModel && <span style={{ color: ptColor, marginLeft: 6 }}>{shortModel}</span>}
                      </div>
                      <div style={{ color: ptColor }}>
                        Utilization: {util.value}%
                      </div>
                    </div>
                  );
                }}
              />
              {/* Top border line at the current cap (red 35% alpha) */}
              <ReferenceLine y={curveYCap} stroke="rgba(239, 68, 68, 0.35)" strokeWidth={1} />
              {/* Shadow estimate: dashed line from (0,0) to first observed point
                  when non-proxied traffic started the window before proxy captured data */}
              {hasUnobservedGap && (
                <Line
                  type="linear"
                  data={shadowEstimate}
                  dataKey="shadow"
                  name="shadow-estimate"
                  stroke="#A366AB"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  strokeOpacity={0.5}
                  dot={false}
                  isAnimationActive={false}
                  legendType="none"
                  xAxisId={0}
                  yAxisId={0}
                />
              )}
              <Area
                type="stepAfter"
                dataKey="utilization"
                name="session-usage"
                stroke={windowModels.length > 1 ? 'url(#modelStrokeGrad)' : '#A366AB'}
                fill="url(#utilGrad)"
                strokeWidth={2}
                isAnimationActive={false}
              />
              {/* Dynamic best-fit trendline. Reads `trendline` from the chart's primary
                  data (same array as the Area), eliminating the prior split-data activation
                  inconsistency. The phantom point at elapsed_h=5 carries utilization=null
                  + a finite trendline value, so the dashed line still extrapolates to
                  window-close while the Area path breaks at the last real point. */}
              <Line
                type="linear"
                dataKey="trendline"
                name="trendline"
                stroke="#facc15"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                legendType="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
          {windowModels.length > 1 && (
            <div className="flex gap-3 mt-1 flex-wrap">
              {windowModels.map((m) => (
                <span key={m} className="flex items-center gap-1 text-[10px] text-faint">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: modelColor(m) }}
                  />
                  {m.replace('claude-', '')}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 7d Token Window relocated to Session Tokens card */}
    </div>
  );
}

// ── Panel 2: Session Tokens ──

function SessionTokensPanel() {
  const { data, isLoading } = useSessionTokens();
  const { data: windowData } = useSessionWindow();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Session Tokens</h3>
        <div className="h-24 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  if (data?.status === 'no_proxy_data') {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Session Tokens</h3>
        <NoProxyData message={data.message} />
      </div>
    );
  }

  const util = data?.utilization != null ? data.utilization * 100 : null;
  const input = data?.input_tokens ?? 0;
  const output = data?.output_tokens ?? 0;
  const cacheRead = data?.cache_read_tokens ?? 0;
  const cacheWrite = data?.cache_write_tokens ?? 0;
  const requests = data?.request_count ?? 0;
  const spent = data?.tokens_spent ?? 0;
  const tokensLimit = data?.rate_limit_tokens_limit;
  const tokensRemaining = data?.rate_limit_tokens_remaining;

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-secondary">Session Tokens</h3>
        <span className="text-xs text-muted font-mono">{requests} requests</span>
      </div>

      {util != null && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted">Window utilization</span>
            <span className="text-secondary font-mono">{util.toFixed(1)}%</span>
          </div>
          <div className="relative h-3 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                util >= 80 ? 'bg-red-500' : util >= 60 ? 'bg-amber-500' : 'bg-accent'
              }`}
              style={{ width: `${Math.min(util, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-faint uppercase">Input</div>
          <div className="text-lg font-mono font-semibold text-secondary">{formatTokens(input)}</div>
        </div>
        <div>
          <div className="text-[10px] text-faint uppercase">Output</div>
          <div className="text-lg font-mono font-semibold text-secondary">{formatTokens(output)}</div>
        </div>
        <div>
          <div className="text-[10px] text-faint uppercase">Cache Read</div>
          <div className="text-sm font-mono text-secondary">{formatTokens(cacheRead)}</div>
        </div>
        <div>
          <div className="text-[10px] text-faint uppercase">Cache Write</div>
          <div className="text-sm font-mono text-secondary">{formatTokens(cacheWrite)}</div>
        </div>
      </div>

      {tokensLimit != null && tokensRemaining != null && (
        <div className="mt-3 pt-3 border-t border-default">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Per-min tokens remaining</span>
            <span className="text-secondary font-mono">
              {formatTokens(tokensRemaining)} / {formatTokens(tokensLimit)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-default flex items-center justify-between">
        <span className="text-xs text-muted">Total tokens spent</span>
        <span className="text-sm font-mono font-semibold text-secondary">{formatTokens(spent)}</span>
      </div>

      {/* 7d Token Window — relocated from Anthropic Session Window card */}
      {(() => {
        const sevenD = windowData?.seven_day;
        const util7d = sevenD?.utilization != null ? sevenD.utilization * 100 : null;
        const sevenResetSec = sevenD?.reset_seconds ?? 0;
        const sevenResetAt = sevenD?.reset_at ? new Date(sevenD.reset_at) : null;
        const governing = windowData?.representative_claim;
        if (util7d == null) return null;
        return (
          <div className="mt-3 pt-3 border-t border-default">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted">
                7d Token Window{governing === 'seven_day' ? ' (governing)' : ''}
              </span>
              <span className="text-secondary font-mono">{util7d.toFixed(1)}%</span>
            </div>
            <div className="relative h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                  util7d >= 80 ? 'bg-red-500' : util7d >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(util7d, 100)}%` }}
              />
            </div>
            {sevenResetSec > 0 && (
              <div className="text-[10px] text-faint mt-1">
                {formatResetCaption(sevenResetSec, sevenResetAt)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── Panel 3: Model Usage ──

const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-7': '#A366AB',
  'claude-opus-4-6': '#A366AB',
  'claude-sonnet-4-6': '#60a5fa',
  'claude-haiku-4-5': '#4ade80',
  'claude-haiku-4-5-20251001': '#4ade80',
};

// Claude tiers always shown (remote — no "loaded" concept; always reachable via API).
// Local models (Ollama, MLX-Embed) come from the discovery endpoint and represent
// what is *currently loaded into VRAM*, not just what's deployed on disk.
const CLAUDE_ALWAYS_SHOWN: Array<{ model: string }> = [
  { model: 'claude-opus-4-7' },
  { model: 'claude-sonnet-4-6' },
  { model: 'claude-haiku-4-5' },
];

const OLLAMA_COLOR = '#f59e0b';
const MLX_EMBED_COLOR = '#22d3ee';
const ZERO_BAR_COLOR = '#374151';  // muted gray for empty bars

function ModelUsagePanel() {
  const { data, isLoading } = useModelTokens();
  const { data: loadedData } = useLoadedModels();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Model Usage</h3>
        <div className="h-24 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  // Build the union of (Claude always-shown) ∪ (currently-loaded local models)
  // ∪ (proxy-detected models). Local models that are deployed-on-disk but NOT loaded
  // are intentionally hidden — operator sees what's reachable now, not what *could* be.
  type RowData = {
    model: string;
    family: 'claude' | 'ollama' | 'mlx-embed' | 'other';
    alive: boolean;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    request_count: number;
  };
  const apiModels = data?.models ?? [];
  const apiByModel = new Map(apiModels.map((m) => [m.model, m]));
  const loadedModels = loadedData?.models ?? [];
  const rows: RowData[] = [];
  const seen = new Set<string>();

  // Always-shown remote (Claude) tiers
  for (const must of CLAUDE_ALWAYS_SHOWN) {
    const hit = apiByModel.get(must.model);
    rows.push(
      hit
        ? { ...hit, family: 'claude', alive: true }
        : {
            model: must.model,
            family: 'claude',
            alive: true,
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            request_count: 0,
          },
    );
    seen.add(must.model);
  }

  // Currently-loaded local models (Ollama + MLX-Embed). Each shows alive=true.
  for (const lm of loadedModels) {
    if (seen.has(lm.name)) continue;
    const hit = apiByModel.get(lm.name);
    rows.push({
      model: lm.name,
      family: lm.family,
      alive: lm.alive,
      total_tokens: hit?.total_tokens ?? 0,
      input_tokens: hit?.input_tokens ?? 0,
      output_tokens: hit?.output_tokens ?? 0,
      cache_read_tokens: hit?.cache_read_tokens ?? 0,
      request_count: hit?.request_count ?? 0,
    });
    seen.add(lm.name);
  }

  // Proxy-detected models that aren't already in the union — show even if local model
  // wasn't reported as "loaded" (e.g., it routed through a different gateway).
  for (const m of apiModels) {
    if (seen.has(m.model)) continue;
    rows.push({ ...m, family: 'other', alive: false });
  }
  rows.sort((a, b) => b.total_tokens - a.total_tokens);

  const maxTokens = Math.max(...rows.map((r) => r.total_tokens), 1);
  const colorFor = (r: RowData): string => {
    if (r.total_tokens === 0) return ZERO_BAR_COLOR;
    if (r.family === 'ollama') return OLLAMA_COLOR;
    if (r.family === 'mlx-embed') return MLX_EMBED_COLOR;
    return MODEL_COLORS[r.model] ?? '#6b7280';
  };
  const displayNameFor = (r: RowData): string => {
    if (r.family === 'claude') {
      return r.model.replace('claude-', '').replace(/-20\d{6}$/, '');
    }
    return r.model;
  };

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5">
      <h3 className="text-sm font-semibold text-secondary mb-4">Model Usage (5h Window)</h3>
      <div className="space-y-3">
        {rows.map((m) => {
          const pct = (m.total_tokens / maxTokens) * 100;
          const empty = m.total_tokens === 0;
          return (
            <div key={m.model}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`flex items-center gap-1.5 ${empty ? 'text-faint' : 'text-secondary'}`}>
                  {/* Alive indicator: green dot if reachable, otherwise dim gray */}
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${m.alive ? 'bg-emerald-400' : 'bg-gray-500'}`}
                    title={m.alive ? 'reachable' : 'not reachable'}
                  />
                  {displayNameFor(m)}
                  {m.family !== 'claude' && (
                    <span className="text-faint text-[9px] uppercase tracking-wide">
                      {m.family === 'ollama' ? 'ollama' : m.family === 'mlx-embed' ? 'mlx-embed' : ''}
                    </span>
                  )}
                  {empty && <span className="text-faint italic"> · idle</span>}
                </span>
                <span className="text-muted font-mono">
                  {formatTokens(m.total_tokens)} · {m.request_count} req
                </span>
              </div>
              <div className="relative h-2.5 bg-surface-2 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: empty ? '2%' : `${Math.max(pct, 2)}%`,
                    backgroundColor: colorFor(m),
                    opacity: empty ? 0.4 : 1,
                  }}
                />
              </div>
              {!empty && (
                <div className="flex gap-3 mt-0.5 text-[10px] text-faint">
                  <span>in: {formatTokens(m.input_tokens)}</span>
                  <span>out: {formatTokens(m.output_tokens)}</span>
                  <span>cache: {formatTokens(m.cache_read_tokens)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-[10px] text-faint">
        Local-model presence is read from Ollama&apos;s <code>/api/ps</code> + MLX-Embed&apos;s <code>/health</code>;
        deployed-but-not-loaded models are intentionally hidden.
      </div>
    </div>
  );
}

// ── Panel 4: Message Sizes ──

// Log-log message-size histogram with per-bin per-session boxplot overlay.
// X-axis: bin INDEX (0..N-1) — log-spaced token-size buckets, but rendered with
//   uniform pixel width so the long-tail bins aren't visually fat. Bin LABEL
//   (e.g. "1K-2K", "64K+") is shown via tickFormatter.
// Y-axis: log-scale frequency (count of messages in the bin). Same axis serves
//   the live current-session bars and the historical per-session-count Q0..Q4.
// Layers (back → front):
//   1. IQR rectangle (Q1→Q3) per bin where Q1 < Q3. Sky-toned, semi-opaque.
//   2. Whisker stems + caps (Q0→Q1, Q3→Q4) where there's meaningful spread.
//   3. Median hash mark — horizontal line across the bin at Q2. Always renders
//      when Q2 > 0; at N=1 sessions, this is the only visible historical signal.
//   4. Median connector — Line through (binIndex, Q2) for populated bins, with
//      connectNulls=false so empty bins create real gaps in the trace.
//   5. Live session bars — purple ReferenceArea, y1=1, y2=sessionCount.

function MessageSizesTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div style={{
      backgroundColor: '#1f2937',
      border: '1px solid #374151',
      borderRadius: '8px',
      fontSize: '12px',
      padding: '8px 12px',
    }}>
      <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>
        {p.label} tokens
      </div>
      <div style={{ color: '#A366AB' }}>
        Current session: <span style={{ fontWeight: 600 }}>{p.sessionCount}</span> msg
      </div>
      {p.q2 > 0 && (
        <div style={{ color: '#7dd3fc', fontSize: 11, marginTop: 4 }}>
          Historical Q1·MED·Q3:{' '}
          <span style={{ fontFamily: 'monospace' }}>{p.q1}·{p.q2}·{p.q3}</span>
          {' '}/session
          <span style={{ color: '#9ca3af' }}> ({p.nSessionsWithMsgs} sessions)</span>
        </div>
      )}
    </div>
  );
}

function MessagePanel() {
  const { data, isLoading } = useMessageSizes();
  const { data: historical } = useMessageSizesHistorical();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Message Sizes</h3>
        <div className="h-48 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  if (data?.status === 'no_proxy_data') {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Message Sizes</h3>
        <NoProxyData message={data?.message} />
      </div>
    );
  }

  const messages = data?.messages ?? [];
  const sessionMax = data?.max_message_tokens ?? 0;
  const histBins = historical?.bins ?? [];
  const nSessions = historical?.n_sessions ?? 0;
  const histDays = historical?.days ?? 30;
  const histTotal = historical?.message_count ?? 0;
  const histComputedAt = historical?.computed_at
    ? new Date(historical.computed_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    : null;

  // Need at least one bin definition (server returns empty bins[] when no data exists).
  if (!histBins.length) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Message Sizes</h3>
        <NoProxyData message="Bin definitions unavailable. Refresh after a few proxy requests." />
      </div>
    );
  }

  // Bin the current-session messages into the server's log-spaced grid.
  // Last bin is open-ended (`to: null`) — anything ≥ from belongs there.
  function binIndexFor(tokens: number): number {
    for (let i = 0; i < histBins.length; i++) {
      const upper = histBins[i].to;
      if (upper == null) return i; // open-ended top bin
      if (tokens < upper) return i;
    }
    return histBins.length - 1;
  }

  type ChartBin = {
    index: number;
    label: string;
    from: number;
    to: number | null;
    q0: number; q1: number; q2: number; q3: number; q4: number;
    q2Connector: number | null; // null at empty bins so the line draws gaps
    sessionCount: number;
    nSessionsWithMsgs: number;
  };

  const sessionBinCounts = new Array(histBins.length).fill(0);
  for (const m of messages) {
    sessionBinCounts[binIndexFor(m.total_tokens)] += 1;
  }

  // Show historical overlay only once at least one completed session exists.
  const showHistorical = nSessions >= 1;

  const chartData: ChartBin[] = histBins.map((b, i) => ({
    index: i,
    label: b.label,
    from: b.from,
    to: b.to,
    q0: showHistorical ? b.q0 : 0,
    q1: showHistorical ? b.q1 : 0,
    q2: showHistorical ? b.q2 : 0,
    q3: showHistorical ? b.q3 : 0,
    q4: showHistorical ? b.q4 : 0,
    q2Connector: showHistorical && b.q2 > 0 ? b.q2 : null,
    sessionCount: sessionBinCounts[i],
    nSessionsWithMsgs: b.n_sessions_with_msgs ?? 0,
  }));

  // Y-axis: log scale. Floor at 1 (smallest non-zero count). Top rounded up to
  // the next power of 10 across all visible series so log gridlines stay clean.
  let yMax = 1;
  for (const b of chartData) {
    for (const v of [b.sessionCount, b.q0, b.q1, b.q2, b.q3, b.q4]) {
      if (v > yMax) yMax = v;
    }
  }
  const yLogMax = Math.max(10, Math.pow(10, Math.ceil(Math.log10(Math.max(yMax, 1)))));

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-secondary">Message Sizes</h3>
        <div className="text-xs text-muted">
          <span className="font-mono">{data?.message_count ?? 0}</span> in session
          {histTotal > 0 && (
            <span className="font-mono">
              {' '}· {histTotal.toLocaleString()} msgs / {nSessions} sessions in {histDays}d
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 p-3 rounded bg-surface-2">
        <span className="text-xs text-muted">Max message tokens (this session)</span>
        <span className="text-lg font-mono font-semibold text-secondary">{formatTokens(sessionMax)}</span>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="index"
            type="number"
            domain={[-0.5, chartData.length - 0.5]}
            ticks={chartData.map((b) => b.index)}
            interval={0}
            tick={{ fill: '#6b7280', fontSize: 9 }}
            tickFormatter={(v) => chartData[Math.round(Number(v))]?.label ?? ''}
          />
          <YAxis
            type="number"
            scale="log"
            domain={[1, yLogMax]}
            allowDataOverflow={false}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickFormatter={(v) => `${v}`}
          />
          <Tooltip
            cursor={{ stroke: '#374151', strokeWidth: 1 }}
            content={MessageSizesTooltip as any}
          />

          {/* Layer 1: IQR rectangle per bin (Q1 → Q3). Renders only with meaningful spread. */}
          {chartData.flatMap((b) => {
            if (b.q1 <= 0 || b.q3 <= b.q1) return [];
            return [
              <ReferenceArea
                key={`iqr-${b.index}`}
                x1={b.index - 0.35}
                x2={b.index + 0.35}
                y1={b.q1}
                y2={b.q3}
                fill="#7dd3fc"
                fillOpacity={0.4}
                stroke="#7dd3fc"
                strokeOpacity={0.85}
                strokeWidth={1}
                ifOverflow="visible"
              />,
            ];
          })}

          {/* Layer 2: lower whisker (Q0 → Q1). Stem + cap. */}
          {chartData.flatMap((b) => {
            if (b.q0 <= 0 || b.q1 <= b.q0) return [];
            return [
              <ReferenceLine
                key={`wlo-${b.index}`}
                segment={[{ x: b.index, y: b.q0 }, { x: b.index, y: b.q1 }]}
                stroke="#7dd3fc"
                strokeOpacity={0.8}
                strokeWidth={1.25}
                ifOverflow="visible"
              />,
              <ReferenceLine
                key={`wlocap-${b.index}`}
                segment={[{ x: b.index - 0.18, y: b.q0 }, { x: b.index + 0.18, y: b.q0 }]}
                stroke="#7dd3fc"
                strokeOpacity={0.8}
                strokeWidth={1.25}
                ifOverflow="visible"
              />,
            ];
          })}

          {/* Layer 3: upper whisker (Q3 → Q4). */}
          {chartData.flatMap((b) => {
            if (b.q3 <= 0 || b.q4 <= b.q3) return [];
            return [
              <ReferenceLine
                key={`whi-${b.index}`}
                segment={[{ x: b.index, y: b.q3 }, { x: b.index, y: b.q4 }]}
                stroke="#7dd3fc"
                strokeOpacity={0.8}
                strokeWidth={1.25}
                ifOverflow="visible"
              />,
              <ReferenceLine
                key={`whicap-${b.index}`}
                segment={[{ x: b.index - 0.18, y: b.q4 }, { x: b.index + 0.18, y: b.q4 }]}
                stroke="#7dd3fc"
                strokeOpacity={0.8}
                strokeWidth={1.25}
                ifOverflow="visible"
              />,
            ];
          })}

          {/* Layer 4: median hash mark. Always renders at populated bins — at N=1 sessions
              this is the only visible historical signal (looks like a tick mark). */}
          {chartData.flatMap((b) => {
            if (b.q2 <= 0) return [];
            return [
              <ReferenceLine
                key={`med-${b.index}`}
                segment={[{ x: b.index - 0.35, y: b.q2 }, { x: b.index + 0.35, y: b.q2 }]}
                stroke="#7dd3fc"
                strokeOpacity={1}
                strokeWidth={2.5}
                ifOverflow="visible"
              />,
            ];
          })}

          {/* Layer 5: median connector — joins medians across populated bins, skipping empties. */}
          <Line
            type="linear"
            dataKey="q2Connector"
            stroke="#7dd3fc"
            strokeOpacity={0.65}
            strokeWidth={1.5}
            connectNulls={false}
            dot={false}
            isAnimationActive={false}
            legendType="none"
          />

          {/* Layer 6 (front): live current-session histogram bars. Equal pixel width via
              integer index x-coordinates; no Bar element required. */}
          {chartData.flatMap((b) => {
            if (b.sessionCount <= 0) return [];
            return [
              <ReferenceArea
                key={`session-${b.index}`}
                x1={b.index - 0.45}
                x2={b.index + 0.45}
                y1={1}
                y2={Math.max(b.sessionCount, 1.05)}
                fill="#A366AB"
                fillOpacity={0.75}
                stroke="#A366AB"
                strokeOpacity={1}
                strokeWidth={1}
                ifOverflow="visible"
              />,
            ];
          })}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-purple-400/75 border border-purple-400" />
          Current session
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 bg-sky-300/45 border border-sky-300" />
          {showHistorical
            ? `${nSessions} session${nSessions === 1 ? '' : 's'} boxplot (IQR · whiskers · median)`
            : 'Awaiting first completed session'}
        </span>
        {histComputedAt && (
          <span className="text-faint ml-auto">Recomputed {histComputedAt}</span>
        )}
      </div>
    </div>
  );
}

// ── Panel 5: Session Budget History + Temporal Trends ──

function SessionBudgetPanel() {
  const { data, isLoading } = useSessionBudgetHistory();
  const [trendCount, setTrendCount] = useState<number>(readTrendWindowCount);

  function handleTrendCountChange(e: ChangeEvent<HTMLInputElement>) {
    const next = parseInt(e.target.value, 10);
    if (Number.isNaN(next)) return;
    const clamped = Math.max(TREND_WINDOW_MIN, Math.min(TREND_WINDOW_MAX, next));
    setTrendCount(clamped);
    try {
      window.localStorage.setItem(TREND_WINDOW_LS_KEY, String(clamped));
    } catch {
      // localStorage unavailable; live state still updates
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Session Token Allotment Tracking</h3>
        <div className="h-64 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  const windows = data?.windows ?? [];

  if (!windows.length) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Session Token Allotment Tracking</h3>
        <NoProxyData message="Need data from multiple 5h windows. Keep the proxy running to accumulate window data." />
      </div>
    );
  }

  // Chronological trend data: budget over time. Each point carries a confidence
  // range [low, high] derived from CV%, used to render the back-most band layer.
  const trendData = windows.map((w) => {
    const cvFraction = (w.confidence_cv_pct ?? 0) / 100;
    const budget = w.estimated_budget;
    const low = Math.max(0, budget * (1 - cvFraction));
    const high = budget * (1 + cvFraction);
    return {
      ts: new Date(w.first_request).getTime(),
      tsEnd: new Date(w.window_reset).getTime(),
      budget,
      // Recharts Area in range mode expects [low, high] tuples on the same key.
      confidenceRange: [low, high] as [number, number],
      dayName: w.day_name,
      confidence: w.confidence_label,
      confidenceCv: w.confidence_cv_pct,
    };
  });

  // Sunday-tick computation now lives inside the trend-chart IIFE so it can
  // operate on the slider-restricted slice instead of the full series.

  // Hour-of-day chart: each window contributes a start (filled) dot, a close (hollow) dot,
  // and a connecting segment. Color encodes Anthropic's allotment-confidence (CV-derived),
  // not weekday — confidence answers the operator's first question ("can I trust this number?").
  // Windows that cross midnight render as two segments split at the 24/0 boundary.
  type HourPoint = {
    hour: number;
    budget: number;
    color: string;
    confidence: string;
    confidenceCv: number | null;
    day: string;
    windowLabel: string;
  };
  const startDots: HourPoint[] = [];
  const windowSegments: Array<{
    id: string;
    color: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
  }> = [];

  for (const w of windows) {
    // Fractional hour in the BROWSER'S LOCAL TIMEZONE. Server's `hour_of_day` is
    // integer-floored AND in UTC; recompute via local-TZ accessors so the chart's
    // x-axis labels and the dot positions agree with the user's wall clock.
    // (Multi-user TZ preferences are an explicit follow-up; today's user is in MDT.)
    const startTs = new Date(w.first_request);
    const startHour = startTs.getHours() + startTs.getMinutes() / 60 + startTs.getSeconds() / 3600;
    const closeTs = new Date(w.window_reset);
    const closeHour = closeTs.getHours() + closeTs.getMinutes() / 60 + closeTs.getSeconds() / 3600;
    const color = CONFIDENCE_COLORS[w.confidence_label] ?? '#6b7280';
    // Tooltip header. Local TZ to match the chart's local-TZ x-axis. Minute-precise
    // for both start and close so a single hover confirms both endpoints against the
    // raw `window_start` / `window_reset` timestamps.
    const labelOpts: Intl.DateTimeFormatOptions = {
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    };
    const startStr = startTs.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    }) + ' ' + startTs.toLocaleString('en-US', labelOpts);
    const closeStr = closeTs.toLocaleString('en-US', labelOpts);
    const windowLabel = `${startStr} → ${closeStr} ${LOCAL_TZ_ABBREV}`;
    const meta = {
      color,
      confidence: w.confidence_label,
      confidenceCv: w.confidence_cv_pct,
      day: w.day_name,
      windowLabel,
    };
    startDots.push({ hour: startHour, budget: w.estimated_budget, ...meta });

    if (closeHour > startHour) {
      windowSegments.push({
        id: w.window_reset,
        color,
        start: { x: startHour, y: w.estimated_budget },
        end: { x: closeHour, y: w.estimated_budget },
      });
    } else {
      // Midnight wrap: render as two segments meeting at x=24/x=0.
      windowSegments.push({
        id: `${w.window_reset}-a`,
        color,
        start: { x: startHour, y: w.estimated_budget },
        end: { x: 24, y: w.estimated_budget },
      });
      windowSegments.push({
        id: `${w.window_reset}-b`,
        color,
        start: { x: 0, y: w.estimated_budget },
        end: { x: closeHour, y: w.estimated_budget },
      });
    }
  }

  const recentWindows = windows.slice(-7);

  // Hour-of-day smoothed trend: sliding 2-point average over the union of every window's
  // start-hour AND close-hour points (each carrying the same window budget), sorted by
  // hour. Each consecutive pair averages to a midpoint anchor — within a window the pair
  // averages to the same budget (no internal smoothing); across consecutive windows it
  // averages to the midpoint between budgets, giving a smoothed trend line that replaces
  // the prior CV-derived confidence ribbon (which broke whenever per-hour buckets had
  // disjoint coverage and the Area path's monotone interpolator stitched mismatched
  // endpoints into segmented gaps). End-time points feed the curve but are still NOT
  // rendered as dots.
  // Smoothed confidence ribbon: each window contributes per-CV [low, high] anchors at
  // BOTH its start and close hours (local TZ). Two stacked box-filter passes (4-pt
  // then 3-pt, stride 1) yield a Gaussian-approximating envelope that doesn't kink
  // at session-boundary CV jumps the way a single-pass or unsmoothed ribbon did.
  const hourRawAnchors: Array<{ hour: number; low: number; high: number }> = [];
  for (const w of windows) {
    const cv = (w.confidence_cv_pct ?? 0) / 100;
    const low = Math.max(1, w.estimated_budget * (1 - cv));
    const high = w.estimated_budget * (1 + cv);
    const startTs = new Date(w.first_request);
    const startH = startTs.getHours() + startTs.getMinutes() / 60 + startTs.getSeconds() / 3600;
    const closeTs = new Date(w.window_reset);
    const closeH = closeTs.getHours() + closeTs.getMinutes() / 60 + closeTs.getSeconds() / 3600;
    hourRawAnchors.push({ hour: startH, low, high });
    hourRawAnchors.push({ hour: closeH, low, high });
  }
  hourRawAnchors.sort((a, b) => a.hour - b.hour);
  const hourPass1 = boxFilterSeries(hourRawAnchors, 4);
  const hourPass2 = boxFilterSeries(hourPass1, 3);
  const hourRibbon = hourPass2.map((p) => ({
    hour: +p.hour.toFixed(3),
    confidenceRange: [Math.max(1, p.low), p.high] as [number, number],
  }));

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-secondary">Session Token Allotment Tracking</h3>
        <span className="text-xs text-muted">{windows.length} windows</span>
      </div>
      <div className="text-[10px] text-faint mb-4">
        Back-calculated total token allotment per 5h window (proxy_tokens / utilization).
        Track how Anthropic varies limits by time of day and day of week.
      </div>

      {/* Chart 2: Budget trend over time — actual timestamps on x, 5h spans per window,
          confidence band as back-most layer, day-coded dots as front */}
      {trendData.length >= 2 && (() => {
        const visibleTrend = trendData.slice(-trendCount);
        const sliderMax = Math.min(TREND_WINDOW_MAX, trendData.length);
        const effectiveCount = Math.min(trendCount, sliderMax);
        // Explicit X domain locks the chart's plot box to the actual data extent: the
        // earliest window's open-time on the left and the latest window's close-time
        // (open + 5h) on the right. Two reasons this is necessary instead of
        // relying on `domain={['dataMin', 'dataMax']}`:
        //   1. The 5h ReferenceLine of the LAST window has its right endpoint at
        //      tsEnd_max — which is +5h past visibleTrend.ts.max. Auto-domain doesn't
        //      consider ReferenceLine segment endpoints, so the segment would draw
        //      off the right edge.
        //   2. Recharts 3.8 silently extends the auto-domain to fit any explicit
        //      `ticks` that fall outside [dataMin, dataMax]. With our day-ticks
        //      anchored at noon UTC, a window opening at 21:00 UTC of day D produced
        //      a tick 9h LEFT of dataMin — pulling the y-axis leftward and stranding
        //      dots inside the plot but visually past the y-axis. Pinning the
        //      domain explicitly + filtering ticks to fit inside it prevents this.
        const domainMin = visibleTrend[0].ts;
        const domainMax = visibleTrend[visibleTrend.length - 1].tsEnd;
        // Per-day ticks — one tick at noon UTC for each unique calendar day in the visible slice.
        // Filtered to only those that actually fall inside [domainMin, domainMax]; otherwise
        // Recharts 3 would auto-extend the domain to include any out-of-range ticks (see above).
        // Thinned to every Nth day if the visible span exceeds 14 days, to avoid label crowding.
        const dayTimestamps: number[] = [];
        const seenDays = new Set<string>();
        for (const p of visibleTrend) {
          const dk = new Date(p.ts).toISOString().slice(0, 10);
          if (seenDays.has(dk)) continue;
          seenDays.add(dk);
          dayTimestamps.push(new Date(`${dk}T12:00:00Z`).getTime());
        }
        const dayTimestampsInDomain = dayTimestamps.filter((t) => t >= domainMin && t <= domainMax);
        const tickStride = dayTimestampsInDomain.length > 14 ? Math.ceil(dayTimestampsInDomain.length / 14) : 1;
        const visibleDayTicks = dayTimestampsInDomain.filter((_, i) => i % tickStride === 0);
        // Smoothed confidence ribbon (replaces the prior single-pass sliding-average line).
        // Each window contributes per-CV [low, high] anchors at BOTH its open-ts and
        // close-ts. Two stacked box-filter passes (4-pt then 3-pt, stride 1) yield a
        // Gaussian-approximating envelope — the second pass is the post-smoothing
        // discontinuity-suppressor that keeps the Area's monotone path visually clean
        // at session-boundary CV jumps (which broke the prior unsmoothed band).
        const trendRawAnchors = visibleTrend.flatMap((p) => {
          const cv = (p.confidenceCv ?? 0) / 100;
          const low = Math.max(1, p.budget * (1 - cv));
          const high = p.budget * (1 + cv);
          return [
            { ts: p.ts, low, high },
            { ts: p.tsEnd, low, high },
          ];
        });
        trendRawAnchors.sort((a, b) => a.ts - b.ts);
        const trendPass1 = boxFilterSeries(trendRawAnchors, 4);
        const trendPass2 = boxFilterSeries(trendPass1, 3);
        const trendRibbon = trendPass2.map((p) => ({
          ts: Math.round(p.ts),
          confidenceRange: [Math.max(1, p.low), p.high] as [number, number],
        }));
        return (
        <div className="mb-6">
          <div className="text-[10px] text-faint uppercase mb-2">Allotment trend over time</div>
          {/* X-axis range slider — slice client-side; localStorage-persisted */}
          <div className="flex items-center gap-3 mb-2 text-[10px]">
            <label htmlFor="trend-window-count" className="text-muted shrink-0 uppercase tracking-wide">
              Show last
            </label>
            <input
              id="trend-window-count"
              type="range"
              min={TREND_WINDOW_MIN}
              max={sliderMax}
              step={1}
              value={effectiveCount}
              onChange={handleTrendCountChange}
              className="flex-1 accent-accent h-1 cursor-pointer"
              aria-label="Trend chart x-axis range"
            />
            <span className="text-secondary font-mono shrink-0 w-20 text-right">
              {effectiveCount} window{effectiveCount === 1 ? '' : 's'}
              {effectiveCount === sliderMax && <span className="text-faint"> · all</span>}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={visibleTrend} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={[domainMin, domainMax]}
                allowDataOverflow={false}
                ticks={visibleDayTicks.length ? visibleDayTicks : undefined}
                interval={0}
                tick={{ fill: '#6b7280', fontSize: 9 }}
                tickFormatter={(v) =>
                  new Date(Number(v)).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', timeZone: 'UTC',
                  })
                }
              />
              <YAxis
                type="number"
                scale="log"
                domain={['dataMin', 'dataMax']}
                allowDataOverflow={false}
                tick={{ fill: '#6b7280', fontSize: 10 }}
                tickFormatter={(v) => formatTokens(v)}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v, name, props: any) => {
                  if (name === 'confidenceRange') return [null, null];
                  if (name === 'budget') {
                    const day = props?.payload?.dayName;
                    return [formatTokens(Number(v)), day ? `Est. Allotment (${day})` : 'Est. Allotment'];
                  }
                  return [String(v), String(name)];
                }}
                labelFormatter={(v) =>
                  new Date(Number(v)).toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })
                }
              />
              {/* Back-most layer: smoothed confidence ribbon. Two-pass box filter
                  (4-pt → 3-pt) over [low, high] anchors at every window's open-ts and
                  close-ts, sorted chronologically. The Gaussian-approximating kernel
                  suppresses the boundary kinks that broke the prior single-pass band. */}
              <Area
                data={trendRibbon}
                type="monotone"
                dataKey="confidenceRange"
                stroke="none"
                fill="#9ca3af"
                fillOpacity={0.4}
                isAnimationActive={false}
                legendType="none"
              />
              {/* Mid layer: 5h horizontal span per window (open-time → close-time at allotment) */}
              {visibleTrend.map((p) => (
                <ReferenceLine
                  key={`trend-5h-${p.ts}`}
                  segment={[
                    { x: p.ts, y: p.budget },
                    { x: p.tsEnd, y: p.budget },
                  ]}
                  stroke={dayGradientColor(p.dayName)}
                  strokeOpacity={0.5}
                  strokeWidth={1.5}
                  ifOverflow="visible"
                />
              ))}
              {/* Front layer: dot-only Line (transparent stroke) for hover + day-coded dots */}
              <Line
                type="monotone"
                dataKey="budget"
                stroke="transparent"
                strokeWidth={0}
                isAnimationActive={false}
                dot={(props: any) => {
                  const { cx, cy, payload, index } = props;
                  const color = dayGradientColor(payload?.dayName ?? 'Sun');
                  return (
                    <circle
                      key={`trend-dot-${index}`}
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={color}
                      stroke={color}
                    />
                  );
                }}
                activeDot={(props: any) => {
                  const { cx, cy, payload, index } = props;
                  const color = dayGradientColor(payload?.dayName ?? 'Sun');
                  return (
                    <circle
                      key={`trend-active-${index}`}
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          {/* Day-of-week gradient legend */}
          <div className="flex items-center gap-2 mt-2 justify-center text-[10px] text-muted">
            <span>Sun</span>
            <div
              className="h-2 w-32 rounded-full"
              style={{
                background: `linear-gradient(to right, ${dayGradientColor('Sun')}, ${dayGradientColor('Sat')})`,
              }}
              aria-label="Day-of-week gradient: Sun → Sat"
            />
            <span>Sat</span>
          </div>
        </div>
        );
      })()}

      {/* Chart 3: Scatter — hour-of-day vs budget (temporal pattern detection)
          Each window: filled dot = window opens; line connects open → close (midnight-aware).
          Color = Anthropic confidence (CV-derived).
          Smoothed trend curve: 2-point sliding average over start+end union (replaces the
          prior aggregated confidence band, which kept fracturing on disjoint hour coverage). */}
      <div className="mb-4">
        <div className="text-[10px] text-faint uppercase mb-2">
          Allotment by hour of day (temporal patterns)
          {LOCAL_TZ_ABBREV && <span className="ml-1 normal-case">· {LOCAL_TZ_ABBREV}</span>}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={hourRibbon} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 24]}
              ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={(v) => format12Hour(Number(v))}
              name="Hour"
            />
            <YAxis
              dataKey="budget"
              type="number"
              scale="log"
              domain={['dataMin', 'dataMax']}
              allowDataOverflow={false}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={(v) => formatTokens(v)}
              name="Allotment"
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name, props: any) => {
                if (name === 'confidenceRange') return [null, null];
                if (name === 'Allotment') {
                  const p = props?.payload ?? {};
                  const role = p.role ?? '';
                  const conf = p.confidence ?? '';
                  const cv = p.confidenceCv != null ? ` (CV ${p.confidenceCv}%)` : '';
                  const tag = role ? ` — ${role}` : '';
                  return [formatTokens(Number(value)), `Allotment${tag} · ${conf}${cv}`];
                }
                if (name === 'Hour') {
                  // Format fractional hour (e.g. 14.27) as HH:MM (e.g. 14:16). The double
                  // modulo handles any negative wrap; total minutes is rounded for stability.
                  const v = Number(value);
                  const wrapped = ((v % 24) + 24) % 24;
                  const totalMinutes = Math.round(wrapped * 60);
                  const hh = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
                  const mm = (totalMinutes % 60).toString().padStart(2, '0');
                  return [`${hh}:${mm}`, 'Hour'];
                }
                return [String(value), String(name)];
              }}
              labelFormatter={(_l: any, payload: any) => {
                const p = payload?.[0]?.payload;
                return p?.windowLabel ? `Window: ${p.windowLabel}` : '';
              }}
            />
            {/* Back-most layer: smoothed confidence ribbon. Per-window [low, high]
                anchors at start-hour AND close-hour, sorted by hour, then two-pass
                box filter (4-pt → 3-pt) approximating a Gaussian kernel. The second
                pass is the discontinuity-suppressor: a single box pass leaves visible
                kinks where adjacent windows' CV% changes sharply; convolving with a
                second narrower box softens those kinks toward a continuous gradient. */}
            <Area
              type="monotone"
              dataKey="confidenceRange"
              stroke="none"
              fill="#9ca3af"
              fillOpacity={0.4}
              isAnimationActive={false}
              legendType="none"
            />
            {/* Connecting line per window (or two segments for midnight wrap) */}
            {windowSegments.map((seg) => (
              <ReferenceLine
                key={`seg-${seg.id}`}
                segment={[seg.start, seg.end]}
                stroke={seg.color}
                strokeOpacity={0.5}
                strokeWidth={1.5}
                ifOverflow="visible"
              />
            ))}
            {/* Filled dots: window OPEN time (close-time hollow circles removed) */}
            <Scatter
              data={startDots.map((d) => ({ ...d, role: 'open' }))}
              name="Allotment"
              shape={(props: any) => (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={5}
                  fill={props.payload.color}
                  stroke={props.payload.color}
                  strokeWidth={1}
                />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Confidence legend — color encodes Anthropic confidence; gray band = ±CV% range */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 justify-center text-[10px] text-muted">
        <div className="flex items-center gap-1.5">
          <svg width="14" height="14" aria-hidden="true">
            <rect x="6" y="2" width="2" height="10" fill="#9ca3af" fillOpacity="0.35" />
          </svg>
          <span>±CV% range</span>
        </div>
        <span className="text-faint">·</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CONFIDENCE_COLORS.high }} />
          <span>High confidence</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CONFIDENCE_COLORS.medium }} />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CONFIDENCE_COLORS.low }} />
          <span>Low</span>
        </div>
      </div>

      {/* Summary table — most recent 7 windows for at-a-glance recency */}
      <div className="mt-4 overflow-x-auto">
        <div className="text-[10px] text-faint mb-1">
          Most recent {recentWindows.length} of {windows.length} windows
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-faint border-b border-default">
              <th className="text-left py-1.5 font-medium">Window</th>
              <th className="text-right py-1.5 font-medium">Util %</th>
              <th className="text-right py-1.5 font-medium">Tokens</th>
              <th className="text-right py-1.5 font-medium">Est. Allotment</th>
              <th className="text-right py-1.5 font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {recentWindows.map((w) => (
              <tr key={w.window_reset} className="border-b border-default/50">
                <td className="py-1.5 text-secondary">
                  {w.day_name} {w.hour_of_day}:00
                </td>
                <td className="text-right font-mono text-secondary">
                  {(w.final_utilization * 100).toFixed(0)}%
                </td>
                <td className="text-right font-mono text-secondary">
                  {formatTokens(w.total_tokens)}
                </td>
                <td className="text-right font-mono font-semibold text-secondary">
                  {formatTokens(w.estimated_budget)}
                </td>
                <td className="text-right">
                  <span className={`text-[10px] font-semibold uppercase ${
                    w.confidence_label === 'high' ? 'text-emerald-400' :
                    w.confidence_label === 'medium' ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {w.confidence_label}
                    {w.confidence_cv_pct != null ? ` (${w.confidence_cv_pct}%)` : ''}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Panel 6: Burn Rate Curve (Improvement #4) ──

const WINDOW_LINE_COLORS = ['#A366AB', '#60a5fa', '#4ade80', '#f97316', '#ef4444', '#eab308', '#8b5cf6'];

const BURN_RATE_DEFAULT_COUNT = 7;
const BURN_RATE_MIN = 1;
const BURN_RATE_MAX = 30;
const BURN_RATE_LS_KEY = 'aifred.usage.burn-rate-count';

function readBurnRateCount(): number {
  if (typeof window === 'undefined') return BURN_RATE_DEFAULT_COUNT;
  try {
    const stored = window.localStorage.getItem(BURN_RATE_LS_KEY);
    if (!stored) return BURN_RATE_DEFAULT_COUNT;
    const parsed = parseInt(stored, 10);
    if (Number.isNaN(parsed)) return BURN_RATE_DEFAULT_COUNT;
    return Math.max(BURN_RATE_MIN, Math.min(BURN_RATE_MAX, parsed));
  } catch {
    return BURN_RATE_DEFAULT_COUNT;
  }
}

const OBSERVABLE_THRESHOLD = 0.75;  // util ≥ 75% → 'observable' (gray)
const NEAR_MISS_THRESHOLD = 0.95;
const EXTRA_USAGE_THRESHOLD = 1.0;  // util > 100% → Extra Usage category
const HUNTER_GREEN = '#355E3B';
const RATE_LIMIT_WINDOW_DEFAULT = 7;
const RATE_LIMIT_WINDOW_MIN = 1;
// Hard sanity ceiling. Effective slider max is min(this, dataExtentDays).
const RATE_LIMIT_WINDOW_MAX = 90;
const RATE_LIMIT_WINDOW_LS_KEY = 'aifred.usage.rate-limit-window-days';

const TREND_WINDOW_DEFAULT = 14;
const TREND_WINDOW_MIN = 2;
const TREND_WINDOW_MAX = 90;
const TREND_WINDOW_LS_KEY = 'aifred.usage.trend-window-count';

function readTrendWindowCount(): number {
  if (typeof window === 'undefined') return TREND_WINDOW_DEFAULT;
  try {
    const stored = window.localStorage.getItem(TREND_WINDOW_LS_KEY);
    if (!stored) return TREND_WINDOW_DEFAULT;
    const parsed = parseInt(stored, 10);
    if (Number.isNaN(parsed)) return TREND_WINDOW_DEFAULT;
    return Math.max(TREND_WINDOW_MIN, Math.min(TREND_WINDOW_MAX, parsed));
  } catch {
    return TREND_WINDOW_DEFAULT;
  }
}

function readRateLimitWindow(): number {
  if (typeof window === 'undefined') return RATE_LIMIT_WINDOW_DEFAULT;
  try {
    const stored = window.localStorage.getItem(RATE_LIMIT_WINDOW_LS_KEY);
    if (!stored) return RATE_LIMIT_WINDOW_DEFAULT;
    const parsed = parseInt(stored, 10);
    if (Number.isNaN(parsed)) return RATE_LIMIT_WINDOW_DEFAULT;
    return Math.max(RATE_LIMIT_WINDOW_MIN, Math.min(RATE_LIMIT_WINDOW_MAX, parsed));
  } catch {
    return RATE_LIMIT_WINDOW_DEFAULT;
  }
}

function BurnRatePanel() {
  const { data, isLoading } = useBurnRateCurve();
  const [count, setCount] = useState<number>(readBurnRateCount);

  function handleCountChange(e: ChangeEvent<HTMLInputElement>) {
    const next = parseInt(e.target.value, 10);
    if (Number.isNaN(next)) return;
    const clamped = Math.max(BURN_RATE_MIN, Math.min(BURN_RATE_MAX, next));
    setCount(clamped);
    try {
      window.localStorage.setItem(BURN_RATE_LS_KEY, String(clamped));
    } catch {
      // localStorage write may fail in private mode; live-state still updates
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-secondary mb-4">Utilization Burn Rate</h3>
        <div className="flex-1 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  const allWindows = data?.windows ?? [];

  if (!allWindows.length) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-secondary mb-4">Utilization Burn Rate</h3>
        <div className="flex-1 flex items-center justify-center">
          <NoProxyData message="No burn rate data yet." />
        </div>
      </div>
    );
  }

  // slice(-count) silently returns the full array if count > length;
  // accumulating data degrades gracefully without explicit clamping.
  const windows = allWindows.slice(-count);
  const showingAll = windows.length === allWindows.length;

  // Linear least-squares regression across all visible (elapsed_h, util%) points.
  // Recomputes naturally on every render — slider change OR live data refetch
  // (useBurnRateCurve refetches every 10s) both flow through windows[].
  const allPoints: Array<{ x: number; y: number }> = [];
  for (const w of windows) {
    for (const p of w.points) {
      allPoints.push({
        x: p.elapsed_seconds / 3600,
        y: p.utilization * 100,
      });
    }
  }
  // Through-origin linear regression: y = slope * x. Y-intercept is fixed at 0%
  // because utilization is always 0% at hour 0 of any window — physical constraint.
  // Closed-form solution for slope when intercept = 0: slope = Σ(xy) / Σ(x²).
  let slope = 0;
  if (allPoints.length >= 1) {
    let sumXY = 0;
    let sumXX = 0;
    for (const p of allPoints) {
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
    }
    if (sumXX > 0) slope = sumXY / sumXX;
  }
  // Densified projection over [0, 5h] at 0.1h intervals (51 points). The dense
  // activation domain ensures hover near any window-line point bundles a fitData
  // point into the same Recharts payload, so the custom Tooltip below always has
  // window data to render rather than activating on the trendline alone.
  const fitData = Array.from({ length: 51 }, (_, i) => {
    const x = i * 0.1;
    return { elapsed_h: +x.toFixed(2), utilization: +(slope * x).toFixed(2) };
  });
  // Project to end-of-window — labeled as "average usage" in the caption.
  const projectedAt5h = Math.max(0, slope * 5);
  // Y-axis cap: max of 100% OR the highest real-data y across all visible windows.
  // The y=x reference line (which reaches 100 at x=5) is EXCLUDED from this max
  // — it must never push the cap higher. The best-fit line is also excluded.
  let maxYAcrossWindows = 0;
  for (const w of windows) {
    for (const p of w.points) {
      const yPct = p.utilization * 100;
      if (yPct > maxYAcrossWindows) maxYAcrossWindows = yPct;
    }
  }
  const burnYCap = Math.max(100, Math.ceil(maxYAcrossWindows / 10) * 10);
  // y=x sustainable-burn reference: at any % of window elapsed, ideal utilization
  // matches. Endpoints are (0, 0) and (5, 100) — the 5h-pace-equal-to-window line.
  const sustainableLineData = [
    { elapsed_h: 0, utilization: 0 },
    { elapsed_h: 5, utilization: 100 },
  ];

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-secondary">Utilization Burn Rate</h3>
        <span className="text-xs text-muted">
          {showingAll
            ? `${windows.length} windows`
            : `last ${windows.length} of ${allWindows.length}`}
        </span>
      </div>
      <div className="text-[10px] text-faint mb-3">
        Utilization % vs. elapsed hours within each 5h window. Steeper = faster burn.
        {allPoints.length >= 2 && (
          <>
            {' '}Best-fit slope:{' '}
            <span className="text-amber-400 font-mono">
              {slope >= 0 ? '+' : ''}
              {slope.toFixed(1)}%/h
            </span>
            {' '}· estimated{' '}
            <span className="text-amber-400 font-mono">{projectedAt5h.toFixed(0)}%</span>
            {' '}average usage.
          </>
        )}
      </div>

      {/* Window-count slider — client-side slice; localStorage-persisted */}
      <div className="flex items-center gap-3 mb-4 text-[10px]">
        <label htmlFor="burn-rate-count" className="text-muted shrink-0 uppercase tracking-wide">
          Show last
        </label>
        <input
          id="burn-rate-count"
          type="range"
          min={BURN_RATE_MIN}
          max={BURN_RATE_MAX}
          step={1}
          value={count}
          onChange={handleCountChange}
          className="flex-1 accent-accent h-1 cursor-pointer"
          aria-label="Number of burn-rate windows to display"
        />
        <span className="text-secondary font-mono shrink-0 w-14 text-right">
          {count} window{count === 1 ? '' : 's'}
        </span>
      </div>

      {/* Chart fills remaining card height; min-h prevents collapse on short viewports */}
      <div className="flex-1 min-h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(239, 68, 68, 0.10)"
              horizontal
              vertical
            />
            <XAxis
              dataKey="elapsed_h"
              type="number"
              domain={[0, 5]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={(v) => `${v}h`}
              allowDuplicatedCategory={false}
            />
            <YAxis
              domain={[0, burnYCap]}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={(v) => `${v}%`}
              allowDataOverflow
            />
            {/* Custom content filters out the "Best fit" trendline series — hover should
                report actual window utilization at the cursor x, not the linear-fit projection.
                Densified fitData (above) ensures a fit point is always near the cursor, so
                window-line entries are reliably bundled into the payload. Returns null when
                no window data is present (rare; suppresses tooltip rather than showing fit). */}
            <Tooltip
              cursor={{ stroke: '#374151', strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const windowEntries = payload.filter(
                  (p: any) => p.name !== 'Best fit' && p.name !== 'Sustainable (y=x)'
                );
                if (!windowEntries.length) return null;
                return (
                  <div style={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    fontSize: '12px',
                    padding: '8px 12px',
                  }}>
                    <div style={{ color: '#9ca3af', fontSize: 11, marginBottom: 4 }}>
                      {Number(label).toFixed(2)}h elapsed
                    </div>
                    {windowEntries.map((entry: any, idx: number) => (
                      <div key={idx} style={{ color: entry.color || entry.stroke || '#e5e7eb' }}>
                        {entry.name}: {entry.value}%
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {/* Top border line (red 35% alpha) — visible chart frame */}
            <ReferenceLine y={100} stroke="rgba(239, 68, 68, 0.35)" strokeWidth={1} />
            {/* y=x sustainable burn reference. Always (0,0)→(5,100); never sets axis scale. */}
            <Line
              data={sustainableLineData}
              type="linear"
              dataKey="utilization"
              name="Sustainable (y=x)"
              stroke="#22c55e"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            {windows.map((w, idx) => {
              const color = WINDOW_LINE_COLORS[idx % WINDOW_LINE_COLORS.length];
              const rawPoints = w.points.map((p) => ({
                elapsed_h: +(p.elapsed_seconds / 3600).toFixed(3),
                utilization: +(p.utilization * 100).toFixed(1),
              }));
              const firstH = rawPoints.length ? rawPoints[0].elapsed_h : 0;
              const lineData = firstH > 0.1
                ? [{ elapsed_h: 0, utilization: 0 }, ...rawPoints]
                : rawPoints;
              return (
                <Line
                  key={w.window_reset}
                  data={lineData}
                  type="monotone"
                  dataKey="utilization"
                  name={`${w.day_name}`}
                  stroke={color}
                  dot={false}
                  strokeWidth={2}
                />
              );
          })}
            {/* Best-fit linear regression — recomputes on slider change + 10s data refetch */}
            {allPoints.length >= 2 && (
              <Line
                data={fitData}
                type="linear"
                dataKey="utilization"
                name="Best fit"
                stroke="#facc15"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
                legendType="none"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Panel 7: Prompt Cache Performance (Improvement #5) ──

const CACHE_HOURS_DEFAULT = 5;
const CACHE_HOURS_MIN = 1;
const CACHE_HOURS_MAX = 168;
const CACHE_HOURS_LS_KEY = 'aifred.usage.cache-window-hours';

function readCacheHoursWindow(): number {
  if (typeof window === 'undefined') return CACHE_HOURS_DEFAULT;
  try {
    const stored = window.localStorage.getItem(CACHE_HOURS_LS_KEY);
    if (!stored) return CACHE_HOURS_DEFAULT;
    const parsed = parseInt(stored, 10);
    if (Number.isNaN(parsed)) return CACHE_HOURS_DEFAULT;
    return Math.max(CACHE_HOURS_MIN, Math.min(CACHE_HOURS_MAX, parsed));
  } catch {
    return CACHE_HOURS_DEFAULT;
  }
}

function formatHoursLabel(h: number): string {
  if (h >= 24) {
    const d = h / 24;
    return d % 1 === 0 ? `${d}d` : `${d.toFixed(1)}d`;
  }
  return `${h}h`;
}

function CachePanel() {
  const { data, isLoading } = useCacheEffectiveness();
  const { data: budgetHistory } = useSessionBudgetHistory();
  const [hoursWindow, setHoursWindow] = useState<number>(readCacheHoursWindow);

  function handleHoursChange(e: ChangeEvent<HTMLInputElement>) {
    const next = parseInt(e.target.value, 10);
    if (Number.isNaN(next)) return;
    const clamped = Math.max(CACHE_HOURS_MIN, Math.min(CACHE_HOURS_MAX, next));
    setHoursWindow(clamped);
    try {
      window.localStorage.setItem(CACHE_HOURS_LS_KEY, String(clamped));
    } catch {
      // localStorage unavailable in private mode; live state still updates
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Prompt Cache Performance</h3>
        <div className="h-48 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  if (data?.status === 'no_proxy_data' || !data?.points?.length) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Prompt Cache Performance</h3>
        <NoProxyData message={data?.message} />
      </div>
    );
  }

  const overall = data.overall_cache_hit_ratio ?? 0;
  const lifetimeSavings = data.estimated_savings_factor ?? 1;

  // Filter points to last X hours per slider
  const cutoffMs = Date.now() - hoursWindow * 3600 * 1000;
  const filtered = data.points.filter((p) => new Date(p.timestamp).getTime() >= cutoffMs);

  // Window-scoped stats (recomputed from filtered points; do not reuse lifetime totals)
  const wReads = filtered.reduce((s, p) => s + (p.cache_read_tokens ?? 0), 0);
  const wInput = filtered.reduce((s, p) => s + (p.input_tokens ?? 0), 0);
  const wDenom = wInput + wReads;
  const wHit = wDenom > 0 ? wReads / wDenom : 0;
  const wCharged = wInput + 0.1 * wReads;
  const wSavings = wCharged > 0 ? wDenom / wCharged : 1;

  // Chart data: timestamp-based, with token volumes for bars.
  // Rolling avg recomputed client-side over a SMALL window (4 requests) so
  // dips show as actual dips. Server's `rolling_avg` uses window=10 which
  // smooths out exactly the dips we want to see.
  const ROLLING_WINDOW = 4;
  const hits = filtered.map((p) => p.cache_hit_ratio);
  const customRolling: number[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = Math.max(0, i - ROLLING_WINDOW + 1);
    const slice = hits.slice(start, i + 1);
    customRolling.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  const chartData = filtered.map((p, i) => ({
    t: new Date(p.timestamp).getTime(),
    hit: +(p.cache_hit_ratio * 100).toFixed(1),
    rolling: +(customRolling[i] * 100).toFixed(1),
    cacheReads: p.cache_read_tokens ?? 0,
    inputTokens: p.input_tokens ?? 0,
    model: p.model,
  }));

  // Cold-start detection: model swap or sudden hit drop (≥90% → <10%)
  const coldStarts: Array<{ t: number; reason: string }> = [];
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1];
    const curr = filtered[i];
    if (prev.model !== curr.model) {
      const shortModel = curr.model.replace('claude-', '').replace(/-20\d{6}$/, '');
      coldStarts.push({
        t: new Date(curr.timestamp).getTime(),
        reason: `→ ${shortModel}`,
      });
    } else if (prev.cache_hit_ratio > 0.9 && curr.cache_hit_ratio < 0.1) {
      coldStarts.push({
        t: new Date(curr.timestamp).getTime(),
        reason: 'invalidated',
      });
    }
  }

  const minT = chartData[0]?.t;
  const maxT = chartData[chartData.length - 1]?.t;

  // X-axis ticks: one per distinct UTC date in the visible window, anchored at 12:00 UTC of that date.
  // Format is numeric m/d (e.g., "5/6"). Independent of range; single label per date always.
  const dateTickValues: number[] = [];
  const seenDateKeys = new Set<string>();
  for (const p of chartData) {
    const dateKey = new Date(p.t).toISOString().slice(0, 10);
    if (seenDateKeys.has(dateKey)) continue;
    seenDateKeys.add(dateKey);
    const noonMs = new Date(`${dateKey}T12:00:00Z`).getTime();
    if (minT != null && maxT != null && noonMs >= minT && noonMs <= maxT) {
      dateTickValues.push(noonMs);
    } else if (minT != null && maxT != null) {
      // Edge case: if the date's noon is outside the data range, still include the tick at the
      // closest point so the tick appears on the axis.
      dateTickValues.push(Math.max(minT, Math.min(maxT, noonMs)));
    }
  }

  const tickFormatter = (v: number) => {
    const d = new Date(Number(v));
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };

  // 5h session blocks (window start → window_reset) drawn just above x-axis.
  // Sourced from session-budget-history. Filtered to the visible cache-chart x-domain.
  const sessionBlocks: Array<{ x1: number; x2: number; reset: string }> = [];
  if (budgetHistory?.windows && minT != null && maxT != null) {
    for (const w of budgetHistory.windows) {
      const x1 = new Date(w.first_request).getTime();
      const x2 = new Date(w.window_reset).getTime();
      if (x2 < minT || x1 > maxT) continue;
      sessionBlocks.push({
        x1: Math.max(x1, minT),
        x2: Math.min(x2, maxT),
        reset: w.window_reset,
      });
    }
  }

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-secondary">Prompt Cache Performance</h3>
        <span className="text-xs text-muted">
          {filtered.length} of {data.points.length} requests
        </span>
      </div>
      <div className="text-[10px] text-faint mb-4 max-w-2xl">
        Cached prompt tokens cost 10× less than cold input. Hit rate stays near 100% when
        prompts repeat — drops mark cache invalidation (model swap, system-prompt change,
        or session boundary).
      </div>

      {/* Stat boxes — window-scoped to slider selection */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center p-2 rounded bg-surface-2">
          <div className="text-[10px] text-faint uppercase">Hit Rate</div>
          <div
            className={`text-lg font-mono font-semibold ${
              wHit >= 0.9 ? 'text-emerald-400' : wHit >= 0.5 ? 'text-amber-400' : 'text-secondary'
            }`}
          >
            {(wHit * 100).toFixed(1)}%
          </div>
        </div>
        <div className="text-center p-2 rounded bg-surface-2">
          <div className="text-[10px] text-faint uppercase">Cached Tokens</div>
          <div className="text-lg font-mono font-semibold text-secondary">
            {formatTokens(wReads)}
          </div>
        </div>
        <div
          className="text-center p-2 rounded bg-surface-2"
          title="vs. charging cache reads at full input rate (Anthropic discounts cache reads to 0.1×)"
        >
          <div className="text-[10px] text-faint uppercase">Savings vs. Cold</div>
          <div className="text-lg font-mono font-semibold text-emerald-400">
            {wSavings.toFixed(1)}×
          </div>
        </div>
      </div>

      {/* Time-window slider */}
      <div className="flex items-center gap-3 mb-4 text-[10px]">
        <label htmlFor="cache-hours-window" className="text-muted shrink-0 uppercase tracking-wide">
          Show last
        </label>
        <input
          id="cache-hours-window"
          type="range"
          min={CACHE_HOURS_MIN}
          max={CACHE_HOURS_MAX}
          step={1}
          value={hoursWindow}
          onChange={handleHoursChange}
          className="flex-1 accent-emerald-500 h-1 cursor-pointer"
          aria-label="Cache history window in hours"
        />
        <span className="text-secondary font-mono shrink-0 w-16 text-right">
          {formatHoursLabel(hoursWindow)}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 35, bottom: 0, left: -10 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(239, 68, 68, 0.10)"
            horizontal
            vertical
          />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            ticks={dateTickValues.length ? dateTickValues : undefined}
            interval={dateTickValues.length ? 0 : 'preserveStartEnd'}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickFormatter={tickFormatter}
          />
          {/* Top-border red line at 100% (left axis) — visible chart frame */}
          <ReferenceLine yAxisId="left" y={100} stroke="rgba(239, 68, 68, 0.35)" strokeWidth={1} />
          {/* 5h session blocks — drawn just above x-axis, rounded gray rectangles, 25% opacity */}
          {sessionBlocks.map((b) => (
            <ReferenceArea
              key={`session-${b.reset}`}
              yAxisId="left"
              x1={b.x1}
              x2={b.x2}
              y1={0}
              y2={3}
              shape={(props: any) => (
                <rect
                  x={props.x}
                  y={props.y}
                  width={Math.max(props.width, 1)}
                  height={Math.max(props.height, 1)}
                  rx={3}
                  ry={3}
                  fill="#9ca3af"
                  fillOpacity={0.25}
                />
              )}
              ifOverflow="visible"
            />
          ))}
          <YAxis
            yAxisId="left"
            domain={[0, 100]}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            scale="log"
            domain={[1, 'auto']}
            allowDataOverflow
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickFormatter={(v) => formatTokens(Number(v))}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof chartData)[0];
              const shortModel = p.model.replace('claude-', '').replace(/-20\d{6}$/, '');
              return (
                <div
                  style={TOOLTIP_STYLE}
                  className="px-2.5 py-1.5 text-[11px] space-y-0.5 leading-tight"
                >
                  <div className="text-muted">
                    {new Date(p.t).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: false,
                    })}
                  </div>
                  <div className="text-emerald-400 font-mono">Rolling: {p.rolling}%</div>
                  <div className="text-emerald-300/70 font-mono">This call: {p.hit}%</div>
                  <div className="text-blue-300 font-mono">
                    Reads: {formatTokens(p.cacheReads)} · Cold: {formatTokens(p.inputTokens)}
                  </div>
                  <div className="text-faint">{shortModel}</div>
                </div>
              );
            }}
          />
          {/* Cache reads (right axis, log scale) — visible blue line, drawn above grid */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="cacheReads"
            stroke="#60a5fa"
            strokeWidth={1.5}
            strokeOpacity={0.85}
            dot={false}
            isAnimationActive={false}
          />
          {/* Rolling avg (left axis) — primary trend line; window=4 to expose dips */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="rolling"
            stroke="#4ade80"
            dot={false}
            strokeWidth={3}
          />
          {/* Cold-start reference lines — orange dashed verticals */}
          {coldStarts.map((cs, i) => (
            <ReferenceLine
              key={`cs-${i}-${cs.t}`}
              yAxisId="left"
              x={cs.t}
              stroke="#f97316"
              strokeDasharray="3 3"
              strokeOpacity={0.55}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend — explicit so glyphs aren't guessed at */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-emerald-400" />
          Rolling avg (window={ROLLING_WINDOW})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-blue-400/85" />
          Cache reads (right axis, log)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-1 rounded-sm bg-gray-400/40" />
          5h session block
        </span>
        {coldStarts.length > 0 && (
          <span
            className="flex items-center gap-1.5"
            title="Vertical dashed lines mark events where cache was invalidated (model swap or sudden hit drop)"
          >
            <span className="inline-block w-3 border-t border-dashed border-orange-500" />
            Cold-start ({coldStarts.length})
          </span>
        )}
      </div>

      {/* Lifetime context — small footer showing the all-data baseline */}
      <div className="text-[10px] text-faint mt-3 pt-3 border-t border-default">
        Lifetime baseline: {(overall * 100).toFixed(1)}% hit · {lifetimeSavings.toFixed(1)}× savings ·{' '}
        {data.request_count} requests captured.
      </div>
    </div>
  );
}

// ── Panel 8: 429 Rejection Forensics (Improvement #6) ──

function RejectionsPanel() {
  const { data, isLoading } = useRejectionEvents();
  const [dayWindow, setDayWindow] = useState<number>(readRateLimitWindow);

  function handleDayWindowChange(e: ChangeEvent<HTMLInputElement>) {
    const next = parseInt(e.target.value, 10);
    if (Number.isNaN(next)) return;
    const clamped = Math.max(RATE_LIMIT_WINDOW_MIN, Math.min(RATE_LIMIT_WINDOW_MAX, next));
    setDayWindow(clamped);
    try {
      window.localStorage.setItem(RATE_LIMIT_WINDOW_LS_KEY, String(clamped));
    } catch {
      // localStorage write may fail in private mode; live state still updates
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-4">Rate Limit Events</h3>
        <div className="h-48 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  const rejections = data?.rejections ?? [];
  const nearMisses = data?.near_misses ?? [];

  // Disjoint event categories on the event-state axis (not source axis):
  //   util > 100%        → 'extra'      (Hunter Green) — over-budget; takes precedence over 429/near-miss
  //   util ≤ 100% + 429  → 'rejection'  (red)
  //   util ∈ [95%,100%]  → 'near-miss'  (amber, 50% opacity)
  //   util ∈ [75%, 95%)  → 'observable' (gray, 35% opacity) — low-attention background context
  // A 429 reported at util=103% is shown as Extra Usage, not as a 429 — per user recategorization rule.
  type CategorizedEvent = {
    ts: number;
    util: number;
    kind: 'observable' | 'near-miss' | 'rejection' | 'extra';
  };
  const allEvents: CategorizedEvent[] = [];
  for (const nm of nearMisses) {
    const u = nm.utilization;
    const ts = new Date(nm.timestamp).getTime();
    if (u > EXTRA_USAGE_THRESHOLD) {
      allEvents.push({ ts, util: +(u * 100).toFixed(2), kind: 'extra' });
    } else if (u >= NEAR_MISS_THRESHOLD) {
      allEvents.push({ ts, util: +(u * 100).toFixed(2), kind: 'near-miss' });
    } else if (u >= OBSERVABLE_THRESHOLD) {
      allEvents.push({ ts, util: +(u * 100).toFixed(2), kind: 'observable' });
    }
  }
  for (const r of rejections) {
    const u = r.five_hour_utilization ?? 1;
    const ts = new Date(r.timestamp).getTime();
    if (u > EXTRA_USAGE_THRESHOLD) {
      allEvents.push({ ts, util: +(u * 100).toFixed(2), kind: 'extra' });
    } else {
      allEvents.push({ ts, util: +(u * 100).toFixed(2), kind: 'rejection' });
    }
  }

  // Dynamic slider max — slider's right end equals "show all data we have".
  // As more days accumulate, the slider's range grows automatically.
  const oldestEventMs = allEvents.length
    ? Math.min(...allEvents.map((e) => e.ts))
    : null;
  const dataExtentDays = oldestEventMs
    ? Math.max(1, Math.ceil((Date.now() - oldestEventMs) / 86_400_000))
    : RATE_LIMIT_WINDOW_DEFAULT;
  const effectiveSliderMax = Math.min(RATE_LIMIT_WINDOW_MAX, dataExtentDays);
  const effectiveDayWindow = Math.min(dayWindow, effectiveSliderMax);
  const cutoffMs = Date.now() - effectiveDayWindow * 86_400_000;

  const visibleEvents = allEvents.filter((e) => e.ts >= cutoffMs);
  const visibleObservable = visibleEvents.filter((e) => e.kind === 'observable');
  const visibleNearMisses = visibleEvents.filter((e) => e.kind === 'near-miss');
  const visibleRejections = visibleEvents.filter((e) => e.kind === 'rejection');
  const visibleExtraUsage = visibleEvents.filter((e) => e.kind === 'extra');

  const totalNearMisses = allEvents.filter((e) => e.kind === 'near-miss').length;
  const totalRejections = allEvents.filter((e) => e.kind === 'rejection').length;
  const totalExtraUsage = allEvents.filter((e) => e.kind === 'extra').length;

  const observableFloorPct = Math.round(OBSERVABLE_THRESHOLD * 100);
  const thresholdPct = Math.round(NEAR_MISS_THRESHOLD * 100);
  const yAxisCeilPct = 105;
  // Y-axis: 10% increments. Anchored at multiples of 10 within [floor, ceil].
  const yAxisTicks: number[] = [];
  for (let v = Math.ceil(observableFloorPct / 10) * 10; v <= yAxisCeilPct; v += 10) yAxisTicks.push(v);
  const yAxisLabelFor = (v: number) => `${v}%`;

  // X-axis: ensure a tick at every UTC midnight in the visible window so day labels persist
  // even on days with zero events; recomputes on slider change.
  const xAxisDomainMin = effectiveDayWindow > 0 ? cutoffMs : Date.now() - 86_400_000;
  const xAxisDomainMax = Date.now();
  const dayTicks: number[] = [];
  {
    const start = new Date(xAxisDomainMin);
    start.setUTCHours(0, 0, 0, 0);
    let d = start.getTime();
    // Step by 1 calendar day; include any midnight whose +24h overlaps the window.
    while (d <= xAxisDomainMax + 86_400_000) {
      if (d >= xAxisDomainMin - 86_400_000) dayTicks.push(d);
      d += 86_400_000;
    }
  }

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-secondary">Rate Limit Events</h3>
        <div className="flex gap-3 text-xs">
          <span className="text-red-400 font-mono">{totalRejections} 429s</span>
          <span className="text-amber-400 font-mono">{totalNearMisses} near-miss</span>
          <span className="font-mono" style={{ color: HUNTER_GREEN }}>{totalExtraUsage} extra</span>
        </div>
      </div>

      {allEvents.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center">
          <div className="text-2xl mb-2">✓</div>
          <div className="text-sm text-emerald-400 font-semibold">No Rate Limit Events</div>
          <div className="text-xs text-faint mt-1">
            No 429 rejections, near-misses (≥{thresholdPct}% util), or extra-usage events recorded.
          </div>
        </div>
      ) : (
        <>
          {/* Combined event scatter — actual timestamps; layering: near-miss → 429 → extra (front) */}
          <div className="mb-4">
            {/* Day-window slider — chart-only filter; localStorage-persisted; max=actual data extent */}
            <div className="flex items-center gap-3 mb-2 text-[10px]">
              <label
                htmlFor="rate-limit-window-days"
                className="text-muted shrink-0 uppercase tracking-wide"
              >
                Show last
              </label>
              <input
                id="rate-limit-window-days"
                type="range"
                min={RATE_LIMIT_WINDOW_MIN}
                max={effectiveSliderMax}
                step={1}
                value={effectiveDayWindow}
                onChange={handleDayWindowChange}
                className="flex-1 accent-accent h-1 cursor-pointer"
                aria-label="Rate-limit chart day window"
              />
              <span className="text-secondary font-mono shrink-0 w-20 text-right">
                {effectiveDayWindow}d
                {effectiveDayWindow === effectiveSliderMax && (
                  <span className="text-faint"> · all</span>
                )}
              </span>
            </div>
            <div className="text-[10px] text-faint mb-2">
              Rate-limit events by time of occurrence — {visibleObservable.length} observable
              {' '}(≥{observableFloorPct}%) · {visibleNearMisses.length} near-miss · {visibleRejections.length} 429
              {' '}· {visibleExtraUsage.length} extra in last {effectiveDayWindow}d
            </div>
            {visibleEvents.length === 0 ? (
              <div className="h-[315px] flex items-center justify-center text-faint text-xs border border-dashed border-default rounded">
                No rate-limit events in last {effectiveDayWindow}d (try widening the window)
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={315}>
                <ScatterChart margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={[xAxisDomainMin, xAxisDomainMax]}
                    scale="time"
                    ticks={dayTicks}
                    interval={0}
                    allowDataOverflow={false}
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={(v) =>
                      new Date(Number(v)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    }
                  />
                  <YAxis
                    dataKey="util"
                    domain={[observableFloorPct, yAxisCeilPct]}
                    ticks={yAxisTicks}
                    tick={{ fill: '#6b7280', fontSize: 9 }}
                    tickFormatter={yAxisLabelFor}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ strokeDasharray: '3 3' }}
                    formatter={(value, name, props: any) => {
                      if (name === 'util') {
                        const k = props?.payload?.kind;
                        const label =
                          k === 'rejection' ? '429 rejection' :
                          k === 'extra' ? 'Extra Usage (>100%)' :
                          k === 'observable' ? 'Observable (≥75%)' :
                          'near-miss';
                        return [`${value}%`, label];
                      }
                      return [String(value), String(name)];
                    }}
                    labelFormatter={(v) =>
                      new Date(Number(v)).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })
                    }
                  />
                  {/* Layer 0 (deepest back): observable (≥75% but <95%) — low-attention gray */}
                  {visibleObservable.length > 0 && (
                    <Scatter
                      data={visibleObservable}
                      fill="#9ca3af"
                      fillOpacity={0.35}
                      name="Observable"
                    />
                  )}
                  {/* Layer 1 (back): near-misses, 50% opacity */}
                  {visibleNearMisses.length > 0 && (
                    <Scatter
                      data={visibleNearMisses}
                      fill="#f59e0b"
                      fillOpacity={0.5}
                      name="Near-miss"
                    />
                  )}
                  {/* Layer 2 (mid): 429s — solid red, no border */}
                  {visibleRejections.length > 0 && (
                    <Scatter
                      data={visibleRejections}
                      name="429"
                      shape={(props: any) => (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={6}
                          fill="#ef4444"
                        />
                      )}
                    />
                  )}
                  {/* Layer 3 (front): Extra Usage — Hunter Green, takes precedence over 429s and near-misses */}
                  {visibleExtraUsage.length > 0 && (
                    <Scatter
                      data={visibleExtraUsage}
                      name="Extra Usage"
                      shape={(props: any) => (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={6}
                          fill={HUNTER_GREEN}
                        />
                      )}
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            )}
            {/* Legend — four categories */}
            <div className="flex items-center gap-4 mt-2 justify-center text-[10px] text-muted flex-wrap">
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden="true">
                  <circle cx="6" cy="6" r="4" fill="#9ca3af" fillOpacity="0.35" />
                </svg>
                <span>Observable ({observableFloorPct}–{thresholdPct - 1}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden="true">
                  <circle cx="6" cy="6" r="4" fill="#f59e0b" fillOpacity="0.5" />
                </svg>
                <span>Near-miss ({thresholdPct}–100%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" fill="#ef4444" />
                </svg>
                <span>429 rejection</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" fill={HUNTER_GREEN} />
                </svg>
                <span>Extra Usage (&gt;100%)</span>
              </div>
            </div>
          </div>

          {/* Rejections table — 10 most recent only */}
          {rejections.length > 0 && (
            <div className="overflow-x-auto">
              <div className="text-[10px] text-faint mb-1">
                Most recent {Math.min(10, rejections.length)} of {rejections.length} 429 rejections
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-faint border-b border-default">
                    <th className="text-left py-1 font-medium">Time</th>
                    <th className="text-right py-1 font-medium">Util %</th>
                    <th className="text-right py-1 font-medium">Retry</th>
                    <th className="text-right py-1 font-medium">Model</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rejections]
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .slice(0, 10)
                    .map((r, i) => (
                      <tr key={`${r.timestamp}-${i}`} className="border-b border-default/50">
                        <td className="py-1 text-secondary">
                          {r.day_name} {r.hour_of_day}:00
                        </td>
                        <td className="text-right font-mono text-red-400">
                          {r.five_hour_utilization != null
                            ? `${(r.five_hour_utilization * 100).toFixed(0)}%`
                            : '—'}
                        </td>
                        <td className="text-right font-mono text-secondary">
                          {r.retry_after_secs != null ? `${r.retry_after_secs}s` : '—'}
                        </td>
                        <td className="text-right text-secondary">
                          {r.model?.replace('claude-', '').replace(/-20\d{6}$/, '') ?? '—'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ──

export default function UsagePage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Header title="Usage — Anthropic Session Metrics" />

      <div className="text-xs text-faint bg-surface-2/50 rounded-lg p-3">
        All metrics sourced exclusively from Anthropic API response headers captured by the reverse proxy.
        &quot;Session&quot; refers to Anthropic&apos;s 5-hour current session window — not a Claude Code working session.
      </div>

      {/* Hero — at-a-glance 5h window state (time, tokens, burn rate, cache) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroTimeCard />
        <HeroTokensCard />
        <HeroBurnRateTokensCard />
        <HeroCacheCard />
      </div>

      {/* Trend — current-window dynamics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TimePanel />
        <SessionTokensPanel />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BurnRatePanel />
        <CachePanel />
      </div>

      {/* Detail — per-model + per-message decomposition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModelUsagePanel />
        <MessagePanel />
      </div>

      {/* History — across-window allotment + temporal patterns */}
      <SessionBudgetPanel />

      {/* Anomaly — rate-limit events / 429 forensics */}
      <RejectionsPanel />
    </div>
  );
}
