import { useState } from 'react';

interface CloseTaskModalProps {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function CloseTaskModal({ taskTitle, onClose, onConfirm }: CloseTaskModalProps) {
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface-1 border border-subtle rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-sm font-semibold text-secondary mb-1">Close task</h3>
            <p className="text-xs text-muted mb-3 line-clamp-2">{taskTitle}</p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Close reason..."
              autoFocus
              rows={3}
              className="w-full rounded bg-surface-2 border border-subtle px-3 py-2 text-sm text-secondary placeholder-faint focus:border-accent-border focus:outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 px-5 pb-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded px-3 py-1.5 text-sm font-medium text-muted hover:text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!reason.trim()}
              className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Close Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
