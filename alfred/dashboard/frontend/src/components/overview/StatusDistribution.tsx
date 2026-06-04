import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useStats } from '../../api/tasks';
import { useCompany } from '../../hooks/useCompany';

const COLORS: Record<string, string> = {
  in_progress: '#f59e0b',
  ready: '#60a5fa',
  blocked: '#ef4444',
  backlog: '#6b7280',
  deferred: '#8b5cf6',
  done: '#4ade80',
  archived: '#78716c',
};

const LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  ready: 'Ready',
  blocked: 'Blocked',
  backlog: 'Backlog',
  deferred: 'Deferred',
  done: 'Done',
  archived: 'Archived',
};

export function StatusDistribution() {
  const { company, isFiltered } = useCompany();
  const { data: stats } = useStats(isFiltered ? company : undefined);
  const byBoard = stats?.byBoard ?? {};

  const data = Object.entries(byBoard)
    .filter(([, count]) => count > 0)
    .map(([name, value]) => ({
      name: LABELS[name] ?? name,
      value,
      color: COLORS[name] ?? '#6b7280',
    }));

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">Status Distribution</h3>
        <div className="h-48 flex items-center justify-center text-faint text-sm">No data</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <h3 className="text-sm font-semibold text-secondary mb-3">Status Distribution</h3>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={75}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1 text-[10px] text-faint">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}
