import type { AnalyticsResponse } from '../../../api/nexus-ops';

interface Props {
  accuracy: AnalyticsResponse['taskReviewerAccuracy'];
}

function rateColor(rate: number): string {
  if (rate > 90) return 'text-green-400';
  if (rate > 70) return 'text-amber-400';
  return 'text-red-400';
}

function TrendChart({ data }: { data: { date: string; accuracy: number; total: number }[] }) {
  if (data.length < 2) return null;

  const width = 600;
  const height = 160;
  const padX = 40;
  const padY = 20;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * chartW,
    y: padY + chartH - (d.accuracy / 100) * chartH,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3" style={{ height: 200 }}>
      <div className="text-xs text-faint uppercase tracking-wider mb-2">Accuracy Over Time</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {/* Grid */}
        <line x1={padX} y1={padY} x2={padX} y2={padY + chartH} stroke="#374151" strokeWidth="1" />
        <line x1={padX} y1={padY + chartH} x2={padX + chartW} y2={padY + chartH} stroke="#374151" strokeWidth="1" />
        {/* 50% guide */}
        <line
          x1={padX}
          y1={padY + chartH * 0.5}
          x2={padX + chartW}
          y2={padY + chartH * 0.5}
          stroke="#374151"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Trend line */}
        <polyline fill="none" stroke="#4ade80" strokeWidth="2" points={polyline} />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#4ade80" />
        ))}

        {/* Y-axis labels */}
        <text x={padX - 4} y={padY + 4} textAnchor="end" fill="#6b7280" fontSize="10">
          100%
        </text>
        <text x={padX - 4} y={padY + chartH * 0.5 + 4} textAnchor="end" fill="#6b7280" fontSize="10">
          50%
        </text>
        <text x={padX - 4} y={padY + chartH + 4} textAnchor="end" fill="#6b7280" fontSize="10">
          0%
        </text>

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (data.length > 10 && i % Math.ceil(data.length / 7) !== 0) return null;
          const label = d.date.length > 5 ? d.date.slice(5) : d.date;
          return (
            <text
              key={i}
              x={points[i].x}
              y={height - 2}
              textAnchor="middle"
              fill="#6b7280"
              fontSize="10"
            >
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function AccuracyTrend({ accuracy }: Props) {
  const sorted = [...accuracy.byAction].sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-4">
      <TrendChart data={accuracy.trend} />

      {sorted.length > 0 && (
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
          <div className="text-xs text-faint uppercase tracking-wider mb-3">Accuracy by Action</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-faint border-b border-default">
                <th className="text-left py-2 font-medium">Action</th>
                <th className="text-right py-2 font-medium">Accuracy</th>
                <th className="text-right py-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((a) => (
                <tr key={a.action} className="odd:bg-surface-2/30">
                  <td className="py-1.5 text-tertiary">{a.action}</td>
                  <td className={`py-1.5 text-right ${rateColor(a.accuracy)}`}>
                    {a.accuracy.toFixed(0)}%
                  </td>
                  <td className="py-1.5 text-right text-muted">{a.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
