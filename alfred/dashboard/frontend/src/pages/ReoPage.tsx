import { useState, useMemo, useEffect, type ReactNode } from 'react';
import {
  useReoTimeline,
  usePersonaAggregates,
  useReoDecision,
  type TimelineEvent,
  type DecisionDetailResponse,
  type CostRow,
  type AuditRow,
} from '../api/reo';

const SINCE_OPTIONS: { label: string; hours: number }[] = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

function fmtCost(usd: number | null): string {
  if (usd == null) return '—';
  if (usd === 0) return '$0';
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function actorColor(actor: string): string {
  if (actor.includes('executor')) return 'bg-cyan-500/20 text-cyan-300';
  if (actor.includes('diagnose')) return 'bg-amber-500/20 text-amber-300';
  if (actor.includes('reviewer')) return 'bg-emerald-500/20 text-emerald-300';
  return 'bg-surface-3 text-tertiary';
}

function outcomeColor(outcome: string): string {
  if (outcome === 'success' || outcome === 'completed' || outcome === 'claimed' || outcome === 'passed') {
    return 'text-emerald-400';
  }
  if (outcome === 'failed' || outcome === 'race_lost' || outcome === 'give_up' || outcome === 'blocked_max_retries') {
    return 'text-red-400';
  }
  if (outcome === 'retry' || outcome === 'retrying' || outcome === 'released_to_queue') {
    return 'text-amber-400';
  }
  return 'text-tertiary';
}

function outcomeChipColor(outcome: string): string {
  if (outcome === 'success' || outcome === 'completed' || outcome === 'claimed' || outcome === 'passed') {
    return 'bg-emerald-500/20 text-emerald-300';
  }
  if (outcome === 'failed' || outcome === 'race_lost' || outcome === 'give_up' || outcome === 'blocked_max_retries') {
    return 'bg-red-500/20 text-red-300';
  }
  if (outcome === 'retry' || outcome === 'retrying' || outcome === 'released_to_queue') {
    return 'bg-amber-500/20 text-amber-300';
  }
  return 'bg-surface-3 text-tertiary';
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

interface FilterPreset {
  id: string;
  label: string;
  hint: string;
  apply: () => Partial<{
    sinceHours: number;
    actor: string[];
    decisionType: string[];
    outcome: string[];
    taskId: string;
    threadId: string;
    q: string;
  }>;
}

const PRESETS: FilterPreset[] = [
  {
    id: 'all',
    label: 'All',
    hint: 'Clear all filters; show everything in the time window.',
    apply: () => ({
      actor: [],
      decisionType: [],
      outcome: [],
      taskId: '',
      threadId: '',
      q: '',
    }),
  },
  {
    id: 'failures-24h',
    label: "Today's failures",
    hint: 'Failed/blocked outcomes in the last 24h.',
    apply: () => ({
      sinceHours: 24,
      outcome: ['failed', 'give_up', 'race_lost', 'blocked_max_retries'],
      actor: [],
      decisionType: [],
      taskId: '',
      threadId: '',
      q: '',
    }),
  },
  {
    id: 'reviewer-7d',
    label: 'Reviewer activity',
    hint: 'All reviewer decisions in the last 7d.',
    apply: () => ({
      sinceHours: 168,
      actor: ['persona:reviewer', 'reviewer'],
      decisionType: [],
      outcome: [],
      taskId: '',
      threadId: '',
      q: '',
    }),
  },
  {
    id: 'executor-24h',
    label: 'Executor decisions',
    hint: 'All executor gate/release decisions in the last 24h.',
    apply: () => ({
      sinceHours: 24,
      actor: ['system:executor', 'persona:executor'],
      decisionType: [],
      outcome: [],
      taskId: '',
      threadId: '',
      q: '',
    }),
  },
  {
    id: 'diagnose-24h',
    label: 'Diagnose triggers',
    hint: 'Diagnose service classifications in the last 24h.',
    apply: () => ({
      sinceHours: 24,
      actor: ['system:diagnose', 'persona:diagnose'],
      decisionType: [],
      outcome: [],
      taskId: '',
      threadId: '',
      q: '',
    }),
  },
];

function readDeepLinkId(): number | null {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('decision_id');
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function writeDeepLinkId(id: number | null): void {
  const url = new URL(window.location.href);
  if (id == null) url.searchParams.delete('decision_id');
  else url.searchParams.set('decision_id', String(id));
  window.history.replaceState({}, '', url.toString());
}

// Initial filter state from URL search params — supports historical /decisions
// deep-link shapes preserved by the DecisionsRedirect wrapper in App.tsx:
//   ?actor=X | ?decision_type=Y | ?outcome=Z | ?thread_id=T  (single-value each).
// Runs once on mount; subsequent filter changes are local state only.
function readInitialFilters(): {
  actor: string[];
  decisionType: string[];
  outcome: string[];
  taskId: string;
  threadId: string;
} {
  if (typeof window === 'undefined') {
    return { actor: [], decisionType: [], outcome: [], taskId: '', threadId: '' };
  }
  const params = new URLSearchParams(window.location.search);
  const a = params.get('actor');
  const d = params.get('decision_type');
  const o = params.get('outcome');
  const tk = params.get('task_id');
  const t = params.get('thread_id');
  return {
    actor: a ? [a] : [],
    decisionType: d ? [d] : [],
    outcome: o ? [o] : [],
    taskId: tk ?? '',
    threadId: t ?? '',
  };
}

function confidenceBar(c: number | null): ReactNode {
  if (c == null) return null;
  const pct = Math.round(c * 100);
  const color = c >= 0.85 ? 'bg-emerald-500' : c >= 0.6 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] tabular-nums text-faint shrink-0"
      title={`confidence ${pct}%`}
    >
      <span className="w-10 h-1 rounded-full bg-surface-3 overflow-hidden">
        <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-7 text-right">{pct}%</span>
    </span>
  );
}

export default function ReoPage() {
  const initial = useMemo(readInitialFilters, []);
  const [sinceHours, setSinceHours] = useState<number>(24);
  const [actorFilter, setActorFilter] = useState<string[]>(initial.actor);
  const [decisionTypeFilter, setDecisionTypeFilter] = useState<string[]>(initial.decisionType);
  const [outcomeFilter, setOutcomeFilter] = useState<string[]>(initial.outcome);
  const [taskId, setTaskId] = useState<string>(initial.taskId);
  const [threadId, setThreadId] = useState<string>(initial.threadId);
  const [q, setQ] = useState<string>('');
  const [selectedEventId, setSelectedEventId] = useState<number | null>(() =>
    typeof window !== 'undefined' ? readDeepLinkId() : null
  );

  useEffect(() => {
    writeDeepLinkId(selectedEventId);
  }, [selectedEventId]);

  const aggregates = usePersonaAggregates({ sinceHours });
  const timeline = useReoTimeline({
    sinceHours,
    actor: actorFilter.length ? actorFilter : undefined,
    decisionType: decisionTypeFilter.length ? decisionTypeFilter : undefined,
    outcome: outcomeFilter.length ? outcomeFilter : undefined,
    taskId: taskId.trim() || undefined,
    threadId: threadId.trim() || undefined,
    q: q.trim() || undefined,
  });

  const events = timeline.data?.events ?? [];

  const stats = useMemo(() => {
    const aggs = aggregates.data?.aggregates ?? [];
    const totalDecisions = aggs.reduce((sum, a) => sum + a.decision_count, 0);
    const totalCost = aggs.reduce((sum, a) => sum + a.total_cost_usd, 0);
    const totalThreads = aggs.reduce((sum, a) => sum + a.thread_count, 0);
    return { totalDecisions, totalCost, totalThreads, personaCount: aggs.length };
  }, [aggregates.data]);

  const decisionTypeChoices = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.decision_type);
    return Array.from(set).sort();
  }, [events]);

  const outcomeChoices = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.outcome);
    return Array.from(set).sort();
  }, [events]);

  const activeFilterCount =
    (actorFilter.length ? 1 : 0) +
    (decisionTypeFilter.length ? 1 : 0) +
    (outcomeFilter.length ? 1 : 0) +
    (taskId.trim() ? 1 : 0) +
    (threadId.trim() ? 1 : 0) +
    (q.trim() ? 1 : 0);

  const clearAll = () => {
    setActorFilter([]);
    setDecisionTypeFilter([]);
    setOutcomeFilter([]);
    setTaskId('');
    setThreadId('');
    setQ('');
  };

  const applyPreset = (preset: FilterPreset) => {
    const p = preset.apply();
    if (p.sinceHours !== undefined) setSinceHours(p.sinceHours);
    if (p.actor !== undefined) setActorFilter(p.actor);
    if (p.decisionType !== undefined) setDecisionTypeFilter(p.decisionType);
    if (p.outcome !== undefined) setOutcomeFilter(p.outcome);
    if (p.taskId !== undefined) setTaskId(p.taskId);
    if (p.threadId !== undefined) setThreadId(p.threadId);
    if (p.q !== undefined) setQ(p.q);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-primary">REO</h1>
          <p className="text-xs text-faint mt-0.5">
            Reviews, Executions, Orchestrations. Filing system for pipeline decision-making — reasoning AND mechanistic decisions across all components. Click any row for the full reasoning trail (case-file drawer pending).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sinceHours}
            onChange={(e) => setSinceHours(Number(e.target.value))}
            className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
          >
            {SINCE_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                Last {o.label}
              </option>
            ))}
          </select>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary hover:bg-surface-3 transition-colors"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Decisions" value={String(stats.totalDecisions)} />
        <StatCard label="Personas" value={String(stats.personaCount)} />
        <StatCard label="Threads" value={String(stats.totalThreads)} />
        <StatCard label="Total cost" value={fmtCost(stats.totalCost)} />
      </div>

      <div className="rounded-lg border border-subtle bg-surface-1 p-3 flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider text-faint w-24 shrink-0 pt-1">
            Presets
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                title={p.hint}
                className="text-[10px] font-medium px-2 py-0.5 rounded bg-surface-2 text-tertiary hover:bg-accent-bg/30 hover:text-primary transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <FilterChipRow
          label="Actor"
          choices={(aggregates.data?.aggregates ?? []).map((a) => ({
            value: a.actor,
            label: `${a.actor} (${a.decision_count})`,
          }))}
          active={actorFilter}
          onToggle={(v) => setActorFilter((arr) => toggle(arr, v))}
          colorFn={actorColor}
        />
        <FilterChipRow
          label="Decision type"
          choices={decisionTypeChoices.map((v) => ({ value: v, label: v }))}
          active={decisionTypeFilter}
          onToggle={(v) => setDecisionTypeFilter((arr) => toggle(arr, v))}
        />
        <FilterChipRow
          label="Outcome"
          choices={outcomeChoices.map((v) => ({ value: v, label: v }))}
          active={outcomeFilter}
          onToggle={(v) => setOutcomeFilter((arr) => toggle(arr, v))}
          colorFn={outcomeChipColor}
        />
        <div className="grid grid-cols-3 gap-2">
          <SearchInput
            label="Search"
            placeholder="Free text in rationale or downstream_effect"
            value={q}
            onChange={setQ}
          />
          <SearchInput
            label="Task ID"
            placeholder="AION-..."
            value={taskId}
            onChange={setTaskId}
          />
          <SearchInput
            label="Thread ID"
            placeholder="exact thread_id"
            value={threadId}
            onChange={setThreadId}
          />
        </div>
      </div>

      <div className="rounded-lg border border-subtle bg-surface-1 overflow-hidden">
        {timeline.isLoading && <TimelineSkeleton rows={8} />}
        {timeline.error && (
          <div className="p-6 text-center text-xs text-red-400">
            Failed to load timeline: {String(timeline.error)}
          </div>
        )}
        {!timeline.isLoading && !timeline.error && events.length === 0 && (
          <div className="p-6 text-center text-xs text-faint flex flex-col gap-1">
            <span>No decisions match the current filters.</span>
            <span className="text-disabled">
              Try a wider time window, a preset above, or "Clear filters".
            </span>
          </div>
        )}
        {events.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-faint border-b border-subtle bg-surface-2/40">
              {events.length} decision{events.length === 1 ? '' : 's'}
              {timeline.data?.count != null && timeline.data.count >= 200 && ' (truncated at 200)'}
            </div>
            <TimelineList events={events} onSelect={setSelectedEventId} selectedId={selectedEventId} />
          </>
        )}
      </div>

      {selectedEventId != null && (
        <CaseFileDrawer eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
      )}
    </div>
  );
}

function TimelineSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-subtle">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 animate-pulse">
          <span className="h-3 w-32 bg-surface-2 rounded shrink-0" />
          <span className="h-3 w-24 bg-surface-2 rounded shrink-0" />
          <span className="h-3 w-28 bg-surface-2 rounded shrink-0" />
          <span className="h-3 w-16 bg-surface-2 rounded shrink-0" />
          <span className="h-3 flex-1 bg-surface-2 rounded" />
          <span className="h-3 w-12 bg-surface-2 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 border border-subtle px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-faint">{label}</div>
      <div className="text-base font-semibold text-primary mt-0.5">{value}</div>
    </div>
  );
}

interface ChipChoice {
  value: string;
  label: string;
}

function FilterChipRow({
  label,
  choices,
  active,
  onToggle,
  colorFn,
}: {
  label: string;
  choices: ChipChoice[];
  active: string[];
  onToggle: (v: string) => void;
  colorFn?: (v: string) => string;
}) {
  if (choices.length === 0) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wider text-faint w-24 shrink-0">
          {label}
        </span>
        <span className="text-xs text-disabled italic">no values in current window</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider text-faint w-24 shrink-0 pt-1">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((c) => {
          const isActive = active.includes(c.value);
          const baseColor = colorFn ? colorFn(c.value) : 'bg-surface-3 text-tertiary';
          const cls = isActive
            ? `${baseColor} ring-1 ring-accent-border`
            : 'bg-surface-2 text-tertiary hover:bg-surface-3';
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onToggle(c.value)}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${cls}`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-wider text-faint">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary placeholder:text-disabled focus:border-accent-border focus:outline-none"
      />
    </div>
  );
}

function TimelineList({
  events,
  onSelect,
  selectedId,
}: {
  events: TimelineEvent[];
  onSelect: (id: number) => void;
  selectedId: number | null;
}) {
  return (
    <div className="divide-y divide-subtle">
      {events.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => onSelect(e.id)}
          className={`w-full flex items-center gap-3 px-3 py-2 transition-colors text-left ${
            e.id === selectedId ? 'bg-accent-bg/30' : 'hover:bg-surface-2/40'
          }`}
        >
          <span className="text-[10px] text-faint font-mono w-40 shrink-0">{fmtTs(e.ts)}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${actorColor(e.actor)} shrink-0`}>
            {e.actor}
          </span>
          <span className="text-xs text-tertiary shrink-0 min-w-[10rem]">
            {e.decision_type}
          </span>
          <span className={`text-xs font-medium shrink-0 min-w-[6rem] ${outcomeColor(e.outcome)}`}>
            {e.outcome}
          </span>
          <span className="text-xs text-faint flex-1 truncate">
            {e.rationale ?? <span className="text-disabled italic">no rationale</span>}
          </span>
          {confidenceBar(e.confidence)}
          <span className="text-xs text-tertiary font-mono shrink-0 w-20 text-right">
            {fmtCost(e.nearest_cost_usd)}
          </span>
        </button>
      ))}
    </div>
  );
}

function CaseFileDrawer({ eventId, onClose }: { eventId: number; onClose: () => void }) {
  const detail = useReoDecision(eventId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        className="fixed inset-0 bg-black/40 z-30"
      />
      <aside className="fixed top-0 right-0 bottom-0 w-[640px] max-w-[90vw] bg-surface-1 border-l border-subtle z-40 flex flex-col shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-subtle flex items-center justify-between bg-surface-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-faint">Decision</span>
            <span className="text-xs text-tertiary font-mono">#{eventId}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-tertiary hover:text-primary transition-colors px-2 py-1"
          >
            Close (esc)
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {detail.isLoading && (
            <div className="p-6 text-center text-xs text-faint">Loading case file…</div>
          )}
          {detail.error && (
            <div className="p-6 text-center text-xs text-red-400">
              Failed to load: {String(detail.error)}
            </div>
          )}
          {detail.data && <CaseFileBody data={detail.data} />}
        </div>
      </aside>
    </>
  );
}

function CaseFileBody({ data }: { data: DecisionDetailResponse }) {
  const { decision, linked_costs, linked_audit } = data;
  const totalCost = linked_costs.reduce((s, c) => s + (c.cost_usd ?? 0), 0);
  return (
    <div className="flex flex-col gap-4 p-4">
      <Section title="Decision">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${actorColor(decision.actor)}`}>
            {decision.actor}
          </span>
          <span className="text-xs text-tertiary">{decision.decision_type}</span>
          <span className={`text-xs font-medium ${outcomeColor(decision.outcome)}`}>
            → {decision.outcome}
          </span>
          {decision.confidence != null && (
            <span className="text-xs text-faint">
              confidence {(decision.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <DefList
          rows={[
            ['Timestamp', fmtTs(decision.ts)],
            ['Thread', decision.thread_id],
            ['Task', decision.task_id ?? '—'],
            ['Parent decision', decision.parent_id != null ? `#${decision.parent_id}` : '—'],
          ]}
        />
        {decision.rationale && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wider text-faint mb-1">Rationale</div>
            <div className="text-xs text-secondary whitespace-pre-wrap">{decision.rationale}</div>
          </div>
        )}
        {decision.downstream_effect != null && (
          <JsonBlock label="Downstream effect" value={decision.downstream_effect} />
        )}
        {decision.alternatives != null && (
          <JsonBlock label="Alternatives" value={decision.alternatives} />
        )}
        {decision.signals_matched != null && (
          <JsonBlock label="Signals matched" value={decision.signals_matched} />
        )}
      </Section>

      <Section
        title={`Linked costs (${linked_costs.length}${
          linked_costs.length > 0 ? ` · ${fmtCost(totalCost)} total` : ''
        })`}
      >
        {linked_costs.length === 0 ? (
          <div className="text-xs text-disabled italic">No cost rows for this thread.</div>
        ) : (
          <CostsTable rows={linked_costs} />
        )}
      </Section>

      <Section title={`Linked audit (${linked_audit.length})`}>
        {linked_audit.length === 0 ? (
          <div className="text-xs text-disabled italic">No audit rows for this thread.</div>
        ) : (
          <AuditTimeline rows={linked_audit} />
        )}
      </Section>

      <Section title="Feedback (B7 — connector pending)">
        <FeedbackStub eventId={decision.id} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-2/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-faint mb-2">{title}</div>
      {children}
    </div>
  );
}

function DefList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-y-1 mt-2 text-xs">
      {rows.map(([k, v]) => (
        <span key={k} className="contents">
          <dt className="text-faint">{k}</dt>
          <dd className="text-tertiary font-mono break-all">{v}</dd>
        </span>
      ))}
    </dl>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wider text-faint mb-1">{label}</div>
      <pre className="text-[11px] text-secondary bg-surface-3 rounded p-2 overflow-x-auto font-mono leading-relaxed">
        {formatted}
      </pre>
    </div>
  );
}

function CostsTable({ rows }: { rows: CostRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-faint text-left">
            <th className="font-medium pb-1 pr-2">Time</th>
            <th className="font-medium pb-1 pr-2">Persona</th>
            <th className="font-medium pb-1 pr-2">Engine / Model</th>
            <th className="font-medium pb-1 pr-2 text-right">Cost</th>
            <th className="font-medium pb-1 pr-2 text-right">Tokens (in/out)</th>
            <th className="font-medium pb-1 text-right">Dur</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {rows.map((c) => (
            <tr key={c.id} className="text-tertiary">
              <td className="py-1 pr-2 font-mono text-faint">{fmtTs(c.ts)}</td>
              <td className="py-1 pr-2">{c.persona ?? '—'}</td>
              <td className="py-1 pr-2 font-mono text-[10px]">
                {c.engine ?? '—'}/{c.model ?? '—'}
              </td>
              <td className="py-1 pr-2 font-mono text-right">{fmtCost(c.cost_usd)}</td>
              <td className="py-1 pr-2 font-mono text-right">
                {(c.input_tokens ?? 0).toLocaleString()}/{(c.output_tokens ?? 0).toLocaleString()}
              </td>
              <td className="py-1 font-mono text-right">
                {c.duration_s != null ? `${c.duration_s.toFixed(1)}s` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTimeline({ rows }: { rows: AuditRow[] }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((a) => (
        <div key={a.id} className="flex items-baseline gap-2 text-[11px]">
          <span className="font-mono text-faint w-32 shrink-0">{fmtTs(a.ts)}</span>
          <span className="text-tertiary shrink-0 min-w-[8rem]">{a.actor}</span>
          <span className="text-secondary shrink-0">{a.action}</span>
          {a.entity_type && (
            <span className="text-faint shrink-0">
              · {a.entity_type}
              {a.entity_id ? `/${a.entity_id}` : ''}
            </span>
          )}
          {a.severity && a.severity !== 'info' && (
            <span
              className={`text-[10px] uppercase tracking-wider shrink-0 ${
                a.severity === 'error' || a.severity === 'critical'
                  ? 'text-red-400'
                  : a.severity === 'warning'
                  ? 'text-amber-400'
                  : 'text-faint'
              }`}
            >
              {a.severity}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function FeedbackStub({ eventId }: { eventId: number }) {
  const [verdict, setVerdict] = useState<'right' | 'wrong' | 'partial' | null>(null);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = () => {
    if (!verdict) return;
    // B7 stub: backend not wired. Log for inspection during smoke test.
    console.log('[REO feedback stub]', { event_id: eventId, verdict, comment });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="text-xs text-emerald-400">
        Captured locally (no backend yet). Verdict: {verdict}.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {(['right', 'wrong', 'partial'] as const).map((v) => (
          <label
            key={v}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer transition-colors ${
              verdict === v
                ? 'bg-accent-bg/40 text-primary ring-1 ring-accent-border'
                : 'bg-surface-2 text-tertiary hover:bg-surface-3'
            }`}
          >
            <input
              type="radio"
              name="reo-verdict"
              checked={verdict === v}
              onChange={() => setVerdict(v)}
              className="sr-only"
            />
            {v}
          </label>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment (max 500 chars)"
        maxLength={500}
        rows={2}
        className="w-full rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary placeholder:text-disabled focus:border-accent-border focus:outline-none"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={!verdict}
        className="self-start rounded bg-accent-bg/30 hover:bg-accent-bg/50 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-primary px-3 py-1 transition-colors"
      >
        Submit feedback
      </button>
      <div className="text-[10px] text-faint italic">
        Backend wire pending in Harden phase H5; stub captures to console for now.
      </div>
    </div>
  );
}
