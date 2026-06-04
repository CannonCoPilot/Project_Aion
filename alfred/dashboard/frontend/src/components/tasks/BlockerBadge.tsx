import type { BlockedReason } from '../../lib/labels';
import { BLOCKED_REASONS } from '../../lib/labels';

interface BlockerBadgeProps {
  blockedReasons?: BlockedReason[];
  dependencyCount?: number;
  dependencyIds?: string[];
}

export function BlockerBadge({
  blockedReasons,
  dependencyCount,
  dependencyIds,
}: BlockerBadgeProps) {
  const isBlocked = blockedReasons && blockedReasons.length > 0;
  const hasDeps = !!(dependencyCount && dependencyCount > 0);

  if (!isBlocked && !hasDeps) return null;

  return (
    <>
      {isBlocked && (
        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/20">
          🚫 {BLOCKED_REASONS.find((r) => r.reason === blockedReasons[0])?.label ?? 'Blocked'}
        </span>
      )}
      {hasDeps && isBlocked && (
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/20"
          title={
            dependencyIds && dependencyIds.length > 0
              ? `Depends on: ${dependencyIds.join(', ')}`
              : undefined
          }
        >
          ⛓ {dependencyCount} dep{dependencyCount === 1 ? '' : 's'}
        </span>
      )}
    </>
  );
}
