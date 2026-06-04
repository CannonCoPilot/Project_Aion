// PersonaDetailPanel — Phase 1.2 Task #3 (v5 design §4.2).
//
// Right-side panel triggered by selecting a persona in any top-level view.
// Renders 8 sub-tabs:
//   1. Overview        — identity + status + deprecation controls
//   2. Config          — engine/model/output/session (no max_turns/budget/timeout per §6.5)
//   3. Permissions     — Persona × Tool relation, grouped by family
//   4. Methodology     — methodology.yaml sections rendered as headings + bodies
//   5. Prompt          — active prompt + edit (Tier C/D) + token-compression placeholders
//   6. Activity        — Octopoda-OS frozen-snapshot row pattern; empty until backfilled
//   7. Relationships   — sub-graph placeholder; full renderer in Phase 1.2 Task #4
//   8. Tool-attention  — file-attention bars placeholder; needs activity data
//
// Tier-gated edit: A/B fully read-only in UI (substrate also refuses); C limited;
// D fully editable. Visible affordances reflect the gate.

import { useMemo, useState } from 'react';
import {
  usePersonaDetail,
  useUpdatePersonaPrompt,
  TIER_META,
  parseLegacyLimits,
  parseTags,
  type PersonaDetail,
  type PersonaMethodology,
  type PersonaPermission,
  type PersonaTier,
} from '../../api/personas';
import { CLUSTERS, resolveCluster } from '../../lib/persona-clusters';

// ---- Tab strip ----

const SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'config', label: 'Config' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'prompt', label: 'Prompt' },
  { id: 'activity', label: 'Activity' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'tool-attention', label: 'Tool-attention' },
] as const;
type SubTabId = typeof SUB_TABS[number]['id'];

function TabStrip({ active, onChange }: { active: SubTabId; onChange: (t: SubTabId) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-default pb-1">
      {SUB_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`rounded-t px-2.5 py-1.5 text-xs font-medium transition-colors ${
            active === tab.id
              ? 'bg-accent/15 text-accent-text'
              : 'text-tertiary hover:bg-surface-2/40 hover:text-secondary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---- Shared helpers ----

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wider text-faint">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <span className="text-faint">{k}</span>
      <span className="text-secondary">{v}</span>
    </>
  );
}

function ReadOnlyNotice({ tier }: { tier: PersonaTier }) {
  if (tier !== 'A' && tier !== 'B') return null;
  return (
    <div className="rounded border border-zinc-500/30 bg-zinc-500/10 px-2.5 py-1.5 text-[11px] text-zinc-300">
      🔒 Tier {tier} — substrate-locked. Edits require filesystem changes; UI is read-only by design.
    </div>
  );
}

function renderMethodologyValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-disabled italic">empty</span>;
  if (typeof value === 'string') {
    return <p className="whitespace-pre-wrap text-xs text-tertiary">{value}</p>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1">
        {value.map((item, i) => (
          <li key={i} className="text-xs text-tertiary">
            • {typeof item === 'string' ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === 'object') {
    return (
      <pre className="whitespace-pre-wrap rounded bg-surface-2 p-2 font-mono text-[11px] text-tertiary">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return <span className="text-xs text-tertiary">{String(value)}</span>;
}

// ---- Sub-tab: Overview ----

function OverviewTab({ detail }: { detail: PersonaDetail }) {
  const m = detail.metadata;
  const tier = TIER_META[m.tier];
  const clusterId = resolveCluster(m.name, m.cluster);
  const cluster = clusterId ? CLUSTERS[clusterId] : null;
  const legacy = parseLegacyLimits(m.legacy_limits);
  const tags = parseTags(m.tags);
  const description = (detail.methodology?.identity as string | undefined) ?? null;

  return (
    <div className="space-y-3">
      <ReadOnlyNotice tier={m.tier} />

      {/* Top strip — identity at a glance */}
      <SectionCard title="Identity">
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          <KV k="name" v={<code className="rounded bg-surface-2 px-1">{m.name}</code>} />
          <KV k="tier" v={<><span aria-hidden>{tier.icon}</span> {tier.label}</>} />
          <KV
            k="cluster"
            v={cluster ? (
              <span className={`rounded px-1.5 py-0.5 text-[11px] ${cluster.bgChip} ${cluster.text}`}>{cluster.label}</span>
            ) : (
              <span className="text-disabled italic">internal-reserved</span>
            )}
          />
          <KV k="model" v={detail.config.engine?.model ?? <span className="text-disabled italic">—</span>} />
          <KV k="engine" v={detail.config.engine?.default ?? <span className="text-disabled italic">—</span>} />
          <KV k="status" v={m.status} />
          <KV k="owner" v={m.owner} />
          <KV k="schema" v={`v${m.schema_version}`} />
          {tags.length > 0 && (
            <KV
              k="tags"
              v={
                <span className="flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <span key={t} className="rounded bg-surface-muted/40 px-1.5 py-0.5 text-[10px] text-muted">{t}</span>
                  ))}
                </span>
              }
            />
          )}
        </div>
      </SectionCard>

      {/* Identity / methodology preview */}
      {description && (
        <SectionCard title="Description (from methodology.identity)">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-tertiary">{description}</p>
        </SectionCard>
      )}

      {/* Connected scheduled jobs */}
      <SectionCard title="Job bindings">
        {m.job_binding_count > 0 ? (
          <a
            href={`/jobs?persona=${m.name}`}
            className="inline-flex items-center gap-1.5 text-xs text-accent-text hover:underline"
          >
            <span aria-hidden>📅</span>
            <span>{m.job_binding_count} scheduled job{m.job_binding_count === 1 ? '' : 's'} → open /jobs</span>
          </a>
        ) : (
          <p className="text-xs text-disabled italic">No scheduled jobs bind this persona.</p>
        )}
      </SectionCard>

      {/* Deprecation — Tier D only */}
      <SectionCard
        title="Lifecycle"
        action={
          m.tier === 'D' && !m.soft_deleted_at ? (
            <button
              className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20"
              onClick={() => alert('Soft-delete flow: ships with Phase 1.2 Task #4 CRUD wizard.')}
            >
              Soft delete
            </button>
          ) : null
        }
      >
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          <KV k="created" v={m.created_at} />
          <KV k="updated" v={m.updated_at} />
          {m.unlocked_until && <KV k="unlocked until" v={m.unlocked_until} />}
          {m.soft_deleted_at && (
            <>
              <KV k="soft-deleted" v={<span className="text-rose-300">{m.soft_deleted_at}</span>} />
              <KV k="retention" v="30-day restore window" />
            </>
          )}
        </div>
      </SectionCard>

      {/* Legacy limits archive — read-only */}
      {legacy && (
        <SectionCard title="Legacy limits (archived; observation tunnel replaces)">
          <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
            {legacy.max_turns !== undefined && <KV k="max_turns" v={String(legacy.max_turns)} />}
            {legacy.max_budget_usd !== undefined && <KV k="max_budget_usd" v={`$${legacy.max_budget_usd}`} />}
            {legacy.timeout_minutes !== undefined && <KV k="timeout_minutes" v={`${legacy.timeout_minutes}m`} />}
          </div>
          <p className="mt-2 text-[11px] text-disabled italic">
            Per v5 design §6.5, hard-coded execution limits are removed system-wide. Runtime protection
            moves to the observation tunnel. These values remain in DB for one release cycle as a revert path.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

// ---- Sub-tab: Config ----

function ConfigTab({ detail }: { detail: PersonaDetail }) {
  const cfg = detail.config;
  const tier = detail.metadata.tier;

  return (
    <div className="space-y-3">
      <ReadOnlyNotice tier={tier} />
      <SectionCard title="Engine">
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          <KV k="default" v={cfg.engine?.default ?? <span className="text-disabled italic">—</span>} />
          <KV k="model" v={cfg.engine?.model ?? <span className="text-disabled italic">—</span>} />
          <KV k="fallback" v={cfg.engine?.fallback ?? <span className="text-disabled italic">none</span>} />
        </div>
      </SectionCard>
      <SectionCard title="Output">
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          <KV k="format" v={cfg.output?.format ?? <span className="text-disabled italic">—</span>} />
          <KV k="save_to" v={cfg.output?.save_to ?? <span className="text-disabled italic">—</span>} />
        </div>
      </SectionCard>
      <SectionCard title="Session">
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          <KV k="persist" v={cfg.session?.persist === true ? 'yes' : cfg.session?.persist === false ? 'no' : <span className="text-disabled italic">—</span>} />
        </div>
      </SectionCard>
      <SectionCard title="Misc">
        <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          <KV k="schema_version" v={cfg.schema_version ?? <span className="text-disabled italic">—</span>} />
          {cfg.env_files && Array.isArray(cfg.env_files) && (
            <KV k="env_files" v={cfg.env_files.join(', ')} />
          )}
        </div>
        <p className="mt-2 text-[11px] text-disabled italic">
          No <code>max_turns</code> / <code>max_budget_usd</code> / <code>timeout_minutes</code> —
          these limits are removed system-wide per v5 §6.5; observation tunnel replaces them.
        </p>
      </SectionCard>
    </div>
  );
}

// ---- Sub-tab: Permissions ----

function PermissionsTab({ detail }: { detail: PersonaDetail }) {
  const tier = detail.metadata.tier;
  const grouped = useMemo(() => {
    const out: Record<string, PersonaPermission[]> = {};
    for (const p of detail.permissions) {
      const fam = p.family || 'Other';
      (out[fam] ||= []).push(p);
    }
    return out;
  }, [detail.permissions]);

  return (
    <div className="space-y-3">
      <ReadOnlyNotice tier={tier} />
      {detail.permissions.length === 0 ? (
        <SectionCard title="Tools">
          <p className="text-xs text-disabled italic">
            No tool assignments recorded in <code>pulse.persona_tool_assignments</code> for this persona yet.
            Existing <code>permissions.yaml</code> on disk is not yet ingested into DB. Backfill scheduled
            for Phase 1.4.
          </p>
        </SectionCard>
      ) : (
        Object.entries(grouped).map(([family, perms]) => (
          <SectionCard key={family} title={`${family} (${perms.length})`}>
            <div className="space-y-1">
              {perms.map((p) => (
                <div key={p.tool_id} className="flex items-center justify-between rounded border border-default bg-surface-2/40 px-2 py-1 text-xs">
                  <span className="flex items-center gap-2">
                    <code className="text-tertiary">{p.tool_id}</code>
                    {p.source_workspace && (
                      <span className="rounded bg-surface-muted/40 px-1.5 py-0.5 text-[10px] text-muted">{p.source_workspace}</span>
                    )}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      p.state === 'allowed'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : p.state === 'denied'
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {p.state}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        ))
      )}
    </div>
  );
}

// ---- Sub-tab: Methodology ----

function MethodologyTab({ detail }: { detail: PersonaDetail }) {
  const m: PersonaMethodology = detail.methodology;
  const keys = Object.keys(m);

  if (keys.length === 0) {
    return (
      <div className="space-y-3">
        <SectionCard title="Methodology">
          <p className="text-xs text-disabled italic">
            No <code>methodology.yaml</code> on disk for this persona. Tier C/D can author a stub via
            the Phase 1.2 Task #4 CRUD wizard.
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ReadOnlyNotice tier={detail.metadata.tier} />
      {keys.map((k) => (
        <SectionCard key={k} title={k.replace(/_/g, ' ')}>
          {renderMethodologyValue(m[k])}
        </SectionCard>
      ))}
    </div>
  );
}

// ---- Sub-tab: Prompt ----

const COMPRESSION_PRESETS = ['off', 'caveman', 'rocky', 'cod', 'brief', 'custom'] as const;
type CompressionPreset = typeof COMPRESSION_PRESETS[number];

function PromptTab({ detail }: { detail: PersonaDetail }) {
  const tier = detail.metadata.tier;
  const editable = tier === 'C' || tier === 'D';
  const active = detail.active_prompt;
  const isFsBaseline = active?.id === 0 && active?.created_by === 'filesystem';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(active?.prompt_content ?? '');
  const [compression, setCompression] = useState<CompressionPreset>('off');
  const updatePrompt = useUpdatePersonaPrompt();

  if (!active) {
    return (
      <SectionCard title="Prompt">
        <p className="text-xs text-disabled italic">No prompt content found (neither DB version nor prompt.md on disk).</p>
      </SectionCard>
    );
  }

  const charCount = (active.prompt_content ?? '').length;
  const handleEdit = () => {
    setDraft(active.prompt_content ?? '');
    setEditing(true);
  };
  const handleSave = () => {
    updatePrompt.mutate(
      {
        name: detail.metadata.name,
        prompt_content: draft,
        version_label: 'ui-edit',
        notes: 'Edited via PersonasPage Detail Panel',
        created_by: 'ui',
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <div className="space-y-3">
      <ReadOnlyNotice tier={tier} />

      <SectionCard
        title={`Version: ${active.version_label ?? 'unlabeled'} · ${charCount.toLocaleString()} chars`}
        action={
          editable ? (
            !editing ? (
              <button
                onClick={handleEdit}
                className="rounded border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] text-accent-text hover:bg-accent/20"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(false)}
                  className="text-[11px] text-faint hover:text-tertiary"
                  disabled={updatePrompt.isPending}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={updatePrompt.isPending}
                  className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {updatePrompt.isPending ? 'Saving…' : 'Save new version'}
                </button>
              </div>
            )
          ) : null
        }
      >
        {isFsBaseline && (
          <p className="mb-2 text-[11px] text-amber-300/80 italic">
            ⚠ Filesystem-baseline read (no DB version row exists). Saving here will create version #1
            and become the new active version.
          </p>
        )}
        {!editable && (
          <p className="mb-2 text-[11px] text-zinc-400 italic">Tier {tier} is read-only — prompt cannot be edited from UI.</p>
        )}
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={24}
            className="w-full rounded border border-subtle bg-surface-2 px-3 py-2 font-mono text-xs text-secondary focus:border-accent-border focus:outline-none"
          />
        ) : (
          <pre className="max-h-[36rem] overflow-y-auto whitespace-pre-wrap rounded bg-surface-2/60 p-3 font-mono text-xs leading-relaxed text-tertiary">
            {active.prompt_content}
          </pre>
        )}
      </SectionCard>

      <SectionCard title="Token-compression mode (Phase 2 wiring; placeholder visual)">
        <div className="flex flex-wrap items-center gap-2">
          {COMPRESSION_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setCompression(p)}
              className={`rounded px-2 py-1 text-[11px] transition-colors ${
                compression === p
                  ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40'
                  : 'bg-surface-2 text-tertiary hover:bg-surface-2/80'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-disabled italic">
          Visual selection only — token estimator wires up in Phase 2. State will persist to DB per
          v5 §6.5; runtime CoD injection consumes it.
        </p>
      </SectionCard>
    </div>
  );
}

// ---- Sub-tab: Activity ----

function ActivityTab({ detail }: { detail: PersonaDetail }) {
  if (!detail.last_activity) {
    return (
      <SectionCard title="Activity">
        <p className="text-xs text-disabled italic">
          No activity records in <code>pulse.persona_activity_snapshots</code> for this persona yet.
          The Octopoda-OS frozen-snapshot pattern (per v5 §4.2 sub-tab 6) starts populating once
          executor.py / executor.sh emit job.fired events tagged with this persona. Until then, the
          token-first activity stream renders empty.
        </p>
      </SectionCard>
    );
  }
  const a = detail.last_activity;
  return (
    <SectionCard title="Most recent activity">
      <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
        <KV k="event" v={a.event_type} />
        <KV k="outcome" v={a.outcome ?? <span className="text-disabled italic">—</span>} />
        <KV k="fired" v={a.occurred_at} />
        {a.tokens_total !== null && <KV k="tokens" v={a.tokens_total.toLocaleString()} />}
      </div>
      <p className="mt-3 text-[11px] text-disabled italic">
        Full Octopoda-OS frozen-snapshot stream (filter by event-type, click-to-expand) wires up in
        Phase 1.2 Task #5 once GET /api/v1/personas/:name/activity has data to query.
      </p>
    </SectionCard>
  );
}

// ---- Sub-tab: Relationships ----

function RelationshipsTab({ detail }: { detail: PersonaDetail }) {
  const m = detail.metadata;
  const permsCount = detail.permissions.length;
  const jobsCount = m.job_binding_count;
  return (
    <SectionCard title="Local neighborhood">
      <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
        <KV k="tools assigned" v={`${permsCount}`} />
        <KV k="jobs bound" v={`${jobsCount}`} />
        <KV
          k="persona mentions"
          v={
            <span className="text-disabled italic">
              cross-reference scan ships with Phase 1.2 Task #4 graph renderer
            </span>
          }
        />
      </div>
      <p className="mt-3 text-[11px] text-disabled italic">
        Sub-graph view (Canvas + d3-force on filtered node set per v5 §4.4) reuses the top-level
        Graph view renderer once Task #4 lands.
      </p>
    </SectionCard>
  );
}

// ---- Sub-tab: Tool-attention ----

function ToolAttentionTab({ detail }: { detail: PersonaDetail }) {
  return (
    <SectionCard title="Tool-attention (ranked by usage + token-cost weight)">
      <p className="text-xs text-disabled italic">
        Empty until activity snapshots accumulate. The file-attention pattern from agent-flow renders
        a heat-colored bar per tool with progress proportional to (invocations × tokens-per-invocation).
        Surfaces cost-optimization candidates. Wires up once GET /api/v1/personas/:name/activity has
        data — Phase 1.2 Task #5.
      </p>
      <div className="mt-3 space-y-1.5">
        {detail.permissions.slice(0, 5).map((p) => (
          <div key={p.tool_id} className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <code className="text-tertiary">{p.tool_id}</code>
              <span className="text-disabled italic">no data</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-surface-2">
              <div className="h-full w-0 bg-amber-500/30" />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---- Root ----

export function PersonaDetailPanel({ name }: { name: string }) {
  const { data: detail, isLoading, isError, error } = usePersonaDetail(name);
  const [activeTab, setActiveTab] = useState<SubTabId>('overview');

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-8 text-center text-sm text-faint">
        Loading {name}…
      </div>
    );
  }
  if (isError || !detail) {
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load persona <code className="rounded bg-surface-2 px-1">{name}</code>:{' '}
        {(error as Error | undefined)?.message ?? 'unknown error'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-secondary">{name}</h2>
        <span className="text-[11px] text-faint">v5 §4.2 Detail Panel — 8 sub-tabs</span>
      </header>
      <TabStrip active={activeTab} onChange={setActiveTab} />
      <div>
        {activeTab === 'overview' && <OverviewTab detail={detail} />}
        {activeTab === 'config' && <ConfigTab detail={detail} />}
        {activeTab === 'permissions' && <PermissionsTab detail={detail} />}
        {activeTab === 'methodology' && <MethodologyTab detail={detail} />}
        {activeTab === 'prompt' && <PromptTab detail={detail} />}
        {activeTab === 'activity' && <ActivityTab detail={detail} />}
        {activeTab === 'relationships' && <RelationshipsTab detail={detail} />}
        {activeTab === 'tool-attention' && <ToolAttentionTab detail={detail} />}
      </div>
    </div>
  );
}
