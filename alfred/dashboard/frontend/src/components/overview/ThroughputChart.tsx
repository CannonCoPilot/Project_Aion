import { useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useThroughput } from '../../api/tasks';

const RANGE_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

export function ThroughputChart() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useThroughput(days);

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-secondary">Throughput</h3>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                days === opt.days
                  ? 'bg-accent/20 text-accent-text'
                  : 'text-faint hover:text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div className="h-48 flex items-center justify-center text-faint text-sm">Loading...</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data ?? []} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => {
                const dt = new Date(d);
                return `${dt.getMonth() + 1}/${dt.getDate()}`;
              }}
              tick={{ fill: '#6b7280', fontSize: 10 }}
              interval={Math.max(0, Math.floor((data?.length ?? 0) / 6) - 1)}
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelFormatter={(d) => new Date(String(d)).toLocaleDateString()}
            />
            <Area
              type="monotone"
              dataKey="created"
              stroke="#60a5fa"
              fill="url(#colorCreated)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="closed"
              stroke="#4ade80"
              fill="url(#colorClosed)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
      <div className="flex gap-4 mt-2 text-xs text-faint justify-center">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-blue-400 rounded" /> Created
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-green-400 rounded" /> Closed
        </span>
      </div>
    </div>
  );
}
