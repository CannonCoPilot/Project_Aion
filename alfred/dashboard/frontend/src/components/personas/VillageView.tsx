// Village — Phase 1.3 PoC rebuild (v5 design §5.2).
//
// Pixel-art village where persona sprites wander themed cluster zones.
// Character sprites lifted from pixel-agents (MIT). CSS animations lifted
// from pokegents (MIT). BFS pathfinding with wall-aware tilemap.
//
// LIVE STATE (V4): personas actively running AIFred tasks show distinct
// "typing" frame animation + transit-hop CSS + busy glow ring. Driven by
// WebSocket task.claimed/task.completed events.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  usePersonaVillage,
  usePersonas,
  usePersonasRunning,
  type VillagePosition,
  type PersonaSummary,
} from '../../api/personas';
import { resolveCluster } from '../../lib/persona-clusters';
import { spriteForPersona } from '../../lib/persona-colors';
import {
  TILE_PX, GRID_COLS, GRID_ROWS, SPRITE_SCALE, SPRITE_W, SPRITE_H,
  FRAME_COUNT, DIR_COUNT, STEP_MS_IDLE, STEP_MS_BUSY, COOLDOWN_MIN, COOLDOWN_MAX,
  VILLAGE_MAP, ZONES, type ZoneDefinition,
  isWalkable, bfs, zoneForCluster, findZoneCenter,
  randomWalkableInZone, randomWalkableNear,
} from './village/village-map';
import './village/village-animations.css';

// --- Sprite animation config (pokegents-derived weighted system) ---

interface AnimDef { cls: string; dur: number; weight: number }

const IDLE_ANIMS: AnimDef[] = [
  { cls: 'village-hop', dur: 600, weight: 3 },
  { cls: 'village-wiggle', dur: 800, weight: 2 },
  { cls: 'village-nod', dur: 700, weight: 2 },
  { cls: 'village-bump-right', dur: 500, weight: 1 },
  { cls: 'village-bump-left', dur: 500, weight: 1 },
  { cls: 'village-jump', dur: 500, weight: 1 },
  { cls: 'village-lean', dur: 900, weight: 1 },
  { cls: 'village-doze', dur: 1200, weight: 1 },
  { cls: 'village-shake', dur: 600, weight: 1 },
  { cls: 'village-wave', dur: 800, weight: 1 },
  { cls: 'village-stretch', dur: 1000, weight: 1 },
  { cls: 'village-peek', dur: 900, weight: 1 },
  { cls: 'village-spin', dur: 700, weight: 0.3 },
];

function pickWeighted(anims: AnimDef[], lastIdx: number): number {
  const total = anims.reduce((s, a) => s + a.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < anims.length; i++) {
    r -= anims[i].weight;
    if (r <= 0) {
      if (i === lastIdx && anims.length > 1) return (i + 1) % anims.length;
      return i;
    }
  }
  return 0;
}

// --- Direction enum for sprite frame selection ---

type Dir = 'down' | 'up' | 'right' | 'left';

function directionOf(from: { x: number; y: number }, to: { x: number; y: number }): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

// Sprite sheet layout: 7 cols × 3 rows at 16×32px per frame
// Rows: 0=down, 1=up, 2=right (left = mirror right)
function frameStyle(
  charIndex: number,
  hueRotate: number,
  dir: Dir,
  frameIdx: number,
  activity: 'walk' | 'type' | 'read',
): React.CSSProperties {
  let col: number;
  if (activity === 'walk') col = [0, 1, 2, 1][frameIdx % 4];
  else if (activity === 'type') col = 3 + (frameIdx % 2);
  else col = 5 + (frameIdx % 2);

  const dirRow = dir === 'down' ? 0 : dir === 'up' ? 1 : 2;
  const flipX = dir === 'left';

  return {
    backgroundImage: `url(/village/sprites/char_${charIndex}.png)`,
    backgroundPosition: `-${col * SPRITE_W}px -${dirRow * SPRITE_H}px`,
    backgroundSize: `${FRAME_COUNT * SPRITE_W}px ${DIR_COUNT * SPRITE_H}px`,
    width: SPRITE_W,
    height: SPRITE_H,
    imageRendering: 'pixelated' as const,
    transform: `scale(${SPRITE_SCALE})${flipX ? ' scaleX(-1)' : ''}`,
    transformOrigin: 'bottom center',
    filter: hueRotate !== 0 ? `hue-rotate(${hueRotate}deg)` : undefined,
  };
}

// --- Tile rendering ---

function tileImage(ch: string): string | null {
  if (ch === '.' || ch === 'Z') return '/village/tiles/floor_0.png';
  if (ch === 'P') return '/village/tiles/floor_1.png';
  if (ch === '#') return null;
  return '/village/tiles/floor_0.png';
}

const TileGrid = memo(function TileGrid() {
  const tiles: React.ReactNode[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    const row = VILLAGE_MAP[y] ?? '';
    for (let x = 0; x < GRID_COLS; x++) {
      const ch = row[x] ?? '#';
      const img = tileImage(ch);
      tiles.push(
        <div
          key={`${x},${y}`}
          style={{
            position: 'absolute',
            left: x * TILE_PX,
            top: y * TILE_PX,
            width: TILE_PX,
            height: TILE_PX,
            backgroundColor: img ? undefined : '#1e1b2e',
            backgroundImage: img ? `url(${img})` : undefined,
            backgroundSize: img ? `${TILE_PX}px ${TILE_PX}px` : undefined,
            imageRendering: 'pixelated' as const,
          }}
        />,
      );
    }
  }
  return <>{tiles}</>;
});

// --- Zone overlays ---

const ZoneOverlays = memo(function ZoneOverlays() {
  return (
    <>
      {ZONES.map((z) => {
        const [x0, y0, x1, y1] = z.bounds;
        return (
          <div key={z.name}>
            <div
              className="pointer-events-none absolute rounded"
              style={{
                left: x0 * TILE_PX,
                top: y0 * TILE_PX,
                width: (x1 - x0 + 1) * TILE_PX,
                height: (y1 - y0 + 1) * TILE_PX,
                background: z.bgTint,
                border: `1px solid ${z.color}33`,
              }}
            />
            <div
              className="pointer-events-none absolute select-none font-mono"
              style={{
                left: (x1 - 1) * TILE_PX,
                top: (y1 - 1) * TILE_PX,
                fontSize: 7,
                color: z.color,
                opacity: 0.85,
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {z.label}
            </div>
          </div>
        );
      })}
    </>
  );
});

// --- Hover tooltip ---

interface TooltipProps {
  persona: string;
  meta: PersonaSummary | undefined;
  isBusy: boolean;
  x: number;
  y: number;
}

function SpriteTooltip({ persona, meta, isBusy, x, y }: TooltipProps) {
  const cluster = meta ? resolveCluster(meta.name, meta.cluster) : null;
  return (
    <div
      className="pointer-events-none absolute z-50 rounded border border-default bg-zinc-900/95 px-2 py-1.5 shadow-lg"
      style={{
        left: x * TILE_PX + TILE_PX,
        top: y * TILE_PX - 40,
        minWidth: 120,
      }}
    >
      <div className="text-[10px] font-semibold text-white">{persona}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[8px]">
        {meta && (
          <span className="rounded bg-zinc-700 px-1 text-zinc-300">
            Tier {meta.tier}
          </span>
        )}
        {cluster && (
          <span className="text-zinc-400">{cluster}</span>
        )}
        <span className={`ml-auto rounded px-1 ${isBusy ? 'bg-orange-600/30 text-orange-300' : 'bg-zinc-700/50 text-zinc-500'}`}>
          {isBusy ? '● active' : '○ idle'}
        </span>
      </div>
    </div>
  );
}

// --- Individual sprite ---

interface SpriteProps {
  persona: string;
  meta: PersonaSummary | undefined;
  startX: number;
  startY: number;
  charIndex: number;
  hueRotate: number;
  isBusy: boolean;
  isSpawning: boolean;
  homeZone: ZoneDefinition | undefined;
  onClick: () => void;
}

const VillageSprite = memo(function VillageSprite({
  persona, meta, startX, startY, charIndex, hueRotate, isBusy, isSpawning, homeZone, onClick,
}: SpriteProps) {
  const [pos, setPos] = useState({ x: startX, y: startY });
  const [dir, setDir] = useState<Dir>('down');
  const [frameIdx, setFrameIdx] = useState(0);
  const [animCls, setAnimCls] = useState('village-idle');
  const [hovered, setHovered] = useState(false);

  const posRef = useRef(pos);
  posRef.current = pos;
  const pathRef = useRef<Array<{ x: number; y: number }>>([]);
  const timerRef = useRef<number | null>(null);
  const frameTimerRef = useRef<number | null>(null);
  const lastAnimRef = useRef(-1);
  const busyRef = useRef(isBusy);
  busyRef.current = isBusy;

  const activity = isBusy ? 'type' : 'walk';
  const stepMs = isBusy ? STEP_MS_BUSY : STEP_MS_IDLE;

  useEffect(() => {
    let mounted = true;

    const pickTarget = () => {
      const cur = posRef.current;
      if (busyRef.current && homeZone) {
        return findZoneCenter(homeZone);
      }
      if (homeZone && Math.random() < 0.7) {
        return randomWalkableInZone(homeZone);
      }
      return randomWalkableNear(cur, 5);
    };

    const step = () => {
      if (!mounted) return;
      if (pathRef.current.length > 0) {
        const next = pathRef.current.shift()!;
        const cur = posRef.current;
        setDir(directionOf(cur, next));
        setPos(next);
        setFrameIdx((f) => f + 1);
        const ms = busyRef.current ? STEP_MS_BUSY : STEP_MS_IDLE;
        timerRef.current = window.setTimeout(step, ms);
      } else {
        if (busyRef.current) {
          setAnimCls('village-transit-hop');
          timerRef.current = window.setTimeout(() => {
            if (!mounted) return;
            const target = pickTarget();
            pathRef.current = bfs(posRef.current, target);
            step();
          }, 500);
          return;
        }
        const idx = pickWeighted(IDLE_ANIMS, lastAnimRef.current);
        lastAnimRef.current = idx;
        setAnimCls(IDLE_ANIMS[idx].cls);
        const cooldown = COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN);
        timerRef.current = window.setTimeout(() => {
          if (!mounted) return;
          setAnimCls('village-idle');
          const target = pickTarget();
          pathRef.current = bfs(posRef.current, target);
          step();
        }, IDLE_ANIMS[idx].dur + cooldown);
      }
    };

    timerRef.current = window.setTimeout(step, Math.random() * 2000);
    return () => {
      mounted = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (frameTimerRef.current !== null) window.clearTimeout(frameTimerRef.current);
    };
  }, [homeZone]);

  // When busy state changes, interrupt current path and re-route
  useEffect(() => {
    if (isBusy && homeZone) {
      pathRef.current = bfs(posRef.current, findZoneCenter(homeZone));
      setAnimCls('village-transit-hop');
    } else {
      setAnimCls('village-idle');
    }
  }, [isBusy, homeZone]);

  const spriteStyle = frameStyle(charIndex, hueRotate, dir, frameIdx, activity);
  const renderW = SPRITE_W * SPRITE_SCALE;
  const renderH = SPRITE_H * SPRITE_SCALE;

  return (
    <>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`absolute cursor-pointer border-0 bg-transparent p-0 ${isSpawning ? 'village-spawn' : animCls} ${isBusy ? 'village-busy-glow' : ''}`}
        style={{
          left: pos.x * TILE_PX - (renderW - TILE_PX) / 2,
          top: pos.y * TILE_PX - (renderH - TILE_PX),
          width: renderW,
          height: renderH,
          transition: `left ${stepMs}ms linear, top ${stepMs}ms linear`,
          zIndex: Math.floor(pos.y) + 10,
          overflow: 'hidden',
        }}
        title={persona}
        aria-label={persona}
      >
        <div style={spriteStyle} />
      </button>
      {hovered && (
        <SpriteTooltip persona={persona} meta={meta} isBusy={isBusy} x={pos.x} y={pos.y} />
      )}
    </>
  );
});

// --- Main component ---

export function VillageView() {
  const navigate = useNavigate();
  const { data: village, isLoading: vLoading, isError: vError } = usePersonaVillage();
  const { data: personas } = usePersonas();

  const { data: runningData } = usePersonasRunning();
  const runningSet = useMemo(
    () => new Set(runningData?.running ?? []),
    [runningData],
  );

  const prevNamesRef = useRef<Set<string>>(new Set());
  const spawnSet = useMemo(() => {
    const currentNames = new Set(village?.positions.map((p) => p.persona_name) ?? []);
    const spawned = new Set<string>();
    if (prevNamesRef.current.size > 0) {
      for (const name of currentNames) {
        if (!prevNamesRef.current.has(name)) spawned.add(name);
      }
    }
    prevNamesRef.current = currentNames;
    return spawned;
  }, [village]);

  const personaByName = useMemo(() => {
    const m = new Map<string, PersonaSummary>();
    if (personas) for (const p of personas) m.set(p.name, p);
    return m;
  }, [personas]);

  const uniquePositions = useMemo(() => {
    if (!village) return [] as VillagePosition[];
    const seen = new Set<string>();
    const out: VillagePosition[] = [];
    for (const p of village.positions) {
      if (seen.has(p.persona_name)) continue;
      seen.add(p.persona_name);
      out.push(p);
    }
    return out;
  }, [village]);

  const handleClick = useCallback(
    (name: string) => navigate(`/personas/${name}`),
    [navigate],
  );

  if (vLoading) return <div className="py-12 text-center text-faint">Loading village…</div>;
  if (vError || !village)
    return (
      <div className="rounded border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
        Failed to load /api/v1/persona-village/layout.
      </div>
    );

  const gridPx = { width: GRID_COLS * TILE_PX, height: GRID_ROWS * TILE_PX };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded border border-default bg-surface-1 px-3 py-2 text-xs">
        <span className="text-faint">
          grid: <span className="text-tertiary">{GRID_COLS}×{GRID_ROWS}</span>
        </span>
        <span className="text-faint">
          sprites: <span className="text-tertiary">{uniquePositions.length}</span>
        </span>
        <span className="text-faint">
          zones: <span className="text-tertiary">{ZONES.length}</span>
        </span>
        <span className="text-faint">
          active: <span className="text-orange-400">{runningSet.size}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-[10px]">
        {ZONES.map((z) => (
          <span
            key={z.name}
            className="flex items-center gap-1.5 rounded border border-default bg-surface-1 px-1.5 py-0.5"
          >
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: z.color }} />
            <span className="text-tertiary">{z.label}</span>
          </span>
        ))}
      </div>

      <div className="overflow-auto rounded-lg border border-default bg-surface-1 p-3">
        <div className="relative" style={{ width: gridPx.width, height: gridPx.height }}>
          <TileGrid />
          <ZoneOverlays />

          {uniquePositions.map((p) => {
            const meta = personaByName.get(p.persona_name);
            const cluster = meta ? resolveCluster(meta.name, meta.cluster) : null;
            const { charIndex, hueRotate } = spriteForPersona(p.persona_name, cluster);
            const homeZone = zoneForCluster(cluster);
            const isBusy = runningSet.has(p.persona_name);
            const isSpawning = spawnSet.has(p.persona_name);
            const sx = Math.max(0, Math.min(GRID_COLS - 1, p.grid_x));
            const sy = Math.max(0, Math.min(GRID_ROWS - 1, p.grid_y));
            return (
              <VillageSprite
                key={p.persona_name}
                persona={p.persona_name}
                meta={meta}
                startX={isWalkable(sx, sy) ? sx : 5}
                startY={isWalkable(sx, sy) ? sy : 5}
                charIndex={charIndex}
                hueRotate={hueRotate}
                isBusy={isBusy}
                isSpawning={isSpawning}
                homeZone={homeZone}
                onClick={() => handleClick(p.persona_name)}
              />
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-disabled">
        Pixel-art village with BFS pathfinding + wall avoidance. Sprites lifted from
        pixel-agents (MIT). Personas gravitate toward their cluster zone (70% bias).
        Active personas show typing animation + orange glow + transit speed.
        Click any sprite to open its detail panel.
      </p>
    </div>
  );
}
