import { useStats } from '../../api/tasks';
import { useCompany } from '../../hooks/useCompany';

export function StatsCards() {
  const { company, isFiltered } = useCompany();
  const { data: stats } = useStats(isFiltered ? company : undefined);

  if (!stats) return null;

  const bb = stats.byBoard ?? {};
  const cards = [
    {
      label: 'In Progress',
      value: bb['in_progress'] ?? 0,
      sub: 'actively being worked on',
      filter: 'status = in_progress',
      color: 'text-accent-text',
      bg: 'bg-accent/10',
    },
    {
      label: 'Ready',
      value: bb['ready'] ?? 0,
      sub: 'actionable, scored for automation',
      filter: 'auto:ready + no blockers + not deferred',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'Blocked',
      value: bb['blocked'] ?? 0,
      sub: 'needs feedback or external input',
      filter: 'waiting:* · needs-input · manual-action · blocked:*',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
    {
      label: 'Backlog',
      value: bb['backlog'] ?? 0,
      sub: 'not yet prioritized or scored',
      filter: 'no auto:ready, no blockers, not deferred',
      color: 'text-tertiary',
      bg: 'bg-surface-muted/10',
    },
    {
      label: 'Deferred',
      value: bb['deferred'] ?? 0,
      sub: 'on hold — valid work, not now',
      filter: 'status = deferred · parked label',
      color: 'text-muted',
      bg: 'bg-surface-muted/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-lg border border-default ${c.bg} p-4`}>
          <p className="text-xs text-faint uppercase tracking-wider">{c.label}</p>
          <p className={`text-2xl font-bold ${c.color} mt-1`}>{c.value}</p>
          <p className="text-[10px] text-disabled mt-1 leading-tight">{c.sub}</p>
          <p className="text-[9px] font-mono text-ghost mt-0.5 leading-tight">{c.filter}</p>
        </div>
      ))}
    </div>
  );
}
