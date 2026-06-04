/**
 * @deprecated DecisionsPage is superseded by ReoPage. The /decisions route
 * now redirects to /reo via DecisionsRedirect in App.tsx (per re-cleave plan
 * §5.2 M2, 2026-05-11). This file is kept in tree for one release cycle as a
 * fallback safety net; scheduled for deletion at REO Phase 5.5 PRE-SHIP AUDIT.
 *
 * Do not add new features here. Feature-parity audit and port disposition for
 * every affordance is documented at:
 *   Jarvis/projects/project-aion/reports/decisions-to-reo-feature-parity-audit-2026-05-11.md
 *
 * If you find a gap on /reo that this page handled cleanly, port the affordance
 * into ReoPage.tsx rather than restoring this route.
 *
 * --- Original docstring follows ---
 *
 * DecisionsPage — P1.B1 (rich): visualizes pulse.decision_events with cross-table
 * storyline view. Surfaces the "why" payload (alternatives, signals_matched,
 * confidence, rationale) that differentiates decision_events from a generic
 * event log. Storyline drawer joins audit_log + cost_events + decision_events
 * on thread_id for full context comparison (enables executor.sh vs executor.py
 * adapt-absorb-replace progress assessment).
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useDecisions,
  useDecisionStats,
  useRecentThreads,
  useStoryline,
  type DecisionEvent,
  type StorylineEvent,
  type ThreadSummary,
} from '../api/decisions';

// ─── Format helpers ─────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}:${d.getUTCSeconds().toString().padStart(2, '0')}Z`;
}

function truncateThread(id: string): string {
  if (id.length <= 22) return id;
  return id.slice(0, 18) + '…';
}

function actorColor(actor: string): string {
  if (actor.startsWith('persona:')) return 'text-purple-400';
  if (actor.startsWith('system:')) return 'text-blue-400';
  if (actor.startsWith('job:')) return 'text-amber-400';
  if (actor.startsWith('source:')) return 'text-emerald-400';
  return 'text-muted';
}

function outcomeColor(outcome: string): { bg: string; text: string } {
  const o = outcome.toLowerCase();
  if (o.includes('block') || o.includes('fail') || o.includes('reject') || o.includes('lost'))
    return { bg: 'bg-red-500/20', text: 'text-red-400' };
  if (o.includes('warn') || o.includes('retry')) return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
  if (o.includes('skip') || o.includes('release')) return { bg: 'bg-surface-muted/30', text: 'text-faint' };
  return { bg: 'bg-emerald-500/15', text: 'text-emerald-400' };
}

function confidenceBar(c: number | null): React.ReactElement {
  if (c === null) return <span className="text-faint text-xs">—</span>;
  const pct = Math.round(c * 100);
  const color = c >= 0.85 ? 'bg-emerald-500' : c >= 0.6 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 rounded-full bg-surface-muted/40 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted tabular-nums">{pct}%</span>
    </div>
  );
}

// ─── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color = 'text-default',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <p className="text-xs text-faint uppercase tracking-wider">{label}</p>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

// ─── Empty / offline banners ────────────────────────────────────────────────

function OfflineBanner({ detail }: { detail?: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="text-sm font-semibold text-red-400">pulse_dev unreachable</span>
      </div>
      <p className="text-xs text-faint">
        The dashboard cannot reach <code>pulse.decision_events</code>. Check that{' '}
        <code>aifred-dev-postgres</code> is up and the dashboard container has{' '}
        <code>PULSE_DB_*</code> environment variables.
      </p>
      {detail && <p className="text-xs text-faint mt-2 font-mono opacity-60">{detail}</p>}
    </div>
  );
}

function EmptyBanner() {
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-8 text-center">
      <p className="text-sm text-faint">No decisions in pulse_dev yet.</p>
      <p className="text-xs text-faint mt-2">
        Decisions are emitted by personas via the post-supplant Phase 5.5 contract:{' '}
        <code>decisions[]</code> array in persona reports + inline <code>log_decision</code>{' '}
        sites in <code>executor.sh</code> /<code>executor.py</code> /<code>pipeline-watchdog.sh</code>.
      </p>
    </div>
  );
}

// ─── Storyline drawer ───────────────────────────────────────────────────────

function StorylineRow({ event }: { event: StorylineEvent }) {
  const kindStyle =
    event.kind === 'decision'
      ? { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'DEC' }
      : event.kind === 'cost'
      ? { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'COST' }
      : { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'AUDIT' };

  return (
    <div className="border-l-2 border-default pl-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <span className={`px-1.5 py-0.5 rounded ${kindStyle.bg} ${kindStyle.text} font-semibold tabular-nums`}>
          {kindStyle.label}
        </span>
        <span className="font-mono text-faint tabular-nums">{formatTime(event.ts)}</span>
        {event.kind === 'decision' && (
          <>
            <span className={actorColor(event.actor)}>{event.actor}</span>
            <span className="text-faint">/</span>
            <span className="text-default">{event.decision_type}</span>
            <span className="text-faint">→</span>
            <span className={outcomeColor(event.outcome).text}>{event.outcome}</span>
          </>
        )}
        {event.kind === 'audit' && (
          <>
            <span className={actorColor(event.actor)}>{event.actor}</span>
            <span className="text-faint">/</span>
            <span className="text-default">{event.action}</span>
            <span className="text-faint">on</span>
            <span className="text-default">
              {event.entity_type}:{event.entity_id}
            </span>
          </>
        )}
        {event.kind === 'cost' && (
          <>
            <span className="text-default">{event.persona ?? event.job ?? 'cost'}</span>
            <span className="text-faint">/</span>
            <span className="text-default">{event.model}</span>
            <span className="text-faint">·</span>
            <span className="text-emerald-400 tabular-nums">
              ${event.cost_usd?.toFixed(4) ?? '?'}
            </span>
            <span className="text-faint tabular-nums">
              ({event.input_tokens ?? 0}↓ / {event.output_tokens ?? 0}↑)
            </span>
          </>
        )}
      </div>

      {event.kind === 'decision' && event.rationale && (
        <p className="mt-1 text-xs text-muted italic">{event.rationale}</p>
      )}

      {event.kind === 'decision' &&
        (event.alternatives !== null || event.signals_matched !== null || event.downstream_effect !== null) && (
          <details className="mt-1">
            <summary className="text-xs text-faint cursor-pointer hover:text-muted">
              alternatives / signals / downstream
            </summary>
            <pre className="mt-1 text-[11px] font-mono bg-surface-muted/20 rounded p-2 overflow-x-auto">
              {JSON.stringify(
                {
                  alternatives: event.alternatives,
                  signals_matched: event.signals_matched,
                  confidence: event.confidence,
                  downstream_effect: event.downstream_effect,
                },
                null,
                2
              )}
            </pre>
          </details>
        )}

      {event.kind === 'audit' && event.details !== null && (
        <details className="mt-1">
          <summary className="text-xs text-faint cursor-pointer hover:text-muted">details</summary>
          <pre className="mt-1 text-[11px] font-mono bg-surface-muted/20 rounded p-2 overflow-x-auto">
            {JSON.stringify(event.details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function StorylineDrawer({ thread_id, onClose }: { thread_id: string; onClose: () => void }) {
  const { data, isLoading, error } = useStoryline(thread_id);
  const events = data?.events ?? [];
  const kindCounts = useMemo(
    () =>
      events.reduce<Record<string, number>>((acc, e) => {
        acc[e.kind] = (acc[e.kind] ?? 0) + 1;
        return acc;
      }, {}),
    [events]
  );

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close storyline drawer"
      />
      {/* Drawer */}
      <div className="w-full max-w-2xl bg-surface-base border-l border-default shadow-2xl flex flex-col">
        <div className="p-4 border-b border-default flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-default">Storyline</h3>
            <p className="text-xs text-faint font-mono mt-0.5">{thread_id}</p>
            <p className="text-xs text-faint mt-1">
              {events.length} events ({kindCounts.audit ?? 0} audit · {kindCounts.cost ?? 0} cost ·{' '}
              {kindCounts.decision ?? 0} decision)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-faint hover:text-default text-lg leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {isLoading && <p className="text-xs text-faint">Loading…</p>}
          {error && <OfflineBanner detail={String(error)} />}
          {!isLoading && !error && events.length === 0 && (
            <p className="text-xs text-faint">No events for this thread.</p>
          )}
          {events.map((e) => (
            <StorylineRow key={`${e.kind}-${e.id}`} event={e} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function DecisionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [hours] = useState(24);

  const filter = useMemo(
    () => ({
      actor: searchParams.get('actor') ?? undefined,
      decision_type: searchParams.get('decision_type') ?? undefined,
      outcome: searchParams.get('outcome') ?? undefined,
      thread_id: searchParams.get('thread_id') ?? undefined,
      limit: 200,
    }),
    [searchParams]
  );

  const stats = useDecisionStats(hours);
  const decisions = useDecisions(filter);
  const threads = useRecentThreads(50);

  const drawerThread = searchParams.get('drawer');

  function setFilter(key: string, value: string | null) {
    const sp = new URLSearchParams(searchParams);
    if (value === null || value === '') sp.delete(key);
    else sp.set(key, value);
    setSearchParams(sp, { replace: true });
  }

  function openDrawer(thread_id: string) {
    setFilter('drawer', thread_id);
  }

  function closeDrawer() {
    setFilter('drawer', null);
  }

  // ─── Errors ───────────────────────────────────────────────────────────────

  const error = stats.error || decisions.error;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-xl font-semibold text-default">Decisions</h1>
        <p className="text-xs text-faint mt-1">
          Persona and system rationale events from <code>pulse.decision_events</code>. Click any
          thread_id to see the joined audit + cost + decision storyline.
        </p>
      </header>

      {error && <OfflineBanner detail={String(error)} />}

      {!error && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Decisions (24h)"
              value={stats.data?.total ?? '—'}
              color="text-purple-400"
              sub={
                stats.data
                  ? `${stats.data.decisions_per_hour_24h.toFixed(1)} per hour`
                  : undefined
              }
            />
            <StatCard
              label="Unique threads"
              value={stats.data?.unique_threads ?? '—'}
              color="text-blue-400"
            />
            <StatCard
              label="Top actor"
              value={stats.data?.by_actor[0]?.actor ?? '—'}
              sub={
                stats.data?.by_actor[0]
                  ? `${stats.data.by_actor[0].count} decisions`
                  : undefined
              }
              color="text-emerald-400"
            />
            <StatCard
              label="Top decision_type"
              value={stats.data?.by_decision_type[0]?.decision_type ?? '—'}
              sub={
                stats.data?.by_decision_type[0]
                  ? `${stats.data.by_decision_type[0].count} events`
                  : undefined
              }
              color="text-amber-400"
            />
          </div>

          {/* Filters */}
          <div className="rounded-lg border border-default bg-surface-1 p-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-faint uppercase tracking-wider mr-2">Filter</span>
            <input
              type="text"
              placeholder="actor"
              value={filter.actor ?? ''}
              onChange={(e) => setFilter('actor', e.target.value || null)}
              className="bg-surface-base border border-default rounded px-2 py-1 w-40"
            />
            <input
              type="text"
              placeholder="decision_type"
              value={filter.decision_type ?? ''}
              onChange={(e) => setFilter('decision_type', e.target.value || null)}
              className="bg-surface-base border border-default rounded px-2 py-1 w-40"
            />
            <input
              type="text"
              placeholder="outcome"
              value={filter.outcome ?? ''}
              onChange={(e) => setFilter('outcome', e.target.value || null)}
              className="bg-surface-base border border-default rounded px-2 py-1 w-32"
            />
            <input
              type="text"
              placeholder="thread_id"
              value={filter.thread_id ?? ''}
              onChange={(e) => setFilter('thread_id', e.target.value || null)}
              className="bg-surface-base border border-default rounded px-2 py-1 w-48 font-mono"
            />
            {(filter.actor || filter.decision_type || filter.outcome || filter.thread_id) && (
              <button
                onClick={() => setSearchParams({})}
                className="ml-auto text-faint hover:text-default underline"
              >
                clear
              </button>
            )}
          </div>

          {/* Recent threads */}
          <section>
            <h2 className="text-sm font-semibold text-default mb-2">Recent threads</h2>
            {threads.isLoading ? (
              <p className="text-xs text-faint">Loading…</p>
            ) : threads.data && threads.data.threads.length === 0 ? (
              <EmptyBanner />
            ) : (
              <div className="rounded-lg border border-default bg-surface-1 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-surface-muted/30">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium text-faint">thread_id</th>
                      <th className="px-3 py-2 font-medium text-faint">First</th>
                      <th className="px-3 py-2 font-medium text-faint">Last</th>
                      <th className="px-3 py-2 font-medium text-faint text-right">Decisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threads.data?.threads.map((t: ThreadSummary) => (
                      <tr
                        key={t.thread_id}
                        className="border-t border-default hover:bg-surface-muted/20 cursor-pointer"
                        onClick={() => openDrawer(t.thread_id)}
                      >
                        <td className="px-3 py-2 font-mono text-purple-400">
                          {truncateThread(t.thread_id)}
                        </td>
                        <td className="px-3 py-2 text-faint tabular-nums">
                          {formatTimeAgo(t.first_ts)}
                        </td>
                        <td className="px-3 py-2 text-faint tabular-nums">
                          {formatTimeAgo(t.last_ts)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-default">
                          {t.decision_count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Decisions table */}
          <section>
            <h2 className="text-sm font-semibold text-default mb-2">
              Recent decisions {decisions.data ? `(${decisions.data.decisions.length})` : ''}
            </h2>
            {decisions.isLoading ? (
              <p className="text-xs text-faint">Loading…</p>
            ) : decisions.data && decisions.data.decisions.length === 0 ? (
              <EmptyBanner />
            ) : (
              <div className="rounded-lg border border-default bg-surface-1 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-surface-muted/30">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium text-faint">When</th>
                      <th className="px-3 py-2 font-medium text-faint">thread_id</th>
                      <th className="px-3 py-2 font-medium text-faint">Actor</th>
                      <th className="px-3 py-2 font-medium text-faint">Decision</th>
                      <th className="px-3 py-2 font-medium text-faint">Outcome</th>
                      <th className="px-3 py-2 font-medium text-faint">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.data?.decisions.map((d: DecisionEvent) => {
                      const oc = outcomeColor(d.outcome);
                      return (
                        <tr
                          key={d.id}
                          className="border-t border-default hover:bg-surface-muted/20 cursor-pointer"
                          onClick={() => openDrawer(d.thread_id)}
                        >
                          <td className="px-3 py-2 text-faint tabular-nums" title={d.ts}>
                            {formatTimeAgo(d.ts)}
                          </td>
                          <td className="px-3 py-2 font-mono text-purple-400">
                            {truncateThread(d.thread_id)}
                          </td>
                          <td className={`px-3 py-2 ${actorColor(d.actor)}`}>{d.actor}</td>
                          <td className="px-3 py-2 text-default">{d.decision_type}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded ${oc.bg} ${oc.text}`}>
                              {d.outcome}
                            </span>
                          </td>
                          <td className="px-3 py-2">{confidenceBar(d.confidence)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {drawerThread && <StorylineDrawer thread_id={drawerThread} onClose={closeDrawer} />}
    </div>
  );
}
