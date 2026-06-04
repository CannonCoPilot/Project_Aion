const SHORTCUTS = [
  { key: 'j / k', desc: 'Move focus down / up' },
  { key: 'Enter', desc: 'Open focused task' },
  { key: 'c', desc: 'Claim & start focused task' },
  { key: 'x', desc: 'Close focused task' },
  { key: '/', desc: 'Focus search' },
  { key: 'Esc', desc: 'Clear focus / close' },
  { key: 'a', desc: 'Ask a question (task detail)' },
  { key: '?', desc: 'Toggle this help' },
];

export function KeyboardHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-xl border border-subtle bg-surface-2 p-6 shadow-2xl max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-primary">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-faint hover:text-secondary">&times;</button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map(s => (
            <div key={s.key} className="flex items-center justify-between text-sm">
              <kbd className="rounded bg-surface-3 px-2 py-0.5 font-mono text-xs text-secondary">{s.key}</kbd>
              <span className="text-muted">{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
