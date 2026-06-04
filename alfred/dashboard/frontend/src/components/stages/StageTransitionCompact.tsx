import { stageBadgeColor } from '../../lib/stages'

export function StageTransitionCompact({ from, to }: { from: string | null; to: string | null }) {
  if (!from && !to) return <span className="text-disabled">--</span>
  return (
    <span className="inline-flex items-center gap-1">
      {from && <span className={`rounded border px-1 py-0.5 text-xs ${stageBadgeColor(from)}`}>{from}</span>}
      {from && to && <span className="text-disabled text-xs">{'\u2192'}</span>}
      {to && <span className={`rounded border px-1 py-0.5 text-xs ${stageBadgeColor(to)}`}>{to}</span>}
    </span>
  )
}
