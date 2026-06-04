// PersonasPage — Phase 1.2 rebuild (v5 design §4.1).
//
// Catalog of 32 personas grouped by Group → Tier → Cluster. Implements the
// List view (default active top-tab). Other tabs (Matrix, Graph, +New, plus
// Add-on surfaces from §5) are stubbed in this milestone and ship in
// Tasks #3 → #4 → #5.
//
// Deep-link convention (§6.1): /personas/:name selects a persona in the
// sidebar and renders its detail panel.

import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import {
  usePersonas,
  TIER_META,
  type PersonaSummary,
  type PersonaTier,
} from '../api/personas';
import {
  CLUSTERS,
  resolveCluster,
  type ClusterId,
} from '../lib/persona-clusters';
import { PersonaDetailPanel } from '../components/personas/DetailPanel';
import { MatrixView } from '../components/personas/MatrixView';
import { GraphView } from '../components/personas/GraphView';
import { NewPersonaWizard } from '../components/personas/NewPersonaWizard';
import { MissionControlView } from '../components/personas/MissionControlView';
import { HeatmapView } from '../components/personas/HeatmapView';
import { TimelineView } from '../components/personas/TimelineView';
import { FlowView } from '../components/personas/FlowView';
import { VillageView } from '../components/personas/VillageView';
import { PcBoxView } from '../components/personas/PcBoxView';
import { usePersonaStateWebSocket } from '../hooks/usePersonaStateWebSocket';

// ---- Top tabs ----

const CORE_TABS = ['list', 'matrix', 'graph', 'new'] as const;
const ENABLED_ADDON_TABS = ['mission-control', 'heatmap', 'timeline', 'flow', 'village', 'pc-box'] as const;
const ALL_TABS = [...CORE_TABS, ...ENABLED_ADDON_TABS] as const;
type CoreTab = typeof ALL_TABS[number];

const CORE_LABELS: Record<CoreTab, string> = {
  list: 'List',
  matrix: 'Matrix',
  graph: 'Graph',
  new: '+New',
  'mission-control': 'Mission Control',
  heatmap: 'Heatmap',
  timeline: 'Timeline',
  flow: 'Flow',
  village: 'Village',
  'pc-box': 'PC Box',
};

function TopTabs({ active, onChange }: { active: CoreTab; onChange: (t: CoreTab) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-default pb-1">
      {CORE_TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
            active === tab
              ? 'bg-accent/15 text-accent-text'
              : 'text-tertiary hover:text-secondary'
          }`}
        >
          {CORE_LABELS[tab]}
        </button>
      ))}
      <span className="mx-2 text-disabled">|</span>
      {ENABLED_ADDON_TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
            active === tab
              ? 'bg-accent/15 text-accent-text'
              : 'text-tertiary hover:text-secondary'
          }`}
        >
          {CORE_LABELS[tab]}
        </button>
      ))}
      {/* Phase 1.3 complete — all 6 add-on surfaces enabled. */}
    </div>
  );
}

// ---- Status pill — DB status field, refreshed on persona-state WS events ----

const STATUS_PILL: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  starting: 'bg-sky-500/15 text-sky-300',
  waiting: 'bg-amber-500/15 text-amber-300',
  degraded: 'bg-rose-500/15 text-rose-300',
  stopped: 'bg-zinc-500/15 text-zinc-300',
  unknown: 'bg-surface-muted/30 text-muted',
};

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_PILL[status] ?? STATUS_PILL.unknown;
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${cls}`}>
      {status}
    </span>
  );
}

// ---- Persona list row ----

function PersonaRow({
  persona,
  selected,
  onSelect,
}: {
  persona: PersonaSummary;
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  const tier = TIER_META[persona.tier];
  const clusterId = resolveCluster(persona.name, persona.cluster);
  const cluster = clusterId ? CLUSTERS[clusterId] : null;

  // 4px left border = cluster (Tier D) OR a neutral slate (Tier A/B/C with no cluster).
  const borderClass = cluster ? cluster.border : 'border-l-slate-600';

  return (
    <button
      onClick={() => onSelect(persona.name)}
      className={`group w-full rounded-r border border-default border-l-4 ${borderClass} px-2.5 py-1.5 text-left text-xs transition-colors ${
        selected
          ? 'bg-accent/10 ring-1 ring-accent/30'
          : 'bg-surface-1 hover:bg-surface-2'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate">
          <span className="text-[10px]" aria-hidden>{tier.icon}</span>
          <span className={`truncate font-medium ${selected ? 'text-secondary' : 'text-tertiary group-hover:text-secondary'}`}>
            {persona.name}
          </span>
        </span>
        <StatusPill status={persona.status || 'unknown'} />
      </div>
      {persona.job_binding_count > 0 && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-faint">
          <span aria-hidden>📅</span>
          <span>{persona.job_binding_count} job{persona.job_binding_count === 1 ? '' : 's'}</span>
        </div>
      )}
    </button>
  );
}

// ---- Sidebar grouping ----

function TierSectionHeader({ tier, count }: { tier: PersonaTier; count: number }) {
  const meta = TIER_META[tier];
  return (
    <div className="flex items-center justify-between px-1 pt-3 pb-1 text-[11px] uppercase tracking-wider text-faint">
      <span>{meta.label}</span>
      <span className="rounded bg-surface-muted/30 px-1.5 py-0.5 text-[10px] text-muted">{count}</span>
    </div>
  );
}

function ClusterSubgroup({
  cluster,
  personas,
  selectedName,
  expanded,
  onToggle,
  onSelect,
}: {
  cluster: ClusterId;
  personas: PersonaSummary[];
  selectedName: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (name: string) => void;
}) {
  const meta = CLUSTERS[cluster];
  return (
    <div className="mt-1">
      <button
        onClick={onToggle}
        className={`flex w-full items-center justify-between rounded px-1.5 py-1 text-[11px] font-medium ${meta.text} hover:bg-surface-2/40`}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden>{expanded ? '▼' : '▶'}</span>
          <span>{meta.label}</span>
        </span>
        <span className={`rounded ${meta.bgChip} px-1.5 py-0.5 text-[10px] ${meta.text}`}>
          {personas.length}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1 pl-3">
          {personas.map((p) => (
            <PersonaRow
              key={p.name}
              persona={p}
              selected={selectedName === p.name}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Detail Panel — full 8 sub-tabs land in components/personas/DetailPanel.tsx (Phase 1.2 Task #3).

function DetailPanelOrPrompt({ name }: { name: string | null }) {
  if (!name) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-default bg-surface-1 p-8 text-center text-sm text-faint">
        <div className="space-y-1">
          <div>Select a persona to view its detail panel.</div>
          <div className="text-xs text-disabled">
            8 sub-tabs: Overview / Config / Permissions / Methodology / Prompt / Activity / Relationships / Tool-attention.
          </div>
        </div>
      </div>
    );
  }
  return <PersonaDetailPanel name={name} />;
}

// ---- Root ----

export default function PersonasPage() {
  const { name: routeName } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: personas, isLoading, isError } = usePersonas();

  // Subscribe to pulse persona-state WS — invalidates query cache on mutations.
  usePersonaStateWebSocket();

  const viewParam = (searchParams.get('view') as CoreTab | null) ?? 'list';
  const activeTab: CoreTab = ALL_TABS.includes(viewParam) ? viewParam : 'list';
  const setActiveTab = (tab: CoreTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'list') next.delete('view');
    else next.set('view', tab);
    setSearchParams(next, { replace: false });
  };

  // Expanded cluster sub-groups (Tier D). Default: all expanded.
  const [expandedClusters, setExpandedClusters] = useState<Set<ClusterId>>(
    () => new Set(Object.keys(CLUSTERS) as ClusterId[]),
  );

  const groups = useMemo(() => {
    if (!personas) return null;
    // Bucket by tier; within Tier D, bucket by cluster.
    const byTier: Record<PersonaTier, PersonaSummary[]> = { A: [], B: [], C: [], D: [] };
    const tierDByCluster: Record<ClusterId, PersonaSummary[]> = {
      engineering: [], quality: [], research: [], creative: [], planner: [],
    };
    const tierDUnclassified: PersonaSummary[] = [];

    for (const p of personas) {
      const tier = (p.tier as PersonaTier) || 'D';
      byTier[tier].push(p);
      if (tier === 'D') {
        const cluster = resolveCluster(p.name, p.cluster);
        if (cluster) tierDByCluster[cluster].push(p);
        else tierDUnclassified.push(p);
      }
    }

    return { byTier, tierDByCluster, tierDUnclassified };
  }, [personas]);

  const toggleCluster = (c: ClusterId) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const handleSelect = (name: string) => {
    navigate(`/personas/${name}`);
  };

  return (
    <div className="space-y-3">
      <Header title="Personas" />
      <div className="flex items-baseline gap-3 text-xs text-faint">
        <span>{personas?.length ?? 0} registered</span>
        <span className="text-disabled">Phase 1.2 — v5 design §4.1 List view</span>
      </div>

      <TopTabs active={activeTab} onChange={setActiveTab} />

      {isLoading && activeTab === 'list' && (
        <div className="py-12 text-center text-faint">Loading personas…</div>
      )}
      {isError && activeTab === 'list' && (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          Failed to load /api/v1/personas. Check that pulse is healthy and the dashboard
          server's <code>/api/v1/*</code> passthrough proxy is registered.
        </div>
      )}

      {activeTab === 'matrix' && <MatrixView />}
      {activeTab === 'graph' && <GraphView />}
      {activeTab === 'new' && <NewPersonaWizard />}
      {activeTab === 'mission-control' && <MissionControlView />}
      {activeTab === 'heatmap' && <HeatmapView />}
      {activeTab === 'timeline' && <TimelineView />}
      {activeTab === 'flow' && <FlowView />}
      {activeTab === 'village' && <VillageView />}
      {activeTab === 'pc-box' && <PcBoxView />}

      {activeTab === 'list' && groups && (
        <div className="flex gap-4">
          {/* Sidebar */}
          <aside className="w-72 shrink-0 space-y-1 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 200px)' }}>
            {/* Internal Reserved (Tier A + B) */}
            <div className="text-[10px] uppercase tracking-widest text-disabled mt-1">Internal Reserved</div>
            <TierSectionHeader tier="A" count={groups.byTier.A.length} />
            <div className="space-y-1">
              {groups.byTier.A.map((p) => (
                <PersonaRow key={p.name} persona={p} selected={routeName === p.name} onSelect={handleSelect} />
              ))}
            </div>
            <TierSectionHeader tier="B" count={groups.byTier.B.length} />
            <div className="space-y-1">
              {groups.byTier.B.map((p) => (
                <PersonaRow key={p.name} persona={p} selected={routeName === p.name} onSelect={handleSelect} />
              ))}
            </div>

            {/* Free-for-use (Tier C + D) */}
            <div className="text-[10px] uppercase tracking-widest text-disabled mt-4">Free-for-use</div>
            <TierSectionHeader tier="C" count={groups.byTier.C.length} />
            <div className="space-y-1">
              {groups.byTier.C.map((p) => (
                <PersonaRow key={p.name} persona={p} selected={routeName === p.name} onSelect={handleSelect} />
              ))}
            </div>
            <TierSectionHeader tier="D" count={groups.byTier.D.length} />
            <div className="space-y-1">
              {(Object.keys(CLUSTERS) as ClusterId[]).map((cluster) => {
                const items = groups.tierDByCluster[cluster];
                if (items.length === 0) return null;
                return (
                  <ClusterSubgroup
                    key={cluster}
                    cluster={cluster}
                    personas={items}
                    selectedName={routeName ?? null}
                    expanded={expandedClusters.has(cluster)}
                    onToggle={() => toggleCluster(cluster)}
                    onSelect={handleSelect}
                  />
                );
              })}
              {groups.tierDUnclassified.length > 0 && (
                <div className="mt-2">
                  <div className="px-1.5 py-1 text-[11px] text-faint">Unclassified</div>
                  <div className="space-y-1 pl-3">
                    {groups.tierDUnclassified.map((p) => (
                      <PersonaRow key={p.name} persona={p} selected={routeName === p.name} onSelect={handleSelect} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* Detail panel */}
          <main className="min-w-0 flex-1">
            <DetailPanelOrPrompt name={routeName ?? null} />
          </main>
        </div>
      )}
    </div>
  );
}
