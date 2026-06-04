import { stageBadgeColor } from '../../lib/stages'

export function StageBadge({ label, stage }: { label: string; stage: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${stageBadgeColor(stage)}`}>
      <span className="text-faint mr-1">{label}</span> {stage}
    </span>
  )
}
