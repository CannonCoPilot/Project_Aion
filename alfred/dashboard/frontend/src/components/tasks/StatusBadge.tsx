import { getStatus } from '../../lib/statuses';

export function StatusBadge({ status }: { status: string }) {
  const s = getStatus(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${s.bgClass} ${s.textClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dotClass}`} />
      {s.label}
    </span>
  );
}
