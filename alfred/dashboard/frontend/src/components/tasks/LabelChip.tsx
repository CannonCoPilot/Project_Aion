import {
  getLabelColor,
  getLabelValue,
  getLabelPrefix,
  getLabelRole,
  isBlockerLabel,
} from '../../lib/labels';

interface LabelChipProps {
  label: string;
  onRemove?: () => void;
}

export function LabelChip({ label, onRemove }: LabelChipProps) {
  const color = getLabelColor(label);
  const prefix = getLabelPrefix(label);
  const value = getLabelValue(label);
  const role = getLabelRole(label);
  const blocker = isBlockerLabel(label);

  const tooltipText = `${role === 'execution' ? 'Execution' : 'Context'}${blocker ? ' · blocks auto-execution' : ''}`;

  return (
    <span
      className={`group/chip relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${color.bg} ${color.text} ${
        blocker ? 'ring-1 ring-red-500/50' : ''
      }`}
    >
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded bg-surface-base border border-subtle px-2 py-1 text-[10px] text-tertiary opacity-0 transition-opacity delay-150 group-hover/chip:opacity-100 group-focus-within/chip:opacity-100 z-50">
        {tooltipText}
      </span>
      {role === 'execution' && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${blocker ? 'bg-red-400' : 'bg-amber-400'}`}
        />
      )}
      {label.includes(':') && <span className="opacity-60">{prefix}:</span>}
      <span>{value}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 p-1 -mr-0.5 hover:opacity-80 active:opacity-60 min-w-[28px] min-h-[28px] flex items-center justify-center"
          aria-label={`Remove ${label}`}
        >
          &times;
        </button>
      )}
    </span>
  );
}
