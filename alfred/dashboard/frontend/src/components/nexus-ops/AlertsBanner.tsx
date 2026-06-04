import { useState } from 'react'
import type { Alert } from '../../api/nexus-ops'
import { useAcknowledgeAlert } from '../../api/nexus-ops'

const SEVERITY_STYLES: Record<Alert['severity'], { border: string; bg: string; icon: string; iconColor: string }> = {
  critical: { border: 'border-red-500/60', bg: 'bg-red-500/10', icon: '\u26a0', iconColor: 'text-red-400' },
  error: { border: 'border-red-400/40', bg: 'bg-red-400/10', icon: '\u2716', iconColor: 'text-red-300' },
  warn: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', icon: '\u26a0', iconColor: 'text-amber-400' },
  info: { border: 'border-accent/40', bg: 'bg-accent/10', icon: '\u2139', iconColor: 'text-accent-text' },
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function AlertsBanner({ alerts }: { alerts: Alert[] }) {
  const [expanded, setExpanded] = useState(false)
  const ackMutation = useAcknowledgeAlert()

  const active = alerts.filter(a => !a.acknowledged)
  if (active.length === 0) return null

  const COLLAPSE_THRESHOLD = 3
  const visible = expanded ? active : active.slice(0, COLLAPSE_THRESHOLD)
  const hiddenCount = active.length - COLLAPSE_THRESHOLD

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Active Alerts</span>
          <span className="rounded-full bg-red-500/20 text-red-400 px-2 py-0.5 text-xs font-medium">
            {active.length}
          </span>
        </div>
        {active.length > COLLAPSE_THRESHOLD && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-faint hover:text-tertiary transition-colors"
          >
            {expanded ? 'Collapse' : `Show all (${hiddenCount} more)`}
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {visible.map(alert => {
          const style = SEVERITY_STYLES[alert.severity]
          return (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-lg border ${style.border} ${style.bg} px-4 py-2.5`}
            >
              <span className={`mt-0.5 text-sm ${style.iconColor}`}>{style.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-primary">{alert.title}</span>
                  <span className="text-xs text-faint shrink-0">{relativeTime(alert.timestamp)}</span>
                </div>
                <p className="text-xs text-muted mt-0.5 truncate">{alert.message}</p>
              </div>
              <button
                onClick={() => ackMutation.mutate(alert.id)}
                disabled={ackMutation.isPending}
                className="shrink-0 mt-0.5 text-faint hover:text-tertiary transition-colors disabled:opacity-50"
                title="Acknowledge"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
