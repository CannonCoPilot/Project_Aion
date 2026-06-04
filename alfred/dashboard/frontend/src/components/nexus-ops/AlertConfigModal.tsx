import { useState, useEffect } from 'react'
import type { AlertRule } from '../../api/nexus-ops'
import { useUpdateAlertRule } from '../../api/nexus-ops'

interface Props {
  rules: AlertRule[]
  open: boolean
  onClose: () => void
}

const SEVERITIES: AlertRule['severity'][] = ['info', 'warn', 'error', 'critical']

const SEVERITY_COLORS: Record<AlertRule['severity'], string> = {
  info: 'text-accent-text',
  warn: 'text-amber-400',
  error: 'text-red-300',
  critical: 'text-red-400',
}

export function AlertConfigModal({ rules, open, onClose }: Props) {
  const [draft, setDraft] = useState<AlertRule[]>([])
  const updateRule = useUpdateAlertRule()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(rules.map(r => ({ ...r })))
  }, [open, rules])

  if (!open) return null

  function updateDraftRule(id: string, patch: Partial<AlertRule>) {
    setDraft(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  async function handleSave() {
    setSaving(true)
    const changed = draft.filter(d => {
      const original = rules.find(r => r.id === d.id)
      if (!original) return false
      return (
        d.enabled !== original.enabled ||
        d.threshold !== original.threshold ||
        d.severity !== original.severity
      )
    })
    try {
      await Promise.all(changed.map(rule => updateRule.mutateAsync(rule)))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-subtle bg-surface-1 shadow-2xl mx-4">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-default bg-surface-1 px-6 py-4">
          <h2 className="text-lg font-semibold text-primary">Alert Configuration</h2>
          <button
            onClick={onClose}
            className="text-faint hover:text-tertiary transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="divide-y divide-default">
          {draft.map(rule => (
            <div key={rule.id} className="px-6 py-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-secondary">{rule.name}</div>
                  <div className="text-xs text-faint mt-0.5">{rule.description}</div>
                </div>
                {/* Toggle switch */}
                <button
                  onClick={() => updateDraftRule(rule.id, { enabled: !rule.enabled })}
                  className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${
                    rule.enabled ? 'bg-accent' : 'bg-surface-3'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      rule.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-faint">Threshold</label>
                  <input
                    type="number"
                    value={rule.threshold}
                    onChange={e => updateDraftRule(rule.id, { threshold: Number(e.target.value) })}
                    className="w-20 rounded border border-subtle bg-surface-2 px-2 py-1 text-sm text-secondary focus:border-accent-border focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-faint">Severity</label>
                  <select
                    value={rule.severity}
                    onChange={e => updateDraftRule(rule.id, { severity: e.target.value as AlertRule['severity'] })}
                    className={`rounded border border-subtle bg-surface-2 px-2 py-1 text-sm focus:border-accent-border focus:outline-none ${SEVERITY_COLORS[rule.severity]}`}
                  >
                    {SEVERITIES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-default bg-surface-1 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-subtle px-4 py-2 text-sm text-muted hover:text-secondary hover:border-b-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-accent-hover px-4 py-2 text-sm font-medium text-white hover:bg-accent transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
