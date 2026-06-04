import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Task } from '../../api/tasks';
import {
  BLOCKED_REASONS,
  getBlockedReasons,
  getDependencyCount,
  isActionableBlock,
  type BlockedReason,
} from '../../lib/labels';

interface BlockedBoardToolbarProps {
  /** All tasks classified as blocked (already on this board), used to compute counts. */
  blockedTasks: Task[];
}

const STALE_OPTIONS = [
  { value: '', label: 'Any age' },
  { value: '7', label: '7+ days' },
  { value: '14', label: '14+ days' },
  { value: '30', label: '30+ days' },
  { value: '60', label: '60+ days' },
  { value: '90', label: '90+ days' },
];

const MIN_DEPS_OPTIONS = [
  { value: '', label: 'Any deps' },
  { value: '1', label: '1+ dep' },
  { value: '2', label: '2+ deps' },
  { value: '3', label: '3+ deps' },
];

export function BlockedBoardToolbar({ blockedTasks }: BlockedBoardToolbarProps) {
  const [params, setParams] = useSearchParams();
  const activeReason = params.get('blockedReason') ?? '';
  const activeStale = params.get('staleDays') ?? '';
  const activeMinDeps = params.get('minDeps') ?? '';

  const set = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      // staleDays and updatedAfter are mutually exclusive in the popover — preserve that.
      if (key === 'staleDays' && value) next.delete('updatedAfter');
      return next;
    });
  };

  // Compute counts per blocked reason from the unfiltered blocked task set.
  const reasonCounts = useMemo(() => {
    const counts = new Map<BlockedReason, number>();
    for (const t of blockedTasks) {
      const reasons = getBlockedReasons(t.labels ?? []);
      for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return counts;
  }, [blockedTasks]);

  const reasonChips = useMemo(
    () =>
      BLOCKED_REASONS.map((def) => ({
        ...def,
        count: reasonCounts.get(def.reason) ?? 0,
        actionable: isActionableBlock([def.reason]),
      }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count),
    [reasonCounts],
  );

  const totalBlocked = blockedTasks.length;

  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80 mr-1">
          Blocked reason
        </span>
        <button
          onClick={() => set('blockedReason', '')}
          className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
            activeReason === ''
              ? 'bg-red-500/20 text-red-300 border-red-500/40'
              : 'bg-surface-2 text-tertiary border-subtle hover:border-red-500/30'
          }`}
        >
          All ({totalBlocked})
        </button>
        {reasonChips.map((r) => {
          const isActive = activeReason === r.reason;
          const baseColor = r.actionable
            ? isActive
              ? 'bg-amber-500/25 text-amber-200 border-amber-500/50'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:border-amber-500/50'
            : isActive
              ? 'bg-red-500/25 text-red-200 border-red-500/50'
              : 'bg-surface-2 text-tertiary border-subtle hover:border-red-500/30';
          return (
            <button
              key={r.reason}
              onClick={() => set('blockedReason', isActive ? '' : r.reason)}
              title={r.description}
              className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${baseColor}`}
            >
              {r.actionable && <span className="mr-1">▸</span>}
              {r.label} ({r.count})
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80">
            Staleness
          </span>
          <select
            value={activeStale}
            onChange={(e) => set('staleDays', e.target.value)}
            className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
          >
            {STALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400/80">
            Dependencies
          </span>
          <select
            value={activeMinDeps}
            onChange={(e) => set('minDeps', e.target.value)}
            className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
          >
            {MIN_DEPS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-disabled">
            ({blockedTasks.filter((t) => getDependencyCount(t) > 0).length} have deps)
          </span>
        </div>

        <div className="ml-auto text-[10px] text-disabled">
          ▸ = actionable by you · others are passive waits
        </div>
      </div>
    </div>
  );
}
