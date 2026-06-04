import type { AnalyticsResponse } from '../../../api/nexus-ops';

interface Props {
  sla: AnalyticsResponse['approvalSLA'];
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}m`;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function ApprovalSLA({ sla }: Props) {
  const { agreed, wrong, adjust } = sla.feedbackBreakdown;
  const total = agreed + wrong + adjust;
  const pctAgreed = total > 0 ? (agreed / total) * 100 : 0;
  const pctWrong = total > 0 ? (wrong / total) * 100 : 0;
  const pctAdjust = total > 0 ? (adjust / total) * 100 : 0;

  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3 space-y-4">
      <div className="text-xs text-faint uppercase tracking-wider">Approval SLA</div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-faint mb-1">Avg Time to Feedback</div>
          <div className="text-xl font-bold text-primary">{formatDuration(sla.avgTimeToFeedback)}</div>
        </div>
        <div>
          <div className="text-xs text-faint mb-1">Stale Proposals</div>
          <div
            className={`text-xl font-bold ${
              sla.staleProposals > 0 ? 'text-amber-400' : 'text-primary'
            }`}
          >
            {sla.staleProposals}
          </div>
        </div>
      </div>

      {/* Feedback badges */}
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-500/20 text-green-400">
          Agreed: {agreed}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-500/20 text-red-400">
          Wrong: {wrong}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400">
          Adjust: {adjust}
        </span>
      </div>

      {/* Stacked bar */}
      {total > 0 && (
        <div>
          <div className="text-xs text-faint mb-1">Feedback Distribution</div>
          <div className="flex h-4 rounded overflow-hidden">
            {pctAgreed > 0 && (
              <div
                className="bg-green-500/60 transition-all"
                style={{ width: `${pctAgreed}%` }}
                title={`Agreed: ${agreed} (${pctAgreed.toFixed(0)}%)`}
              />
            )}
            {pctAdjust > 0 && (
              <div
                className="bg-amber-500/60 transition-all"
                style={{ width: `${pctAdjust}%` }}
                title={`Adjust: ${adjust} (${pctAdjust.toFixed(0)}%)`}
              />
            )}
            {pctWrong > 0 && (
              <div
                className="bg-red-500/60 transition-all"
                style={{ width: `${pctWrong}%` }}
                title={`Wrong: ${wrong} (${pctWrong.toFixed(0)}%)`}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
