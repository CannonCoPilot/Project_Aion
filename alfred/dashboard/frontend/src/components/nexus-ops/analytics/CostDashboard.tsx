import type { AnalyticsResponse } from '../../../api/nexus-ops';

interface Props {
  cost: AnalyticsResponse['cost'];
}

interface TrendPoint { date: string; cost: number; execution: number; nexus: number }

function Sparkline({ data }: { data: TrendPoint[] }) {
  if (data.length < 2) return null;

  const width = 600;
  const height = 180;
  const padX = 40;
  const padY = 20;
  const padBottom = 35;
  const chartW = width - padX * 2;
  const chartH = height - padY - padBottom;

  const maxCost = Math.max(...data.map((d) => d.cost), 0.001);

  function toPoints(accessor: (d: TrendPoint) => number) {
    return data.map((d, i) => ({
      x: padX + (i / (data.length - 1)) * chartW,
      y: padY + chartH - (accessor(d) / maxCost) * chartH,
    }));
  }

  const totalPts = toPoints(d => d.cost);
  const execPts = toPoints(d => d.execution);
  const nexusPts = toPoints(d => d.nexus);

  const toPolyline = (pts: { x: number; y: number }[]) => pts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3" style={{ height: 220 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-faint uppercase tracking-wider">Daily Cost Trend</div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] text-green-400"><span className="w-3 h-0.5 bg-green-400 rounded inline-block" /> Total</span>
          <span className="flex items-center gap-1 text-[10px] text-accent-text"><span className="w-3 h-0.5 bg-accent-light rounded inline-block" /> Executions</span>
          <span className="flex items-center gap-1 text-[10px] text-purple-400"><span className="w-3 h-0.5 bg-purple-400 rounded inline-block" /> Jobs</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {/* Grid lines */}
        <line x1={padX} y1={padY} x2={padX} y2={padY + chartH} stroke="#374151" strokeWidth="1" />
        <line x1={padX} y1={padY + chartH} x2={padX + chartW} y2={padY + chartH} stroke="#374151" strokeWidth="1" />

        {/* Nexus/jobs line (behind) */}
        <polyline fill="none" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="4 3" points={toPolyline(nexusPts)} opacity="0.7" />

        {/* Execution line */}
        <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" points={toPolyline(execPts)} opacity="0.8" />

        {/* Total line (on top) */}
        <polyline fill="none" stroke="#4ade80" strokeWidth="2" points={toPolyline(totalPts)} />

        {/* Data points on total line */}
        {totalPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#4ade80" />
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (data.length > 10 && i % Math.ceil(data.length / 7) !== 0) return null;
          const label = d.date.length > 5 ? d.date.slice(5) : d.date;
          return (
            <text
              key={i}
              x={totalPts[i].x}
              y={height - 8}
              textAnchor="middle"
              fill="#6b7280"
              fontSize="10"
            >
              {label}
            </text>
          );
        })}

        {/* Y-axis labels */}
        <text x={padX - 4} y={padY + 4} textAnchor="end" fill="#6b7280" fontSize="10">
          ${maxCost.toFixed(2)}
        </text>
        <text x={padX - 4} y={padY + chartH} textAnchor="end" fill="#6b7280" fontSize="10">
          $0
        </text>
      </svg>
    </div>
  );
}

export function CostDashboard({ cost }: Props) {
  const maxJobCost = Math.max(...cost.byJob.map((j) => j.cost), 0.001);
  const sortedJobs = [...cost.byJob].sort((a, b) => b.cost - a.cost);

  return (
    <div className="space-y-4">
      {/* Top row: today + week */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
          <div className="text-xs text-faint mb-1">Today</div>
          <div className="text-2xl font-bold text-green-400">${cost.today.toFixed(4)}</div>
        </div>
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
          <div className="text-xs text-faint mb-1">Week Total</div>
          <div className="text-2xl font-bold text-green-400">${cost.weekTotal.toFixed(4)}</div>
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline data={cost.trend} />

      {/* Job cost table */}
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
        <div className="text-xs text-faint uppercase tracking-wider mb-3">Cost by Job</div>
        <div className="space-y-2">
          {sortedJobs.map((j) => (
            <div key={j.job} className="flex items-center gap-3">
              <div className="w-32 truncate text-sm text-tertiary" title={j.job}>
                {j.job}
              </div>
              <div className="flex-1 h-5 rounded bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded bg-green-500/40"
                  style={{ width: `${(j.cost / maxJobCost) * 100}%` }}
                />
              </div>
              <div className="w-20 text-right text-sm text-green-400">${j.cost.toFixed(4)}</div>
              <div className="w-16 text-right text-xs text-faint">{j.runs} runs</div>
            </div>
          ))}
        </div>
      </div>

      {/* Persona breakdown */}
      {cost.byPersona.length > 0 && (
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
          <div className="text-xs text-faint uppercase tracking-wider mb-3">Cost by Persona</div>
          <div className="space-y-1">
            {cost.byPersona.map((p) => (
              <div key={p.persona} className="flex justify-between text-sm">
                <span className="text-tertiary">{p.persona}</span>
                <span className="text-green-400">${p.cost.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
