import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
  LineChart,
  Line,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from 'recharts';
import {
  useReportSummary,
  useReportCharts,
  useReportEvents,
  type WorkEvent,
  type WorkEventsSummary,
  type ReportFilters,
} from '../api/reports';
import { useThroughput } from '../api/tasks';
import { useAnalytics } from '../api/nexus-ops';
import { useStageMetrics } from '../api/stage-analytics';
import { StageTransitionCompact } from '../components/stages';

// --- Constants ---

const CHART_COLORS = [
  '#A366AB',
  '#7C5CBF',
  '#5B8DEF',
  '#4CAF50',
  '#FF9800',
  '#EF5350',
  '#26C6DA',
  '#AB47BC',
];

const PAGE_SIZE = 50;

type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | 'custom';

// --- Helpers ---

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

function presetToRange(key: PresetKey): { from: string; to: string } {
  const today = todayStr();
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = daysAgo(1);
      return { from: y, to: y };
    }
    case '7d':
      return { from: daysAgo(6), to: today };
    case '30d':
      return { from: daysAgo(29), to: today };
    default:
      return { from: daysAgo(6), to: today };
  }
}

function rangeDays(from: string, to: string): number {
  return Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1,
  );
}

function prevPeriod(from: string, to: string): { from: string; to: string } {
  const days = rangeDays(from, to);
  const fromDate = new Date(from);
  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - days + 1);
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

function formatRelativeTime(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDuration(secs: number): string {
  if (secs === 0) return '--';
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function actionBadgeClasses(action: string): string {
  switch (action) {
    case 'completed':
      return 'bg-green-500/20 text-green-400';
    case 'approved':
      return 'bg-blue-500/20 text-blue-400';
    case 'deferred':
    case 'proposed':
      return 'bg-orange-500/20 text-orange-400';
    case 'escalated':
    case 'failed':
      return 'bg-red-500/20 text-red-400';
    case 'parked':
      return 'bg-amber-500/20 text-amber-400';
    case 'skipped':
      return 'bg-surface-muted/20 text-muted';
    default:
      return 'bg-surface-muted/20 text-muted';
  }
}

function actorBadgeClasses(actor: string): string {
  if (actor.includes('david')) return 'bg-accent/20 text-accent-text';
  if (actor.includes('aurora')) return 'bg-purple-500/20 text-purple-400';
  if (actor.includes('executor')) return 'bg-cyan-500/20 text-cyan-400';
  if (actor.includes('infra')) return 'bg-amber-500/20 text-amber-400';
  if (actor.includes('research')) return 'bg-indigo-500/20 text-indigo-400';
  return 'bg-surface-muted/20 text-muted';
}

function valueRatingIndicator(rating: string | null): React.ReactNode {
  if (!rating) return <span className="text-disabled">--</span>;
  switch (rating) {
    case 'high':
      return (
        <span className="inline-flex gap-0.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="w-2 h-2 rounded-full bg-green-500" />
        </span>
      );
    case 'medium':
      return (
        <span className="inline-flex gap-0.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="w-2 h-2 rounded-full bg-surface-3" />
        </span>
      );
    case 'low':
      return (
        <span className="inline-flex gap-0.5">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="w-2 h-2 rounded-full bg-surface-3" />
          <span className="w-2 h-2 rounded-full bg-surface-3" />
        </span>
      );
    default:
      return <span className="text-disabled">--</span>;
  }
}

function computeValueScore(summary: WorkEventsSummary | undefined): string {
  if (!summary) return '--';
  const vb = summary.value_breakdown;
  const total = vb.high + vb.medium + vb.low + vb.unrated;
  if (total === 0) return '--';
  const rated = vb.high + vb.medium + vb.low;
  if (rated === 0) return '--';
  const score = ((vb.high * 3 + vb.medium * 2 + vb.low * 1) / (rated * 3)) * 100;
  return `${Math.round(score)}%`;
}

function exportCSV(events: WorkEvent[], from: string, to: string) {
  const headers = [
    'Timestamp',
    'Actor',
    'Action',
    'Task ID',
    'Task Title',
    'Domain',
    'Project',
    'Stage From',
    'Stage To',
    'Summary',
    'Value Rating',
    'Confidence',
  ];
  const rows = events.map((e) => [
    e.timestamp,
    e.actor,
    e.action,
    e.task_id ?? '',
    e.task_title ?? '',
    e.domain ?? '',
    e.project ?? '',
    e.stage_from ?? '',
    e.stage_to ?? '',
    (e.summary ?? '').replace(/"/g, '""'),
    e.value_rating ?? '',
    e.confidence?.toString() ?? '',
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `work-report-${from}-${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Stat card ---

function StatCard({
  label,
  value,
  color,
  sub,
  delta,
  sparkData,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  sub?: React.ReactNode;
  delta?: { value: number; label?: string } | null;
  sparkData?: number[];
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <p className="text-xs text-faint uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
        {delta != null && delta.value !== 0 && (
          <span
            className={`text-xs font-medium ${delta.value > 0 ? 'text-green-400' : 'text-red-400'}`}
          >
            {delta.value > 0 ? '+' : ''}
            {delta.value}
            {delta.label ? ` ${delta.label}` : ''}
          </span>
        )}
      </div>
      {sparkData && sparkData.length > 1 && <Sparkline data={sparkData} />}
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

// --- Sparkline ---

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const w = 80;
  const h = 20;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-5 mt-1" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="#A366AB"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// --- Custom tooltips ---

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded border border-default bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="text-secondary font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="text-accent-text">
          {p.name ? `${p.name}: ` : ''}
          {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { percent: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded border border-default bg-surface-2 px-3 py-2 text-xs shadow-lg">
      <p className="text-secondary font-medium">{item.name}</p>
      <p className="text-accent-text">
        {item.value} ({(item.payload.percent * 100).toFixed(0)}%)
      </p>
    </div>
  );
}

// --- Active filter pills ---

const FILTER_LABELS: Record<string, string> = {
  agent: 'Agent',
  domain: 'Domain',
  action: 'Action',
  project: 'Project',
  actor_type: 'Actor Type',
  value_rating: 'Value',
  search: 'Search',
};

function ActiveFilterPills({
  filters,
  onClear,
  onClearAll,
}: {
  filters: Record<string, string | undefined>;
  onClear: (key: string) => void;
  onClearAll: () => void;
}) {
  const active = Object.entries(filters).filter(([, v]) => v);
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {active.map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-accent/15 text-accent-text border border-accent-border/30"
        >
          <span className="text-faint">{FILTER_LABELS[key] ?? key}:</span> {value}
          <button
            onClick={() => onClear(key)}
            className="ml-0.5 hover:text-red-400 transition-colors"
          >
            ×
          </button>
        </span>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-faint hover:text-tertiary transition-colors"
      >
        Clear all
      </button>
    </div>
  );
}

// --- Chart components ---

/** Build chart-specific filters that EXCLUDE the chart's own dimension.
 *  This prevents the paradox where clicking "infrastructure" on the domain chart
 *  would cause the domain chart to only show "infrastructure". */
function chartFilters(filters: ReportFilters, excludeKey: string): ReportFilters {
  const copy = { ...filters };
  delete (copy as Record<string, unknown>)[excludeKey];
  return copy;
}

function CrossFilterBarChart({
  title,
  filters,
  groupBy,
  activeFilter,
  onFilter,
  layout = 'horizontal',
}: {
  title: string;
  filters: ReportFilters;
  groupBy: string;
  activeFilter?: string;
  onFilter: (value: string) => void;
  layout?: 'horizontal' | 'vertical';
}) {
  const { data } = useReportCharts(chartFilters(filters, groupBy), groupBy);
  const chartData = data ?? [];

  if (layout === 'vertical') {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">{title}</h3>
        {chartData.length === 0 ? (
          <div className="text-faint text-sm text-center py-8">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 8, bottom: 4, left: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
              <XAxis
                type="number"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#888' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                style={{ fontSize: '12px' }}
                tick={{ fill: '#888' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(_d, index) => onFilter(chartData[index].label)}
              >
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    opacity={activeFilter && activeFilter !== d.label ? 0.3 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-secondary mb-3">{title}</h3>
      {chartData.length === 0 ? (
        <div className="text-faint text-sm text-center py-8">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis
              dataKey="label"
              style={{ fontSize: '12px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              style={{ fontSize: '12px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(_d, index) => onFilter(chartData[index].label)}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  opacity={activeFilter && activeFilter !== d.label ? 0.3 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function CrossFilterPieChart({
  title,
  filters,
  groupBy,
  activeFilter,
  onFilter,
}: {
  title: string;
  filters: ReportFilters;
  groupBy: string;
  activeFilter?: string;
  onFilter: (value: string) => void;
}) {
  const { data } = useReportCharts(chartFilters(filters, groupBy), groupBy);
  const chartData = data ?? [];
  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-secondary mb-3">{title}</h3>
      {chartData.length === 0 ? (
        <div className="text-faint text-sm text-center py-8">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={75}
              innerRadius={35}
              paddingAngle={2}
              label={({ name, percent }: PieLabelRenderProps) =>
                `${name ?? ''} ${((percent as number) * 100).toFixed(0)}%`
              }
              labelLine={false}
              style={{ fontSize: '11px' }}
              cursor="pointer"
              onClick={(_, index) => onFilter(chartData[index].label)}
            >
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  opacity={activeFilter && activeFilter !== d.label ? 0.3 : 1}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '11px' }}
              formatter={(value: string) => {
                const item = chartData.find((d) => d.label === value);
                return `${value} (${item ? item.value : 0})`;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      {total > 0 && <p className="text-xs text-faint text-center mt-1">{total} total</p>}
    </div>
  );
}

// --- Events timeline chart ---

function EventsTrendChart({
  filters,
  prevData,
}: {
  filters: ReportFilters;
  prevData?: { label: string; value: number }[];
}) {
  const { data } = useReportCharts(filters, 'date');
  const chartData = data ?? [];

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-secondary mb-3">Events Over Time</h3>
      {chartData.length === 0 ? (
        <div className="text-faint text-sm text-center py-8">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#A366AB" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#A366AB" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis
              dataKey="label"
              style={{ fontSize: '11px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              style={{ fontSize: '12px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#A366AB"
              strokeWidth={2}
              fill="url(#trendFill)"
              dot={false}
              activeDot={{ r: 4 }}
              name="Current"
            />
            {prevData && prevData.length > 0 && (
              <Area
                type="monotone"
                data={prevData}
                dataKey="value"
                stroke="#666"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
                name="Previous"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// --- Throughput chart ---

function ThroughputChart({ days }: { days: number }) {
  const { data } = useThroughput(days);

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-secondary mb-3">
        Task Throughput (Created vs Closed)
      </h3>
      {!data || data.length === 0 ? (
        <div className="text-faint text-sm text-center py-8">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="closedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4CAF50" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4CAF50" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="createdFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5B8DEF" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#5B8DEF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis
              dataKey="date"
              style={{ fontSize: '11px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis
              style={{ fontSize: '12px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="created"
              stroke="#5B8DEF"
              strokeWidth={2}
              fill="url(#createdFill)"
              dot={false}
              name="Created"
            />
            <Area
              type="monotone"
              dataKey="closed"
              stroke="#4CAF50"
              strokeWidth={2}
              fill="url(#closedFill)"
              dot={false}
              name="Closed"
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// --- Cost Trend ---

function CostTrendChart({ from, to }: { from: string; to: string }) {
  const { data } = useAnalytics(from, to);
  const trend = data?.cost?.trend ?? [];

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-secondary">Cost Trend</h3>
        {data?.cost && (
          <div className="flex gap-3 text-xs text-faint">
            <span>
              Today: <span className="text-green-400">${data.cost.today.toFixed(2)}</span>
            </span>
            <span>
              Week: <span className="text-green-400">${data.cost.weekTotal.toFixed(2)}</span>
            </span>
          </div>
        )}
      </div>
      {trend.length === 0 ? (
        <div className="text-faint text-sm text-center py-8">No cost data</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis
              dataKey="date"
              style={{ fontSize: '11px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis
              style={{ fontSize: '12px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="cost"
              stroke="#4CAF50"
              strokeWidth={2}
              dot={false}
              name="Total"
            />
            <Line
              type="monotone"
              dataKey="execution"
              stroke="#5B8DEF"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="Execution"
            />
            <Line
              type="monotone"
              dataKey="nexus"
              stroke="#FF9800"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              name="Nexus"
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// --- Task Reviewer Accuracy ---

function AccuracyChart({ from, to }: { from: string; to: string }) {
  const { data } = useAnalytics(from, to);
  const trend = data?.taskReviewerAccuracy?.trend ?? [];
  const chartData = trend.map((d) => ({ ...d, accuracy: Math.round(d.accuracy * 100) }));
  const overall =
    trend.length > 0
      ? Math.round((trend.reduce((s, d) => s + d.accuracy, 0) / trend.length) * 100)
      : null;

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-secondary">Task Reviewer Accuracy</h3>
        {overall != null && (
          <span
            className={`text-xs font-medium ${overall > 90 ? 'text-green-400' : overall > 70 ? 'text-amber-400' : 'text-red-400'}`}
          >
            {overall}% avg
          </span>
        )}
      </div>
      {chartData.length === 0 ? (
        <div className="text-faint text-sm text-center py-8">No accuracy data</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis
              dataKey="date"
              style={{ fontSize: '11px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v.slice(5)}
            />
            <YAxis
              style={{ fontSize: '12px' }}
              tick={{ fill: '#888' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke="#A366AB"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Accuracy %"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// --- Stage Bottleneck Bar ---

const STAGE_COLORS: Record<string, string> = {
  intake: '#94a3b8',
  evaluate: '#60a5fa',
  route: '#22d3ee',
  review: '#fbbf24',
  queue: '#a855f7',
  execute: '#4ade80',
};

function StageBottleneckBar() {
  const { data } = useStageMetrics();
  const stages = data?.stages ?? [];
  const bottleneck = data?.bottleneck;
  const maxDur = Math.max(...stages.map((s) => s.avgDurationSecs), 1);

  if (stages.length === 0) return null;

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-secondary">Stage Health</h3>
        {bottleneck && <span className="text-xs text-amber-400">Bottleneck: {bottleneck}</span>}
      </div>
      <div className="space-y-2">
        {stages.map((s) => {
          const pct = Math.max(3, (s.avgDurationSecs / maxDur) * 100);
          const isBn = s.stage === bottleneck;
          return (
            <div key={s.stage} className="flex items-center gap-3 text-xs">
              <span className="w-16 text-right text-muted font-medium">{s.stage}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isBn ? '#fbbf24' : (STAGE_COLORS[s.stage] ?? '#60a5fa'),
                    opacity: isBn ? 1 : 0.7,
                  }}
                />
              </div>
              <span className="w-14 text-faint">{formatDuration(s.avgDurationSecs)}</span>
              <span className="w-16 text-faint">{s.throughputPerDay.toFixed(1)}/day</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Event table row ---

function EventRow({ event }: { event: WorkEvent }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-surface-1/50 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5 text-muted whitespace-nowrap text-xs">
          <span className="inline-block w-4 text-disabled text-xs">
            {expanded ? '\u25BE' : '\u25B8'}
          </span>
          {formatRelativeTime(event.timestamp)}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-block text-xs px-1.5 py-0.5 rounded ${actorBadgeClasses(event.actor)}`}
          >
            {event.actor}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-block text-xs px-1.5 py-0.5 rounded ${actionBadgeClasses(event.action)}`}
          >
            {event.action}
          </span>
        </td>
        <td className="px-4 py-2.5 text-xs">
          {event.task_id ? (
            <span className="font-mono text-indigo-300" title={event.task_title ?? undefined}>
              {event.task_title
                ? event.task_title.length > 60
                  ? event.task_title.slice(0, 60) + '\u2026'
                  : event.task_title
                : event.task_id}
            </span>
          ) : (
            <span className="text-disabled">--</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          {event.domain ? (
            <span className="text-xs text-muted">{event.domain}</span>
          ) : (
            <span className="text-disabled">--</span>
          )}
        </td>
        <td className="px-4 py-2.5">
          <StageTransitionCompact from={event.stage_from} to={event.stage_to} />
        </td>
        <td
          className="px-4 py-2.5 text-xs text-tertiary max-w-[400px] truncate"
          title={event.summary ?? undefined}
        >
          {event.summary
            ? event.summary.length > 80
              ? event.summary.slice(0, 80) + '\u2026'
              : event.summary
            : '--'}
        </td>
        <td className="px-4 py-2.5">{valueRatingIndicator(event.value_rating)}</td>
      </tr>
      {expanded && (
        <tr className="bg-surface-1/20">
          <td colSpan={8} className="px-8 py-5">
            <div className="space-y-3 max-w-4xl">
              {event.summary && (
                <p className="text-sm text-secondary leading-relaxed">{event.summary}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                {event.value_rating && (
                  <div>
                    <span className="text-muted font-medium">Value Rating: </span>
                    <span className="text-faint capitalize">{event.value_rating}</span>
                  </div>
                )}
                {event.value_description && (
                  <div>
                    <span className="text-muted font-medium">Value Notes: </span>
                    <span className="text-faint">{event.value_description}</span>
                  </div>
                )}
                {event.quantitative && (
                  <div>
                    <span className="text-muted font-medium">Quantitative: </span>
                    <span className="text-faint">{event.quantitative}</span>
                  </div>
                )}
                {event.project && (
                  <div>
                    <span className="text-muted font-medium">Project: </span>
                    <span className="text-faint">{event.project}</span>
                  </div>
                )}
                {event.task_id && (
                  <div>
                    <span className="text-muted font-medium">Task: </span>
                    <span className="text-faint font-mono">{event.task_id}</span>
                  </div>
                )}
                {event.confidence !== null && (
                  <div>
                    <span className="text-muted font-medium">Confidence: </span>
                    <span className="text-faint">{(event.confidence * 100).toFixed(0)}%</span>
                  </div>
                )}
                {event.source_file && (
                  <div>
                    <span className="text-muted font-medium">Source: </span>
                    <span className="text-faint font-mono text-xs">{event.source_file}</span>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// --- Main page ---

export default function ReportPage() {
  const [params, setParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read filter state from URL
  const preset = (params.get('preset') as PresetKey) || '7d';
  const from = params.get('from') || presetToRange(preset).from;
  const to = params.get('to') || presetToRange(preset).to;
  const agentFilter = params.get('agent') || undefined;
  const domainFilter = params.get('domain') || undefined;
  const actionFilter = params.get('action') || undefined;
  const projectFilter = params.get('project') || undefined;
  const actorTypeFilter = params.get('actor_type') || undefined;
  const valueRatingFilter = params.get('value_rating') || undefined;
  const searchFilter = params.get('search') || undefined;
  const compare = params.get('compare') === '1';
  const page = parseInt(params.get('page') || '0', 10);

  // Initialize search draft from URL
  useEffect(() => {
    setSearchDraft(searchFilter ?? '');
  }, [searchFilter]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // Build the shared filter object
  const filters: ReportFilters = useMemo(
    () => ({
      from,
      to,
      agent: agentFilter,
      domain: domainFilter,
      action: actionFilter,
      project: projectFilter,
      actor_type: actorTypeFilter,
      value_rating: valueRatingFilter,
      search: searchFilter,
    }),
    [
      from,
      to,
      agentFilter,
      domainFilter,
      actionFilter,
      projectFilter,
      actorTypeFilter,
      valueRatingFilter,
      searchFilter,
    ],
  );

  // Cross-filter params (for the pills)
  const crossFilters = useMemo(
    () => ({
      agent: agentFilter,
      domain: domainFilter,
      action: actionFilter,
      project: projectFilter,
      actor_type: actorTypeFilter,
      value_rating: valueRatingFilter,
      search: searchFilter,
    }),
    [
      agentFilter,
      domainFilter,
      actionFilter,
      projectFilter,
      actorTypeFilter,
      valueRatingFilter,
      searchFilter,
    ],
  );

  // URL helpers
  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.set('page', '0');
        return next;
      });
    },
    [setParams],
  );

  const toggleFilter = useCallback(
    (key: string, value: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (next.get(key) === value) next.delete(key);
        else next.set(key, value);
        next.set('page', '0');
        return next;
      });
    },
    [setParams],
  );

  const clearAllFilters = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      ['agent', 'domain', 'action', 'project', 'actor_type', 'value_rating', 'search'].forEach(
        (k) => next.delete(k),
      );
      next.set('page', '0');
      return next;
    });
    setSearchDraft('');
  }, [setParams]);

  const handlePreset = useCallback(
    (key: PresetKey) => {
      const range = presetToRange(key);
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('preset', key);
        next.set('from', range.from);
        next.set('to', range.to);
        next.set('page', '0');
        return next;
      });
    },
    [setParams],
  );

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchDraft(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setFilter('search', value || undefined);
      }, 300);
    },
    [setFilter],
  );

  // Data hooks
  const { data: summary, isLoading: summaryLoading } = useReportSummary(filters);

  const { data: eventsData, isLoading: eventsLoading } = useReportEvents({
    ...filters,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // Export: fetch all events for current filters
  const [exporting, setExporting] = useState(false);
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('from', from);
      params.set('to', to);
      if (agentFilter) params.set('agent', agentFilter);
      if (domainFilter) params.set('domain', domainFilter);
      if (actionFilter) params.set('action', actionFilter);
      if (projectFilter) params.set('project', projectFilter);
      if (actorTypeFilter) params.set('actor_type', actorTypeFilter);
      if (valueRatingFilter) params.set('value_rating', valueRatingFilter);
      if (searchFilter) params.set('search', searchFilter);
      params.set('limit', '10000');
      params.set('offset', '0');
      const resp = await fetch(`/api/reports/events?${params}`);
      const data = await resp.json();
      exportCSV(data.events, from, to);
    } finally {
      setExporting(false);
    }
  }, [
    from,
    to,
    agentFilter,
    domainFilter,
    actionFilter,
    projectFilter,
    actorTypeFilter,
    valueRatingFilter,
    searchFilter,
  ]);

  // Period comparison
  const prev = useMemo(() => (compare ? prevPeriod(from, to) : null), [compare, from, to]);
  const prevFilters = useMemo(() => (prev ? { from: prev.from, to: prev.to } : null), [prev]);
  const { data: prevSummary } = useReportSummary(prevFilters ?? { from: '', to: '' });
  const { data: prevChartData } = useReportCharts(prevFilters ?? { from: '', to: '' }, 'date');
  // Note: when compare is off, prevFilters is null, and empty from/to will return minimal data.
  // React Query caches by key so this won't re-fetch unnecessarily.

  // Analytics (cost, accuracy, SLA)
  const { data: analytics } = useAnalytics(from, to);

  // Sparkline data from date chart
  const { data: dateChartData } = useReportCharts(filters, 'date');
  const sparkValues = useMemo(() => (dateChartData ?? []).map((d) => d.value), [dateChartData]);

  const events = eventsData?.events ?? [];
  const totalEvents = eventsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalEvents / PAGE_SIZE));

  // Derive filter options from summary
  const agentOptions = useMemo(
    () => (summary ? Object.keys(summary.by_agent).sort() : []),
    [summary],
  );
  const domainOptions = useMemo(
    () => (summary ? Object.keys(summary.by_domain).sort() : []),
    [summary],
  );
  const actionOptions = useMemo(
    () => (summary ? Object.keys(summary.by_action).sort() : []),
    [summary],
  );
  const projectOptions = useMemo(
    () => (summary ? Object.keys(summary.by_project).sort() : []),
    [summary],
  );
  const actorTypeOptions = useMemo(
    () => (summary ? Object.keys(summary.by_actor_type).sort() : []),
    [summary],
  );

  const stuckCount = summary
    ? (summary.by_action.parked ?? 0) +
      (summary.by_action.failed ?? 0) +
      (summary.by_action.escalated ?? 0)
    : 0;

  const prevStuckCount = prevSummary
    ? (prevSummary.by_action.parked ?? 0) +
      (prevSummary.by_action.failed ?? 0) +
      (prevSummary.by_action.escalated ?? 0)
    : 0;

  const presets: { key: PresetKey; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: 'Last 7 Days' },
    { key: '30d', label: 'Last 30 Days' },
    { key: 'custom', label: 'Custom' },
  ];

  const days = rangeDays(from, to);

  return (
    <div className="space-y-6">
      {/* Section 1: Header + Date Presets + Compare + Export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Work Report</h1>
          <p className="text-sm text-faint mt-1">{from === to ? from : `${from} to ${to}`}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                preset === p.key
                  ? 'border-accent-border bg-accent/20 text-accent-text'
                  : 'border-default bg-surface-1 text-muted hover:text-secondary hover:border-subtle'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setFilter('compare', compare ? undefined : '1')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              compare
                ? 'border-purple-500/50 bg-purple-500/20 text-purple-400'
                : 'border-default bg-surface-1 text-muted hover:text-secondary hover:border-subtle'
            }`}
          >
            Compare
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-xs px-3 py-1.5 rounded-full border border-default bg-surface-1 text-muted hover:text-secondary hover:border-subtle transition-colors disabled:opacity-50"
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Custom date inputs */}
      {preset === 'custom' && (
        <div className="flex items-center gap-3">
          <label className="text-xs text-faint">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFilter('from', e.target.value)}
            className="bg-surface-2 border border-default text-primary rounded px-2 py-1 text-sm"
          />
          <label className="text-xs text-faint">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setFilter('to', e.target.value)}
            className="bg-surface-2 border border-default text-primary rounded px-2 py-1 text-sm"
          />
        </div>
      )}

      {/* Section 2: Active Filter Pills */}
      <ActiveFilterPills
        filters={crossFilters}
        onClear={(key) => setFilter(key, undefined)}
        onClearAll={clearAllFilters}
      />

      {/* Section 3: KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatCard
          label="Total Events"
          value={summaryLoading ? '--' : (summary?.total_events ?? 0)}
          color="text-accent-text"
          sub={`${from} - ${to}`}
          sparkData={sparkValues}
          delta={
            compare && prevSummary
              ? { value: (summary?.total_events ?? 0) - prevSummary.total_events }
              : null
          }
        />
        <StatCard
          label="Completed"
          value={summaryLoading ? '--' : (summary?.by_action.completed ?? 0)}
          color="text-green-400"
          sub="Tasks done"
          delta={
            compare && prevSummary
              ? {
                  value:
                    (summary?.by_action.completed ?? 0) - (prevSummary.by_action.completed ?? 0),
                }
              : null
          }
        />
        <StatCard
          label="Stuck / Blocked"
          value={summaryLoading ? '--' : stuckCount}
          color={stuckCount > 0 ? 'text-red-400' : 'text-green-400'}
          sub="Parked + Failed + Escalated"
          delta={compare && prevSummary ? { value: stuckCount - prevStuckCount } : null}
        />
        <StatCard
          label="Deferred"
          value={summaryLoading ? '--' : (summary?.by_action.deferred ?? 0)}
          color="text-orange-400"
          sub="Pushed back"
          delta={
            compare && prevSummary
              ? {
                  value: (summary?.by_action.deferred ?? 0) - (prevSummary.by_action.deferred ?? 0),
                }
              : null
          }
        />
        <StatCard
          label="Value Score"
          value={summaryLoading ? '--' : computeValueScore(summary)}
          color="text-purple-400"
          sub="Weighted rating"
        />
        <StatCard
          label="Cost"
          value={analytics?.cost ? `$${analytics.cost.weekTotal.toFixed(2)}` : '--'}
          color="text-green-400"
          sub={analytics?.cost ? `$${analytics.cost.today.toFixed(2)} today` : 'This week'}
        />
        <StatCard
          label="AI Accuracy"
          value={
            analytics?.taskReviewerAccuracy?.trend.length
              ? `${Math.round((analytics.taskReviewerAccuracy.trend.reduce((s, d) => s + d.accuracy, 0) / analytics.taskReviewerAccuracy.trend.length) * 100)}%`
              : '--'
          }
          color={(() => {
            if (!analytics?.taskReviewerAccuracy?.trend.length) return 'text-muted';
            const avg = Math.round(
              (analytics.taskReviewerAccuracy.trend.reduce((s, d) => s + d.accuracy, 0) /
                analytics.taskReviewerAccuracy.trend.length) *
                100,
            );
            return avg > 90 ? 'text-green-400' : avg > 70 ? 'text-amber-400' : 'text-red-400';
          })()}
          sub="Task Reviewer decisions"
        />
        <StatCard
          label="Approval SLA"
          value={
            analytics?.approvalSLA ? formatDuration(analytics.approvalSLA.avgTimeToFeedback) : '--'
          }
          color="text-cyan-400"
          sub={
            analytics?.approvalSLA?.staleProposals
              ? `${analytics.approvalSLA.staleProposals} stale`
              : 'Avg feedback time'
          }
        />
      </div>

      {/* Section 4: Primary Charts — Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CrossFilterBarChart
          title="Work by Action"
          filters={filters}
          groupBy="action"
          activeFilter={actionFilter}
          onFilter={(v) => toggleFilter('action', v)}
        />
        <CrossFilterPieChart
          title="Work by Agent"
          filters={filters}
          groupBy="agent"
          activeFilter={agentFilter}
          onFilter={(v) => toggleFilter('agent', v)}
        />
        <CrossFilterBarChart
          title="Work by Domain"
          filters={filters}
          groupBy="domain"
          activeFilter={domainFilter}
          onFilter={(v) => toggleFilter('domain', v)}
          layout="vertical"
        />
      </div>

      {/* Section 4: Primary Charts — Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CrossFilterBarChart
          title="Work by Project"
          filters={filters}
          groupBy="project"
          activeFilter={projectFilter}
          onFilter={(v) => toggleFilter('project', v)}
          layout="vertical"
        />
        <CrossFilterPieChart
          title="Value Rating"
          filters={filters}
          groupBy="value_rating"
          activeFilter={valueRatingFilter}
          onFilter={(v) => toggleFilter('value_rating', v)}
        />
        <CrossFilterPieChart
          title="Actor Type"
          filters={filters}
          groupBy="actor_type"
          activeFilter={actorTypeFilter}
          onFilter={(v) => toggleFilter('actor_type', v)}
        />
      </div>

      {/* Section 5: Timeline Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EventsTrendChart
          filters={filters}
          prevData={compare ? (prevChartData ?? undefined) : undefined}
        />
        <ThroughputChart days={days} />
      </div>

      {/* Section 6: Operations Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CostTrendChart from={from} to={to} />
        <AccuracyChart from={from} to={to} />
      </div>

      {/* Section 7: Stage Health */}
      <StageBottleneckBar />

      {/* Section 8: Search + Filter Dropdowns */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search events..."
          value={searchDraft}
          onChange={(e) => handleSearchInput(e.target.value)}
          className="bg-surface-2 border border-default text-primary rounded px-3 py-1.5 text-sm w-48 placeholder:text-faint"
        />

        <select
          value={agentFilter ?? ''}
          onChange={(e) => setFilter('agent', e.target.value || undefined)}
          className="bg-surface-2 border border-default text-primary rounded px-2 py-1 text-sm"
        >
          <option value="">All agents</option>
          {agentOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={domainFilter ?? ''}
          onChange={(e) => setFilter('domain', e.target.value || undefined)}
          className="bg-surface-2 border border-default text-primary rounded px-2 py-1 text-sm"
        >
          <option value="">All domains</option>
          {domainOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={actionFilter ?? ''}
          onChange={(e) => setFilter('action', e.target.value || undefined)}
          className="bg-surface-2 border border-default text-primary rounded px-2 py-1 text-sm"
        >
          <option value="">All actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        <select
          value={projectFilter ?? ''}
          onChange={(e) => setFilter('project', e.target.value || undefined)}
          className="bg-surface-2 border border-default text-primary rounded px-2 py-1 text-sm"
        >
          <option value="">All projects</option>
          {projectOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          value={actorTypeFilter ?? ''}
          onChange={(e) => setFilter('actor_type', e.target.value || undefined)}
          className="bg-surface-2 border border-default text-primary rounded px-2 py-1 text-sm"
        >
          <option value="">All actor types</option>
          {actorTypeOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Section 9: Events Table */}
      <div className="rounded-lg border border-default bg-transparent">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default">
          <h3 className="text-sm font-semibold text-secondary">Work Events</h3>
          <span className="text-xs text-faint">{totalEvents} total</span>
        </div>

        {eventsLoading ? (
          <div className="text-faint py-8 text-center text-sm">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="text-faint py-8 text-center text-sm">No events in selected range</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Time</th>
                  <th className="text-left px-4 py-2.5 font-medium">Actor</th>
                  <th className="text-left px-4 py-2.5 font-medium">Action</th>
                  <th className="text-left px-4 py-2.5 font-medium">Task</th>
                  <th className="text-left px-4 py-2.5 font-medium">Domain</th>
                  <th className="text-left px-4 py-2.5 font-medium">Stage</th>
                  <th className="text-left px-4 py-2.5 font-medium">Summary</th>
                  <th className="text-left px-4 py-2.5 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default/50">
                {events.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-default">
            <button
              onClick={() => setFilter('page', String(Math.max(0, page - 1)))}
              disabled={page === 0}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                page === 0
                  ? 'border-subtle text-disabled cursor-not-allowed'
                  : 'border-default text-muted hover:text-secondary hover:border-subtle'
              }`}
            >
              Previous
            </button>
            <span className="text-xs text-faint">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setFilter('page', String(Math.min(totalPages - 1, page + 1)))}
              disabled={page >= totalPages - 1}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                page >= totalPages - 1
                  ? 'border-subtle text-disabled cursor-not-allowed'
                  : 'border-default text-muted hover:text-secondary hover:border-subtle'
              }`}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
