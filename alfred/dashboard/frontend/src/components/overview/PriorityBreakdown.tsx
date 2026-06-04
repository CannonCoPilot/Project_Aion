import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useStats } from '../../api/tasks';
import { useCompany } from '../../hooks/useCompany';

const PRIORITY_META: Record<number, { label: string; color: string }> = {
  0: { label: 'CRITICAL', color: '#ef4444' },
  1: { label: 'HIGH', color: '#f97316' },
  2: { label: 'MEDIUM', color: '#f59e0b' },
  3: { label: 'LOW', color: '#60a5fa' },
  4: { label: 'Backlog', color: '#6b7280' },
};

export function PriorityBreakdown() {
  const { company, isFiltered } = useCompany();
  const { data: stats } = useStats(isFiltered ? company : undefined);
  const byPriority = stats?.byPriority ?? {};

  const data = Object.entries(byPriority)
    .map(([level, count]) => {
      const p = Number(level);
      const meta = PRIORITY_META[p] ?? { label: `P${p}`, color: '#6b7280' };
      return { name: meta.label, value: count, color: meta.color, priority: p };
    })
    .sort((a, b) => a.priority - b.priority);

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">By Priority</h3>
        <div className="h-48 flex items-center justify-center text-faint text-sm">No data</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-secondary mb-3">By Priority</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 5, bottom: 0, left: 5 }}>
          <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#9ca3af', fontSize: 10 }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
