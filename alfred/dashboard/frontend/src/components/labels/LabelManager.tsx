import { useState } from 'react';
import { useAddLabel, useRemoveLabel } from '../../api/mutations';
import { LabelChip } from '../tasks/LabelChip';

interface LabelManagerProps {
  taskId: string;
  labels: string[];
}

export function LabelManager({ taskId, labels }: LabelManagerProps) {
  const [newLabel, setNewLabel] = useState('');
  const addLabel = useAddLabel(taskId);
  const removeLabel = useRemoveLabel(taskId);

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    addLabel.mutate(label, { onSuccess: () => setNewLabel('') });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {labels.map(l => (
          <LabelChip
            key={l}
            label={l}
            onRemove={() => removeLabel.mutate(l)}
          />
        ))}
        {labels.length === 0 && <span className="text-sm text-faint">No labels</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          placeholder="Add label (e.g. domain:coding)"
          className="rounded bg-surface-1 border border-subtle px-2 py-1 text-sm text-primary placeholder-faint focus:border-accent-border focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newLabel.trim() || addLabel.isPending}
          className="rounded bg-surface-3 px-2 py-1 text-xs text-tertiary hover:bg-surface-muted disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
