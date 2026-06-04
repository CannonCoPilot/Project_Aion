import { getPriority } from '../../lib/priorities';

export function PriorityBadge({ level }: { level: number }) {
  const p = getPriority(level);
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${p.bgClass} ${p.textClass}`}>
      <span>{p.symbol}</span>
      <span>{p.name}</span>
    </span>
  );
}
