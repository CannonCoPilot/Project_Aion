const STALE_THRESHOLD_DAYS = 14;

export function isStale(updatedAt: string): boolean {
  const updated = new Date(updatedAt).getTime();
  const now = Date.now();
  const daysSinceUpdate = (now - updated) / (1000 * 60 * 60 * 24);
  return daysSinceUpdate >= STALE_THRESHOLD_DAYS;
}

export function getDaysStale(updatedAt: string): number {
  const updated = new Date(updatedAt).getTime();
  const now = Date.now();
  return Math.floor((now - updated) / (1000 * 60 * 60 * 24));
}

export function StaleBadge({ updatedAt }: { updatedAt: string }) {
  const days = getDaysStale(updatedAt);
  if (days < STALE_THRESHOLD_DAYS) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20">
      {days}d stale
    </span>
  );
}
