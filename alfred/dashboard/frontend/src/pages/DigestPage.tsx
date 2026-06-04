import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDigest, type DigestEntry } from '../api/digest';
import { Header } from '../components/layout/Header';

const PRIORITY_LABELS = ['CRIT', 'HIGH', 'MED', 'LOW', 'P4'];
const PRIORITY_COLORS = [
  'text-red-400',
  'text-orange-400',
  'text-yellow-400',
  'text-accent-text',
  'text-faint',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function PipelineBadges({ stages }: { stages: string[] }) {
  const badges: Record<string, { label: string; color: string }> = {
    'pipeline:approved': { label: 'Approved', color: 'bg-green-900 text-green-300' },
    'stage:evaluate': { label: 'Evaluate', color: 'bg-cyan-900 text-cyan-300' },
    'stage:route': { label: 'Route', color: 'bg-indigo-900 text-indigo-300' },
    'stage:review': { label: 'Review', color: 'bg-amber-900 text-amber-300' },
    'stage:queue': { label: 'Queue', color: 'bg-blue-900 text-accent-text-light' },
    'stage:execute': { label: 'Execute', color: 'bg-green-900 text-green-300' },
    'capability:research': { label: 'Research', color: 'bg-purple-900 text-purple-300' },
  };
  if (stages.length === 0) return null;
  return (
    <div className="flex gap-1 mt-1">
      {stages.map((s) => {
        const b = badges[s] || { label: s, color: 'bg-surface-2 text-muted' };
        return (
          <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded ${b.color}`}>
            {b.label}
          </span>
        );
      })}
    </div>
  );
}

function isResearchEntry(entry: DigestEntry): boolean {
  return entry.task.labels.some((l) => l === 'type:research' || l.startsWith('type:research-'));
}

function ResearchTypeBadge({ labels }: { labels: string[] }) {
  const subType = labels.find((l) => l.startsWith('type:research-'));
  const type = subType ? subType.replace('type:research-', '') : 'general';
  const meta: Record<string, { label: string; color: string }> = {
    upgrade: { label: 'Upgrade', color: 'bg-cyan-900 text-cyan-300' },
    investigation: { label: 'Investigation', color: 'bg-amber-900 text-amber-300' },
    capability: { label: 'Capability', color: 'bg-indigo-900 text-indigo-300' },
    threat: { label: 'Threat', color: 'bg-red-900 text-red-300' },
    general: { label: 'Research', color: 'bg-purple-900 text-purple-300' },
  };
  const m = meta[type] || meta.general;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${m.color}`}>{m.label}</span>
  );
}

function EntryCard({ entry }: { entry: DigestEntry }) {
  const [expanded, setExpanded] = useState(false);
  const p = entry.task.priority;
  const isResearch = isResearchEntry(entry);

  return (
    <div
      className={`border rounded-lg p-4 hover:border-subtle transition-colors ${
        isResearch ? 'border-purple-500/20 bg-purple-500/5' : 'border-default bg-surface-1'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isResearch && <ResearchTypeBadge labels={entry.task.labels} />}
            <span className={`text-xs font-bold ${PRIORITY_COLORS[p] || 'text-faint'}`}>
              {PRIORITY_LABELS[p] || `P${p}`}
            </span>
            <Link
              to={`/tasks/${entry.task.id}`}
              className="text-sm font-medium text-secondary hover:text-white truncate"
            >
              {entry.task.title}
            </Link>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-faint">
            <span>{entry.task.id}</span>
            {entry.project && <span className="text-cyan-600">{entry.project}</span>}
            {entry.domain && <span className="text-violet-600">{entry.domain}</span>}
            {entry.actor !== 'unknown' && <span>by {entry.actor}</span>}
            {entry.closedAt && <span>{formatTime(entry.closedAt)}</span>}
          </div>
          <PipelineBadges stages={entry.pipelineStages} />
        </div>
        <div className="flex items-center gap-2">
          {entry.task.external_ref && (
            <a
              href={entry.task.external_ref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-disabled hover:text-muted"
            >
              ext
            </a>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-disabled hover:text-muted px-1"
          >
            {expanded ? '−' : '+'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-default space-y-2">
          {entry.closeReason && (
            <div>
              <div className="text-[10px] text-disabled uppercase tracking-wider mb-0.5">
                Result
              </div>
              <p className="text-xs text-tertiary whitespace-pre-wrap">{entry.closeReason}</p>
            </div>
          )}
          {entry.events.length > 0 && (
            <div>
              <div className="text-[10px] text-disabled uppercase tracking-wider mb-0.5">
                Events
              </div>
              <div className="space-y-0.5">
                {entry.events.map((e, i) => (
                  <div key={i} className="text-xs text-faint flex gap-2">
                    <span className="text-disabled shrink-0">{formatTime(e.timestamp)}</span>
                    <span>
                      {e.type}
                      {e.comment ? `: ${e.comment}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {entry.task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {entry.task.labels.map((l) => (
                <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-faint">
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryBar({ label, data }: { label: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] text-disabled uppercase tracking-wider mb-1">{label}</div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, count]) => (
          <span key={key} className="text-xs text-muted">
            <span className="text-secondary font-medium">{count}</span> {key}
          </span>
        ))}
      </div>
    </div>
  );
}

function ResearchWeekSection({ entries }: { entries: DigestEntry[] }) {
  const researchEntries = entries.filter(isResearchEntry);
  if (researchEntries.length === 0) return null;

  const noAction = researchEntries.filter((e) => {
    const r = (e.closeReason ?? '').toLowerCase();
    return (
      r.includes('no actionable') || r.includes('no action needed') || r.includes('nothing new')
    );
  });
  const withAction = researchEntries.filter((e) => {
    const r = (e.closeReason ?? '').toLowerCase();
    return r.includes('created follow-up') || r.includes('plan it') || r.includes('execute');
  });
  const other = researchEntries.filter((e) => !noAction.includes(e) && !withAction.includes(e));

  const needsAttentionCount = withAction.length + other.length;
  const noActionCount = noAction.length;

  return (
    <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-purple-300">{'\u{1F4D6}'} Research This Week</h3>
        <span className="text-xs text-purple-400/60">
          {researchEntries.length} completed
          {needsAttentionCount > 0 ? `, ${needsAttentionCount} need your attention` : ''}
          {noActionCount > 0 ? `, ${noActionCount} no action` : ''}
        </span>
      </div>

      {withAction.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-purple-400/60 uppercase tracking-wider">Actionable</div>
          {withAction.map((e) => (
            <div key={e.task.id} className="flex items-start gap-2 text-sm">
              <span className="text-amber-400 mt-0.5">\u26A1</span>
              <div className="min-w-0">
                <Link
                  to={`/tasks/${e.task.id}`}
                  className="text-purple-300 hover:text-purple-200 transition-colors"
                >
                  {e.task.title}
                </Link>
                {e.closeReason && <p className="text-xs text-faint truncate">{e.closeReason}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {noAction.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-purple-400/60 uppercase tracking-wider">
            No Action Needed
          </div>
          {noAction.map((e) => (
            <div key={e.task.id} className="flex items-start gap-2 text-sm">
              <span className="text-green-500 mt-0.5">\u2713</span>
              <div className="min-w-0">
                <Link
                  to={`/tasks/${e.task.id}`}
                  className="text-muted hover:text-secondary transition-colors"
                >
                  {e.task.title}
                </Link>
                {e.closeReason && (
                  <p className="text-xs text-faint truncate">
                    {e.closeReason
                      .replace(/^Research complete — /i, '')
                      .replace(/\. Summary in notes\.$/, '')
                      .trim()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {other.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] text-purple-400/60 uppercase tracking-wider">Triaged</div>
          {other.map((e) => (
            <div key={e.task.id} className="flex items-start gap-2 text-sm">
              <span className="text-purple-400 mt-0.5">\u2714</span>
              <div className="min-w-0">
                <Link
                  to={`/tasks/${e.task.id}`}
                  className="text-muted hover:text-secondary transition-colors"
                >
                  {e.task.title}
                </Link>
                {e.closeReason && <p className="text-xs text-faint truncate">{e.closeReason}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DigestPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [project, setProject] = useState('');
  const [domain, setDomain] = useState('');
  const [actor, setActor] = useState('');
  const [statusFilter, setStatusFilter] = useState('closed');

  const {
    data: digest,
    isLoading,
    isError,
  } = useDigest({
    from,
    to,
    project: project || undefined,
    domain: domain || undefined,
    actor: actor || undefined,
    status: statusFilter || undefined,
  });

  const quickRange = (label: string, fromDate: string, toDate: string) => (
    <button
      key={label}
      onClick={() => {
        setFrom(fromDate);
        setTo(toDate);
      }}
      className={`text-xs px-2.5 py-1 rounded transition-colors ${
        from === fromDate && to === toDate
          ? 'bg-blue-900 text-accent-text-light border border-blue-700'
          : 'bg-surface-2 text-muted hover:bg-surface-3 border border-subtle'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <Header title="Digest" />

      {/* Controls */}
      <div className="space-y-3">
        {/* Quick ranges */}
        <div className="flex items-center gap-2 flex-wrap">
          {quickRange('Today', today(), today())}
          {quickRange('Yesterday', daysAgo(1), daysAgo(1))}
          {quickRange('Last 3 days', daysAgo(2), today())}
          {quickRange('This week', daysAgo(6), today())}
          {quickRange('Last 30 days', daysAgo(29), today())}
        </div>

        {/* Date inputs + filters */}
        <div className="flex items-end gap-3 flex-wrap">
          <label className="space-y-1">
            <span className="text-[10px] text-disabled uppercase tracking-wider">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="block bg-surface-2 border border-subtle rounded px-2.5 py-1.5 text-sm text-secondary focus:border-accent-hover focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-disabled uppercase tracking-wider">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="block bg-surface-2 border border-subtle rounded px-2.5 py-1.5 text-sm text-secondary focus:border-accent-hover focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-disabled uppercase tracking-wider">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block bg-surface-2 border border-subtle rounded px-2.5 py-1.5 text-sm text-secondary focus:border-accent-hover focus:outline-none"
            >
              <option value="closed">Completed</option>
              <option value="created">Created</option>
              <option value="in_progress">In Progress</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-disabled uppercase tracking-wider">Project</span>
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="all"
              className="block w-28 bg-surface-2 border border-subtle rounded px-2.5 py-1.5 text-sm text-secondary placeholder-disabled focus:border-accent-hover focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-disabled uppercase tracking-wider">Domain</span>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="all"
              className="block w-28 bg-surface-2 border border-subtle rounded px-2.5 py-1.5 text-sm text-secondary placeholder-disabled focus:border-accent-hover focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-disabled uppercase tracking-wider">Actor</span>
            <input
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="all"
              className="block w-28 bg-surface-2 border border-subtle rounded px-2.5 py-1.5 text-sm text-secondary placeholder-disabled focus:border-accent-hover focus:outline-none"
            />
          </label>
        </div>
      </div>

      {isLoading && <div className="text-faint py-8 text-center">Loading digest...</div>}
      {isError && <div className="text-red-400 py-8 text-center">Failed to load digest.</div>}

      {digest && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-default bg-surface-1 p-4">
              <div className="text-xs text-faint uppercase tracking-wider mb-2">Period Summary</div>
              <div className="flex items-baseline gap-4">
                <div>
                  <span className="text-2xl font-bold text-green-400">{digest.totalCompleted}</span>
                  <span className="text-xs text-faint ml-1">completed</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-accent-text">{digest.totalCreated}</span>
                  <span className="text-xs text-faint ml-1">created</span>
                </div>
                <div>
                  <span className="text-lg font-bold text-amber-400">{digest.totalInProgress}</span>
                  <span className="text-xs text-faint ml-1">active</span>
                </div>
                {(() => {
                  const researchCount = digest.entries.filter(isResearchEntry).length;
                  if (researchCount === 0) return null;
                  return (
                    <div className="border-l border-default pl-3">
                      <span className="text-lg font-bold text-purple-400">{researchCount}</span>
                      <span className="text-xs text-faint ml-1">research</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="rounded-lg border border-default bg-surface-1 p-4 space-y-2">
              <SummaryBar label="By Project" data={digest.byProject} />
              <SummaryBar label="By Domain" data={digest.byDomain} />
            </div>
            <div className="rounded-lg border border-default bg-surface-1 p-4">
              <SummaryBar label="By Actor" data={digest.byActor} />
            </div>
          </div>

          {/* Research This Week — shown on closed/completed digest view */}
          {statusFilter === 'closed' && <ResearchWeekSection entries={digest.entries} />}

          {/* Entries */}
          <div>
            <h3 className="text-sm font-semibold text-tertiary mb-3">
              {digest.entries.length}{' '}
              {statusFilter === 'closed'
                ? 'completed'
                : statusFilter === 'created'
                  ? 'created'
                  : 'active'}{' '}
              task{digest.entries.length !== 1 ? 's' : ''}
            </h3>
            {digest.entries.length === 0 ? (
              <div className="text-disabled text-sm py-8 text-center border border-default rounded-lg">
                No tasks match this filter.
              </div>
            ) : (
              <div className="space-y-2">
                {digest.entries.map((entry) => (
                  <EntryCard key={entry.task.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
