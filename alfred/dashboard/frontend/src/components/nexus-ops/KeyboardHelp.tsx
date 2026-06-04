interface Props {
  onClose: () => void
}

const SHORTCUTS = [
  { key: 't', action: 'Timeline tab' },
  { key: 'g', action: 'Graph tab' },
  { key: 'a', action: 'Analytics tab' },
  { key: 'f', action: 'Focus filter input' },
  { key: '1', action: '1 hour range' },
  { key: '2', action: '6 hour range' },
  { key: '3', action: '24 hour range' },
  { key: '4', action: '7 day range' },
  { key: '5', action: '30 day range' },
  { key: 'Esc', action: 'Close drawer / overlay' },
  { key: '?', action: 'Toggle this help' },
]

export function KeyboardHelp({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Card */}
      <div className="relative rounded-xl border border-subtle bg-surface-1 shadow-2xl px-6 py-5 mx-4 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-primary">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="text-faint hover:text-tertiary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {SHORTCUTS.map(({ key, action }) => (
            <div key={key} className="contents">
              <kbd className="inline-flex items-center justify-center min-w-[1.75rem] rounded border border-subtle bg-surface-2 px-1.5 py-0.5 text-xs font-mono text-tertiary">
                {key}
              </kbd>
              <span className="text-xs text-muted self-center">{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
