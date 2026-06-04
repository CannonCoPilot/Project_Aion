import { useState, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStats, useTaskList } from '../../api/tasks';
import { useCompany } from '../../hooks/useCompany';
import { BOARD_COLUMNS, STAGE_COLUMNS, classifyTask, getTaskStage } from '../../lib/board';
import { BLOCKED_REASONS, getBlockedReasons, type BlockedReason } from '../../lib/labels';
import { PRIORITIES } from '../../lib/priorities';

export function FilterPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const { company, isFiltered } = useCompany();
  const companyFilter = isFiltered ? company : undefined;
  const { data: stats } = useStats(companyFilter);

  const { data: allActiveTasks } = useTaskList({
    status: 'open,in_progress,deferred',
    company: companyFilter,
  });
  const blockedReasonCounts = useMemo(() => {
    const counts = new Map<BlockedReason, number>();
    if (!allActiveTasks) return counts;
    for (const t of allActiveTasks) {
      if (classifyTask(t) !== 'blocked') continue;
      for (const reason of getBlockedReasons(t.labels ?? [])) {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }
    }
    return counts;
  }, [allActiveTasks]);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!allActiveTasks) return counts;
    for (const t of allActiveTasks) {
      const s = getTaskStage(t);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [allActiveTasks]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const set = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const domains = stats ? Object.keys(stats.byDomain).sort() : [];
  const projects = stats ? Object.keys(stats.byProject).sort() : [];
  const sources = stats
    ? Object.keys(stats.bySource).sort(
        (a, b) => (stats.bySource[b] ?? 0) - (stats.bySource[a] ?? 0),
      )
    : [];
  const assignees = stats
    ? Object.keys(stats.byAssignee).sort(
        (a, b) => (stats.byAssignee[b] ?? 0) - (stats.byAssignee[a] ?? 0),
      )
    : [];
  const noProjectCount = stats?.noProject ?? 0;

  const priority = params.get('priority') ?? '';
  const board = params.get('board') ?? '';
  const domain = params.get('domain') ?? '';
  const project = params.get('project') ?? '';
  const source = params.get('source') ?? '';
  const assignee = params.get('assignee') ?? '';
  const blockedReason = params.get('blockedReason') ?? '';
  const stage = params.get('stage') ?? '';
  const updatedAfter = params.get('updatedAfter') ?? '';
  const staleDays = params.get('staleDays') ?? '';

  const activeCount = [
    priority,
    board,
    domain,
    project,
    source,
    assignee,
    blockedReason,
    stage,
    updatedAfter,
    staleDays,
  ].filter(Boolean).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors border ${
          activeCount > 0
            ? 'bg-accent/10 text-accent-text border-accent/30'
            : 'bg-surface-2 text-muted border-subtle hover:text-secondary'
        }`}
      >
        Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold min-w-[1.25rem] text-center">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 rounded-lg border border-default bg-surface-1 shadow-lg p-4 w-80 space-y-4">
          {/* Scope */}
          <div>
            <p className="text-[10px] text-disabled uppercase tracking-wider mb-2">Scope</p>
            <div className="space-y-2">
              <select
                value={domain}
                onChange={(e) => set('domain', e.target.value)}
                className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
              >
                <option value="">All Domains</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {d} ({stats?.byDomain[d]})
                  </option>
                ))}
              </select>
              <select
                value={project}
                onChange={(e) => set('project', e.target.value)}
                className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
              >
                <option value="">All Projects</option>
                <option value="_none">No Project ({noProjectCount})</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p} ({stats?.byProject[p]})
                  </option>
                ))}
              </select>
              <select
                value={source}
                onChange={(e) => set('source', e.target.value)}
                className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
              >
                <option value="">All Sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s} ({stats?.bySource[s]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assignment */}
          <div>
            <p className="text-[10px] text-disabled uppercase tracking-wider mb-2">Assignment</p>
            <div className="space-y-2">
              <select
                value={assignee}
                onChange={(e) => set('assignee', e.target.value)}
                className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
              >
                <option value="">All Assignees</option>
                {assignees.map((a) => (
                  <option key={a} value={a}>
                    {a === '_unassigned' ? 'Unassigned' : a} ({stats?.byAssignee[a]})
                  </option>
                ))}
              </select>
              <select
                value={blockedReason}
                onChange={(e) => set('blockedReason', e.target.value)}
                className="w-full rounded bg-surface-2 border border-red-500/30 px-2 py-1 text-xs text-tertiary focus:border-red-500 focus:outline-none"
              >
                <option value="">Blocked Reason</option>
                {BLOCKED_REASONS.map((r) => ({
                  ...r,
                  count: blockedReasonCounts.get(r.reason) ?? 0,
                }))
                  .filter((r) => r.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map((r) => (
                    <option key={r.reason} value={r.reason}>
                      {r.label} ({r.count})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <p className="text-[10px] text-disabled uppercase tracking-wider mb-2">Pipeline</p>
            <div className="space-y-2">
              <select
                value={priority}
                onChange={(e) => set('priority', e.target.value)}
                className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
              >
                <option value="">All Priorities</option>
                {Object.values(PRIORITIES).map((p) => (
                  <option key={p.level} value={p.level}>
                    {p.symbol} {p.name}
                  </option>
                ))}
              </select>
              <select
                value={board}
                onChange={(e) => set('board', e.target.value)}
                className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
              >
                <option value="">All Boards</option>
                {BOARD_COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={stage}
                onChange={(e) => set('stage', e.target.value)}
                className="w-full rounded bg-surface-2 border border-amber-500/30 px-2 py-1 text-xs text-tertiary focus:border-amber-500 focus:outline-none"
              >
                <option value="">All Stages</option>
                {STAGE_COLUMNS.map((s) => ({ ...s, count: stageCounts.get(s.id) ?? 0 }))
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.count})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Time */}
          <div>
            <p className="text-[10px] text-disabled uppercase tracking-wider mb-2">Time</p>
            <div className="space-y-2">
              <select
                value={updatedAfter ? 'custom' : staleDays || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  // Clear both date filters before setting new one
                  set('updatedAfter', '');
                  set('staleDays', '');
                  if (v.startsWith('recent:')) {
                    const days = parseInt(v.split(':')[1], 10);
                    const iso = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
                    set('updatedAfter', iso);
                  } else if (v.startsWith('stale:')) {
                    set('staleDays', v.split(':')[1]);
                  }
                }}
                className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
              >
                <option value="">Any Time</option>
                <optgroup label="Recently Active">
                  <option value="recent:3">Last 3 days</option>
                  <option value="recent:7">Last 7 days</option>
                  <option value="recent:14">Last 14 days</option>
                  <option value="recent:30">Last 30 days</option>
                </optgroup>
                <optgroup label="Stale (not updated in)">
                  <option value="stale:14">14+ days</option>
                  <option value="stale:30">30+ days</option>
                  <option value="stale:60">60+ days</option>
                  <option value="stale:90">90+ days</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Clear button */}
          {activeCount > 0 && (
            <button
              onClick={() => {
                setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  [
                    'priority',
                    'board',
                    'workspace',
                    'domain',
                    'project',
                    'source',
                    'assignee',
                    'blockedReason',
                    'stage',
                    'updatedAfter',
                    'updatedBefore',
                    'createdAfter',
                    'createdBefore',
                    'closedAfter',
                    'staleDays',
                  ].forEach((k) => next.delete(k));
                  return next;
                });
              }}
              className="text-xs text-faint hover:text-tertiary underline"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
