// MatrixView — Phase 1.2 Task #4 (v5 design §4.3).
//
// Direct rendering of the Permission primitive: 32 personas × 131 tools.
// Group rows by tier or cluster (toggle). UNASSIGNED row surfaces tools that
// no persona has access to — per design intent, this is a feature: the
// substrate exposes the orphan-tool problem on the front page.
//
// Bulk operations + CSV/JSON export deferred to Phase 1.4 polish.

import { useMemo, useState } from 'react';
import { usePersonaToolMatrix, TIER_META, type PersonaTier } from '../../api/personas';
import { CLUSTERS, resolveCluster } from '../../lib/persona-clusters';

type GroupBy = 'tier' | 'cluster';

const FAMILY_ORDER = ['Built-in', 'Command', 'MCP', 'Skill', 'Other'] as const;

const FAMILY_COLORS: Record<string, string> = {
  'Built-in': 'bg-zinc-500/15 text-zinc-300',
  MCP: 'bg-teal-500/15 text-teal-300',
  Command: 'bg-orange-500/15 text-orange-300',
  Skill: 'bg-sky-500/15 text-sky-300',
  Other: 'bg-surface-muted/30 text-muted',
};

function CellState({ state }: { state: string | undefined }) {
  if (!state) return <span className="text-disabled">·</span>;
  if (state === 'allowed') return <span className="text-emerald-400">✓</span>;
  if (state === 'denied') return <span className="text-rose-400">✕</span>;
  if (state === 'admin-only') return <span className="text-amber-400">⚙</span>;
  return <span className="text-muted">{state[0]}</span>;
}

export function MatrixView() {
  const { data, isLoading, isError } = usePersonaToolMatrix();
  const [groupBy, setGroupBy] = useState<GroupBy>('tier');
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!data) return null;
    const tools = data.tools.filter((t) => {
      if (familyFilter && t.family !== familyFilter) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.tool_id.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      return true;
    });
    // Group tools by family for column structure
    const byFamily: Record<string, typeof tools> = {};
    for (const t of tools) {
      const fam = t.family || 'Other';
      (byFamily[fam] ||= []).push(t);
    }
    return { tools, byFamily };
  }, [data, familyFilter, search]);

  // Group personas by selected axis
  const personaGroups = useMemo(() => {
    if (!data) return null;
    const groups: Record<string, typeof data.personas> = {};
    for (const p of data.personas) {
      if (groupBy === 'tier') {
        const key = `Tier ${p.tier}`;
        (groups[key] ||= []).push(p);
      } else {
        const c = resolveCluster(p.name, p.cluster);
        const key = c ? CLUSTERS[c].label : (p.tier === 'A' || p.tier === 'B') ? 'Internal Reserved' : 'Unclassified';
        (groups[key] ||= []).push(p);
      }
    }
    return groups;
  }, [data, groupBy]);

  if (isLoading) {
    return <div className="py-12 text-center text-faint">Loading matrix…</div>;
  }
  if (isError || !data || !filtered || !personaGroups) {
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load /api/v1/persona-tool-matrix.
      </div>
    );
  }

  const totalAssignments = Object.values(data.matrix).reduce((acc, perTool) => acc + Object.keys(perTool).length, 0);
  const unassignedCount = data.unassigned_tools?.length ?? 0;

  return (
    <div className="space-y-3">
      {/* Header + controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-default bg-surface-1 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-faint">Group rows by:</span>
          {(['tier', 'cluster'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`rounded px-2 py-1 text-[11px] ${groupBy === g ? 'bg-accent/15 text-accent-text' : 'bg-surface-2 text-tertiary'}`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-faint">Family:</span>
          <button
            onClick={() => setFamilyFilter(null)}
            className={`rounded px-2 py-1 text-[11px] ${familyFilter === null ? 'bg-accent/15 text-accent-text' : 'bg-surface-2 text-tertiary'}`}
          >
            all
          </button>
          {FAMILY_ORDER.filter((f) => f !== 'Other').map((f) => (
            <button
              key={f}
              onClick={() => setFamilyFilter(f)}
              className={`rounded px-2 py-1 text-[11px] ${familyFilter === f ? 'bg-accent/15 text-accent-text' : 'bg-surface-2 text-tertiary'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tool…"
          className="ml-auto rounded border border-subtle bg-surface-2 px-2 py-1 text-xs text-secondary focus:border-accent-border focus:outline-none"
        />
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-faint">
        <span>{data.personas.length} personas × {filtered.tools.length} tools (of {data.tools.length} catalogued)</span>
        <span className="text-disabled">·</span>
        <span>{totalAssignments} assignments recorded</span>
        <span className="text-disabled">·</span>
        <span className="text-amber-300">{unassignedCount} unassigned tools</span>
      </div>

      {/* Matrix */}
      <div className="overflow-auto rounded-lg border border-default bg-surface-1" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <table className="min-w-max text-[10px]">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              <th className="sticky left-0 z-20 bg-surface-2 px-2 py-1.5 text-left text-faint">Persona ↓ / Tool →</th>
              {FAMILY_ORDER.map((fam) => {
                const tools = filtered.byFamily[fam];
                if (!tools || tools.length === 0) return null;
                return (
                  <th key={fam} colSpan={tools.length} className="border-l border-default px-1 py-1 text-center">
                    <span className={`inline-block rounded px-1.5 py-0.5 ${FAMILY_COLORS[fam] ?? FAMILY_COLORS.Other}`}>
                      {fam} ({tools.length})
                    </span>
                  </th>
                );
              })}
            </tr>
            <tr>
              <th className="sticky left-0 z-20 bg-surface-2 px-2 py-1 text-left text-disabled" />
              {FAMILY_ORDER.flatMap((fam) =>
                (filtered.byFamily[fam] || []).map((t) => (
                  <th key={t.tool_id} className="px-1 py-1 text-disabled" title={`${t.name} (${t.tool_id})`}>
                    <div className="w-6 truncate font-normal" style={{ writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)' }}>
                      {t.name}
                    </div>
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {Object.entries(personaGroups).map(([groupKey, personas]) => (
              <>
                <tr key={`${groupKey}-header`}>
                  <td
                    colSpan={1 + filtered.tools.length}
                    className="sticky left-0 z-10 bg-surface-2/80 px-2 py-1 text-[10px] uppercase tracking-wider text-faint"
                  >
                    {groupKey} <span className="text-disabled">({personas.length})</span>
                  </td>
                </tr>
                {personas.map((p) => {
                  const tier = TIER_META[p.tier as PersonaTier];
                  const row = data.matrix[p.name] ?? {};
                  const clusterId = resolveCluster(p.name, p.cluster);
                  const cluster = clusterId ? CLUSTERS[clusterId] : null;
                  return (
                    <tr key={p.name} className="hover:bg-surface-2/30">
                      <td className={`sticky left-0 z-10 bg-surface-1 px-2 py-1 ${tier.locked ? 'text-faint' : 'text-tertiary'}`}>
                        <span aria-hidden>{tier.icon} </span>
                        <a href={`/personas/${p.name}`} className="hover:text-secondary hover:underline">
                          {p.name}
                        </a>
                        {cluster && (
                          <span className={`ml-2 rounded px-1 py-0.5 text-[9px] ${cluster.bgChip} ${cluster.text}`}>
                            {cluster.label.slice(0, 3)}
                          </span>
                        )}
                      </td>
                      {FAMILY_ORDER.flatMap((fam) =>
                        (filtered.byFamily[fam] || []).map((t) => (
                          <td key={`${p.name}:${t.tool_id}`} className="border-l border-default/40 px-1 py-0.5 text-center">
                            <CellState state={row[t.tool_id]} />
                          </td>
                        )),
                      )}
                    </tr>
                  );
                })}
              </>
            ))}

            {/* UNASSIGNED row — orphan tools (per §4.3 intent) */}
            {data.unassigned_tools && data.unassigned_tools.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={1 + filtered.tools.length}
                    className="sticky left-0 z-10 bg-amber-500/10 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-300"
                  >
                    [UNASSIGNED] — orphan tools no persona has access to ({data.unassigned_tools.length})
                  </td>
                </tr>
                <tr>
                  <td className="sticky left-0 z-10 bg-amber-500/5 px-2 py-1 text-amber-300/80 italic">UNASSIGNED</td>
                  {FAMILY_ORDER.flatMap((fam) =>
                    (filtered.byFamily[fam] || []).map((t) => (
                      <td key={`unassigned:${t.tool_id}`} className="border-l border-default/40 px-1 py-0.5 text-center">
                        {data.unassigned_tools.includes(t.tool_id) ? (
                          <span className="text-amber-400">○</span>
                        ) : (
                          <span className="text-disabled">·</span>
                        )}
                      </td>
                    )),
                  )}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-disabled italic">
        Bulk operations (multi-select rows + grant/revoke) and CSV/JSON export ship in Phase 1.4
        polish. Cell click → diff-preview confirmation also Phase 1.4. Current behavior: cells are
        display-only.
      </p>
    </div>
  );
}
