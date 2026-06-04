import type { ActiveMode } from '../../hooks/useActiveMode';

interface Props {
  active: ActiveMode;
  onChange: (mode: ActiveMode) => void;
  collapsed?: boolean;
}

const MODES: { id: ActiveMode; label: string; icon: string; title: string }[] = [
  { id: 'prod', label: 'Prod', icon: '◆', title: 'Prod — Projects + Config (⌘\\)' },
  { id: 'ops', label: 'Ops', icon: '◎', title: 'Ops — Review + Monitor (⌘\\)' },
];

export default function ModeToggle({ active, onChange, collapsed }: Props) {
  if (collapsed) {
    return (
      <div className="flex flex-col gap-1 px-1 pb-2" role="tablist" aria-label="Workspace mode">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => onChange(mode.id)}
            role="tab"
            aria-selected={active === mode.id}
            title={mode.title}
            className={`flex items-center justify-center min-w-[32px] min-h-[32px] rounded transition-colors ${
              active === mode.id
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:bg-surface-2 hover:text-secondary'
            }`}
          >
            <span className="text-base">{mode.icon}</span>
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-stretch gap-1 px-3 pb-3" role="tablist" aria-label="Workspace mode">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          role="tab"
          aria-selected={active === mode.id}
          title={mode.title}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
            active === mode.id
              ? 'bg-accent text-white shadow-sm'
              : 'bg-surface-2 text-muted hover:bg-surface-3 hover:text-secondary'
          }`}
        >
          <span className="text-sm">{mode.icon}</span>
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
