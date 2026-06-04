// PC Box — Phase 1.3 add-on surface (v5 design §5.6).
//
// Pokegents PC-storage metaphor: roster grid of all personas including
// soft-deleted (30d retention window). Each cell = persona "mascot sprite"
// (a colored circle reusing Village's sprite-color convention) + name + tier
// badge. Click opens detail panel. Soft-deleted personas render at reduced
// opacity.
//
// Lowest priority / defer-safe per v5 §5.6 — minimal scope, reuses primitives
// already shipped in Heatmap (Panel) + Village (sprite color logic).

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  usePersonas,
  TIER_META,
  type PersonaSummary,
  type PersonaTier,
} from '../../api/personas';
import { CLUSTERS, resolveCluster } from '../../lib/persona-clusters';
import { spriteForPersona } from '../../lib/persona-colors';

const COL_COUNT = 8;
const SPRITE_W = 16;
const SPRITE_H = 32;
const FRAME_COUNT = 7;
const DIR_COUNT = 3;
const PC_SPRITE_SCALE = 1.5;

const TIER_BADGE_BG: Record<PersonaTier, string> = {
  A: 'bg-zinc-600/30 text-zinc-300',
  B: 'bg-zinc-600/30 text-zinc-300',
  C: 'bg-violet-600/30 text-violet-300',
  D: 'bg-sky-600/30 text-sky-300',
};

type SortMode = 'tier' | 'name' | 'cluster';
type FilterMode = 'all' | 'active' | 'soft-deleted';

export function PcBoxView() {
  const { data: personas, isLoading, isError } = usePersonas();
  const navigate = useNavigate();

  const [sort, setSort] = useState<SortMode>('tier');
  const [filter, setFilter] = useState<FilterMode>('all');

  const filtered = useMemo(() => {
    if (!personas) return [] as PersonaSummary[];
    const isDeleted = (p: PersonaSummary) => p.soft_deleted_at !== null;
    let list = personas;
    if (filter === 'active') list = list.filter((p) => !isDeleted(p));
    else if (filter === 'soft-deleted') list = list.filter((p) => isDeleted(p));

    const TIER_ORDER: Record<PersonaTier, number> = { A: 0, B: 1, C: 2, D: 3 };
    const sorted = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'cluster') {
        const ca = resolveCluster(a.name, a.cluster) ?? 'zzz';
        const cb = resolveCluster(b.name, b.cluster) ?? 'zzz';
        return ca === cb ? a.name.localeCompare(b.name) : ca.localeCompare(cb);
      }
      // tier (default)
      const ta = TIER_ORDER[a.tier as PersonaTier] ?? 99;
      const tb = TIER_ORDER[b.tier as PersonaTier] ?? 99;
      return ta === tb ? a.name.localeCompare(b.name) : ta - tb;
    });
    return sorted;
  }, [personas, sort, filter]);

  const counts = useMemo(() => {
    if (!personas) return { total: 0, active: 0, deleted: 0 };
    const deleted = personas.filter((p) => p.soft_deleted_at !== null).length;
    return { total: personas.length, active: personas.length - deleted, deleted };
  }, [personas]);

  if (isLoading) return <div className="py-12 text-center text-faint">Loading PC box…</div>;
  if (isError || !personas)
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load /api/v1/personas.
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-default bg-surface-1 px-3 py-2 text-xs">
        <span className="text-faint">
          {counts.total} total <span className="text-disabled">·</span>{' '}
          <span className="text-tertiary">{counts.active} active</span>{' '}
          <span className="text-disabled">·</span>{' '}
          <span className="text-tertiary">{counts.deleted} soft-deleted</span>
        </span>
        <div className="flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <span className="text-disabled">sort:</span>
            {(['tier', 'name', 'cluster'] as SortMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setSort(m)}
                className={`rounded px-2 py-1 ${
                  sort === m
                    ? 'bg-accent/15 text-accent-text'
                    : 'bg-surface-1 text-tertiary hover:bg-surface-2'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-disabled">filter:</span>
            {(['all', 'active', 'soft-deleted'] as FilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`rounded px-2 py-1 ${
                  filter === m
                    ? 'bg-accent/15 text-accent-text'
                    : 'bg-surface-1 text-tertiary hover:bg-surface-2'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${COL_COUNT}, minmax(0, 1fr))` }}
      >
        {filtered.map((p) => {
          const isDeleted = p.soft_deleted_at !== null;
          const cluster = resolveCluster(p.name, p.cluster);
          const tier = p.tier as PersonaTier;
          const tierMeta = TIER_META[tier];
          return (
            <button
              key={p.name}
              onClick={() => navigate(`/personas/${p.name}`)}
              className={`group flex flex-col items-center gap-1 rounded border border-default bg-surface-1 p-2 text-center transition-colors hover:bg-surface-2 ${
                isDeleted ? 'opacity-40' : ''
              }`}
              title={`${p.name} — Tier ${p.tier}${isDeleted ? ' (soft-deleted)' : ''}`}
            >
              {(() => {
                const { charIndex, hueRotate } = spriteForPersona(p.name, cluster);
                return (
                  <div
                    className="overflow-hidden"
                    style={{
                      width: SPRITE_W * PC_SPRITE_SCALE,
                      height: SPRITE_H * PC_SPRITE_SCALE,
                    }}
                    aria-hidden
                  >
                    <div
                      style={{
                        backgroundImage: `url(/village/sprites/char_${charIndex}.png)`,
                        backgroundPosition: `0px 0px`,
                        backgroundSize: `${FRAME_COUNT * SPRITE_W}px ${DIR_COUNT * SPRITE_H}px`,
                        width: SPRITE_W,
                        height: SPRITE_H,
                        imageRendering: 'pixelated' as const,
                        transform: `scale(${PC_SPRITE_SCALE})`,
                        transformOrigin: 'top left',
                        filter: hueRotate !== 0 ? `hue-rotate(${hueRotate}deg)` : undefined,
                      }}
                    />
                  </div>
                );
              })()}
              <div className="w-full truncate text-[10px] font-medium text-secondary group-hover:text-primary">
                {p.name}
              </div>
              <div className="flex items-center gap-1 text-[8px]">
                <span className={`rounded px-1 ${TIER_BADGE_BG[tier] ?? 'bg-zinc-700 text-zinc-300'}`}>
                  {tierMeta?.icon} {p.tier}
                </span>
                {cluster && (
                  <span className={`rounded px-1 ${CLUSTERS[cluster].bgChip} ${CLUSTERS[cluster].text}`}>
                    {CLUSTERS[cluster].label.slice(0, 3)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-full py-8 text-center text-xs text-faint">
            No personas match the current filter.
          </div>
        )}
      </div>

      <p className="text-[10px] text-disabled">
        8-column roster of all personas. Click any cell to open the detail panel.
        Soft-deleted personas (30d retention) render at reduced opacity — zero in
        the system today; the filter is wired for when CRUD-delete lands.
      </p>
    </div>
  );
}
