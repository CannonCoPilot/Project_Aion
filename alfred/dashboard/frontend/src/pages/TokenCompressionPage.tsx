import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  useCompressionStats,
  useCompressionEvents,
  useCompressionPhases,
  type CompressionEvent,
} from '../api/token-compression.js';
import { useCompressionEffectiveness } from '../api/jarvis-memory.js';

// --- Helpers ---

function formatTimeAgo(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function statusColor(status: string): { bg: string; text: string } {
  if (status === 'success') return { bg: 'bg-green-500/20', text: 'text-green-400' };
  if (status === 'partial') return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
  if (status === 'failed') return { bg: 'bg-red-500/20', text: 'text-red-400' };
  return { bg: 'bg-surface-muted/20', text: 'text-muted' };
}

function truncateSessionId(id: string): string {
  if (id.length <= 12) return id;
  return id.slice(0, 8) + '…';
}

// --- Stat Card ---

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <p className="text-xs text-faint uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

// --- Trend chart data helper ---

function buildTrendData(events: CompressionEvent[]) {
  const buckets: Record<string, number> = {};
  for (const ev of events) {
    const hour = new Date(ev.triggered_at);
    hour.setMinutes(0, 0, 0);
    const key = hour.toISOString();
    buckets[key] = (buckets[key] ?? 0) + ev.tokens_saved;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, saved]) => ({
      hour: new Date(key).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      saved,
    }));
}

// --- Main page ---

export default function TokenCompressionPage() {
  const { data: stats, isLoading: statsLoading, isError: statsError } = useCompressionStats();
  const { data: events = [] } = useCompressionEvents(50);
  const { data: phases = [] } = useCompressionPhases();
  const { data: jicmEfficiency } = useCompressionEffectiveness();

  const trendData = useMemo(() => buildTrendData(events), [events]);

  if (statsLoading) {
    return (
      <div className="text-faint py-8 text-center text-sm">Loading compression stats...</div>
    );
  }

  if (statsError || !stats) {
    return (
      <div className="text-red-400 py-8 text-center">Failed to load compression stats.</div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">Token Compression</h1>
          <p className="text-sm text-faint mt-0.5">Automatic context compression metrics</p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-disabled px-2 py-1 rounded bg-surface-1 border border-default">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Auto-refresh 15s
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total Saved"
          value={formatTokens(stats.total_tokens_saved)}
          color="text-green-400"
          sub="tokens compressed away"
        />
        <StatCard
          label="Compression Rate"
          value={formatPct(stats.compression_rate)}
          color="text-accent-text"
          sub="average ratio"
        />
        <StatCard
          label="Events"
          value={stats.total_events.toLocaleString()}
          color="text-blue-400"
          sub={`${stats.sessions_compressed} sessions`}
        />
        <StatCard
          label="Avg Reduction"
          value={formatTokens(stats.avg_reduction)}
          color="text-purple-400"
          sub={
            stats.last_compressed_at
              ? `last: ${formatTimeAgo(stats.last_compressed_at)}`
              : 'per event'
          }
        />
        <StatCard
          label="JICM Efficiency"
          value={jicmEfficiency ? `${jicmEfficiency.efficiency_pct}%` : '—'}
          color={jicmEfficiency && jicmEfficiency.efficiency_pct > 60 ? 'text-green-400' : jicmEfficiency && jicmEfficiency.efficiency_pct > 30 ? 'text-amber-400' : 'text-red-400'}
          sub={jicmEfficiency ? `${jicmEfficiency.stats.total_compressions} cycles, ${formatTokens(jicmEfficiency.stats.cumulative_tokens_saved)} saved` : 'loading...'}
        />
      </div>

      {/* Phase breakdown */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">Phase Breakdown</h3>
        {phases.length === 0 ? (
          <div className="py-8 text-center text-faint text-sm">No phase data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Phase</th>
                  <th className="text-right px-4 py-2.5 font-medium">Events</th>
                  <th className="text-right px-4 py-2.5 font-medium">Total Saved</th>
                  <th className="text-right px-4 py-2.5 font-medium">Avg Ratio</th>
                  <th className="text-right px-4 py-2.5 font-medium">Last Run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default/50">
                {phases.map((phase) => (
                  <tr key={phase.phase} className="hover:bg-surface-1/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-secondary">
                      {phase.phase}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted">
                      {phase.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-green-400 font-medium">
                      {formatTokens(phase.total_saved)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-accent-text">
                      {formatPct(phase.avg_ratio)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-faint text-xs">
                      {phase.last_run ? formatTimeAgo(phase.last_run) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trend chart */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">Compression Trend</h3>
        {trendData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-faint text-sm">
            No trend data
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <XAxis
                dataKey="hour"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatTokens(v)}
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                formatter={(v) => [formatTokens(Number(v)), 'Tokens Saved']}
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Area
                type="monotone"
                dataKey="saved"
                stroke="#22c55e"
                strokeWidth={2}
                fill="#22c55e"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent events table */}
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">Recent Events</h3>
        {events.length === 0 ? (
          <div className="py-8 text-center text-faint text-sm">No recent events</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Time</th>
                  <th className="text-left px-4 py-2.5 font-medium">Session</th>
                  <th className="text-left px-4 py-2.5 font-medium">Phase</th>
                  <th className="text-right px-4 py-2.5 font-medium">Before</th>
                  <th className="text-right px-4 py-2.5 font-medium">After</th>
                  <th className="text-right px-4 py-2.5 font-medium">Saved</th>
                  <th className="text-right px-4 py-2.5 font-medium">Ratio</th>
                  <th className="text-right px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default/50">
                {events.map((ev) => {
                  const sc = statusColor(ev.status);
                  return (
                    <tr key={ev.id} className="hover:bg-surface-1/50 transition-colors">
                      <td className="px-4 py-2.5 text-faint text-xs whitespace-nowrap">
                        {formatTimeAgo(ev.triggered_at)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted">
                        {truncateSessionId(ev.session_id)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-secondary">{ev.phase}</td>
                      <td className="px-4 py-2.5 text-right text-muted">
                        {formatTokens(ev.tokens_before)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted">
                        {formatTokens(ev.tokens_after)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-green-400 font-medium">
                        {formatTokens(ev.tokens_saved)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-accent-text">
                        {formatPct(ev.compression_ratio)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`inline-block text-xs px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}
                        >
                          {ev.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
