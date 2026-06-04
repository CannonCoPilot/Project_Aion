import { useState, useRef, useEffect, useCallback } from 'react';
import type { NexusOpsEvent } from '../../api/nexus-ops';

interface ExportMenuProps {
  events: NexusOpsEvent[];
  graphRef?: React.RefObject<HTMLDivElement>;
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportTimelineCSV(events: NexusOpsEvent[]) {
  const headers = [
    'timestamp',
    'type',
    'source',
    'category',
    'task_id',
    'job',
    'persona',
    'summary',
    'cost',
    'duration',
  ];

  const rows = events.map((e) => [
    e.timestamp,
    e.type,
    e.source,
    e.category,
    e.task_id ?? '',
    e.job ?? '',
    e.persona ?? '',
    escapeCSV(e.summary),
    e.cost != null ? String(e.cost) : '',
    e.duration != null ? String(e.duration) : '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const date = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `nexus-ops-timeline-${date}.csv`);
}

export function ExportMenu({ events, graphRef: _graphRef }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent | TouchEvent) {
      const target = (e as TouchEvent).touches?.[0]?.target ?? e.target;
      if (menuRef.current && !menuRef.current.contains(target as Node)) {
        close();
      }
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [open, close]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="text-faint hover:text-tertiary active:text-tertiary transition-colors p-2 -m-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
        title="Export"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-subtle bg-surface-1 shadow-xl py-1">
          <button
            onClick={() => {
              exportTimelineCSV(events);
              close();
            }}
            disabled={events.length === 0}
            className="w-full text-left px-3 py-2 text-xs text-tertiary hover:bg-surface-2 hover:text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Export Timeline CSV
          </button>
          <button
            disabled
            className="w-full text-left px-3 py-2 text-xs text-faint cursor-not-allowed"
            title="Coming soon"
          >
            Export Graph PNG (soon)
          </button>
        </div>
      )}
    </div>
  );
}
