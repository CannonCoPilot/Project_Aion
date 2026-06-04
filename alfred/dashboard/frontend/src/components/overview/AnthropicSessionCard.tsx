/**
 * Compact Anthropic session status for the Dashboard overview.
 * Shows 5h token window utilization + time remaining. Token-based only.
 * Data from proxy-captured Anthropic API headers exclusively.
 */

import { useSessionWindow } from '../../api/usage';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function AnthropicSessionCard() {
  const { data, isLoading } = useSessionWindow();

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">Anthropic Session</h3>
        <div className="h-16 flex items-center justify-center text-faint text-sm">Loading...</div>
      </div>
    );
  }

  if (data?.status === 'no_proxy_data') {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-3">Anthropic Session</h3>
        <div className="text-xs text-faint text-center py-4">
          No proxy data — set ANTHROPIC_BASE_URL
        </div>
      </div>
    );
  }

  const util5h = data?.five_hour?.utilization != null ? data.five_hour.utilization * 100 : null;
  const resetSec = data?.five_hour?.reset_seconds ?? 0;
  const status = data?.unified_status ?? 'unknown';

  const statusColor =
    status === 'within_limit' || status === 'allowed'
      ? 'text-emerald-400'
      : status === 'limit_reached' || status === 'over_limit' || status === 'rejected'
        ? 'text-red-400'
        : 'text-muted';

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-secondary">Anthropic Session</h3>
        <span className={`text-[10px] font-semibold uppercase ${statusColor}`}>
          {status.replace(/_/g, ' ')}
        </span>
      </div>

      {util5h != null ? (
        <>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted">5h token window</span>
            <span className="text-secondary font-mono">{util5h.toFixed(1)}%</span>
          </div>
          <div className="relative h-2.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${
                util5h >= 80 ? 'bg-red-500' : util5h >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(util5h, 100)}%` }}
            />
          </div>
          {resetSec > 0 && (
            <div className="text-[10px] text-faint mt-1">
              Resets in {formatDuration(resetSec)}
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-faint">Awaiting proxy data...</div>
      )}
    </div>
  );
}
