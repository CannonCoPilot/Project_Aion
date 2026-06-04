import { useState } from 'react';
import { post, patch } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { PRIORITIES } from '../../lib/priorities';

interface BulkActionsProps {
  selectedIds: string[];
  onClear: () => void;
  total: number;
}

export function BulkActions({ selectedIds, onClear, total }: BulkActionsProps) {
  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [showPriority, setShowPriority] = useState(false);
  const [pending, setPending] = useState(false);
  const qc = useQueryClient();

  const count = selectedIds.length;
  if (count === 0) return null;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
  };

  const handleCloseAll = async () => {
    if (!closeReason.trim()) return;
    setPending(true);
    await Promise.all(
      selectedIds.map(id => post(`/tasks/${id}/close`, { reason: closeReason }))
    );
    invalidateAll();
    setPending(false);
    setShowClose(false);
    setCloseReason('');
    onClear();
  };

  const handlePriority = async (level: number) => {
    setPending(true);
    await Promise.all(
      selectedIds.map(id => patch(`/tasks/${id}`, { priority: level }))
    );
    invalidateAll();
    setPending(false);
    setShowPriority(false);
    onClear();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5">
      <span className="text-sm text-accent-text font-medium">
        {count} of {total} selected
      </span>

      <div className="h-4 w-px bg-surface-3 mx-1" />

      {!showClose && !showPriority && (
        <>
          <button
            onClick={() => setShowClose(true)}
            disabled={pending}
            className="rounded bg-surface-3 px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            Close All
          </button>
          <button
            onClick={() => setShowPriority(true)}
            disabled={pending}
            className="rounded bg-surface-3 px-3 py-1 text-xs font-medium text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            Change Priority
          </button>
        </>
      )}

      {showClose && (
        <div className="flex items-center gap-2">
          <input
            value={closeReason}
            onChange={e => setCloseReason(e.target.value)}
            placeholder="Close reason..."
            className="rounded bg-surface-1 border border-b-muted px-2 py-1 text-xs text-primary focus:border-accent-border focus:outline-none w-48"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && closeReason.trim()) handleCloseAll();
              if (e.key === 'Escape') { setShowClose(false); setCloseReason(''); }
            }}
          />
          <button
            onClick={handleCloseAll}
            disabled={!closeReason.trim() || pending}
            className="rounded bg-surface-muted px-2 py-1 text-xs text-white hover:bg-surface-muted disabled:opacity-50"
          >
            {pending ? 'Closing...' : 'Confirm'}
          </button>
          <button
            onClick={() => { setShowClose(false); setCloseReason(''); }}
            className="text-xs text-faint hover:text-tertiary"
          >
            Cancel
          </button>
        </div>
      )}

      {showPriority && (
        <div className="flex items-center gap-1">
          {Object.values(PRIORITIES).map(p => (
            <button
              key={p.level}
              onClick={() => handlePriority(p.level)}
              disabled={pending}
              className={`rounded px-2 py-1 text-xs ${p.textClass} hover:bg-surface-3 disabled:opacity-50`}
            >
              {p.symbol} {p.name}
            </button>
          ))}
          <button
            onClick={() => setShowPriority(false)}
            className="text-xs text-faint hover:text-tertiary ml-1"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="ml-auto">
        <button
          onClick={onClear}
          className="text-xs text-faint hover:text-tertiary"
        >
          Deselect all
        </button>
      </div>
    </div>
  );
}
