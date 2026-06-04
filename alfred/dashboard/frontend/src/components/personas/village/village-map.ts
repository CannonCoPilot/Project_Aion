export const TILE_PX = 16;
export const GRID_COLS = 34;
export const GRID_ROWS = 30;
export const SPRITE_SCALE = 2;
export const SPRITE_W = 16;
export const SPRITE_H = 32;
export const FRAME_COUNT = 7;
export const DIR_COUNT = 3;

export const STEP_MS_IDLE = 225;
export const STEP_MS_BUSY = 60;
export const COOLDOWN_MIN = 850;
export const COOLDOWN_MAX = 1400;

export type TileType = '.' | '#' | 'P' | 'Z';

// 34×30 village map. '#'=wall, '.'=floor, 'P'=path, 'Z'=zone center
// Every row MUST be exactly 34 characters.
export const VILLAGE_MAP: readonly string[] = [
  '##################################', // 0  outer wall
  '#........#..........#............#', // 1  eng | qual | internal
  '#........#..........#............#', // 2
  '#........#..........#............#', // 3
  '#...Z....#....Z.....#.....Z......#', // 4  zone centers
  '#........#..........#............#', // 5
  '#........#..........#............#', // 6
  '#........#..........#............#', // 7
  '#........#..........#............#', // 8
  '#####..########..########..#######', // 9  south wall + doorways
  '..................................', // 10 hallway
  '..................................', // 11 hallway
  '#####..########..########..#######', // 12 north wall + doorways
  '#........#..........#............#', // 13 creative | planner | research
  '#........#..........#............#', // 14
  '#...Z....#....Z.....#............#', // 15 zone centers
  '#........#..........#.....Z......#', // 16
  '#........#..........#............#', // 17
  '#........#..........#............#', // 18
  '#........#..........#............#', // 19
  '#####..########..########..#######', // 20 south wall + doorways
  '..................................', // 21 hallway
  '..................................', // 22 hallway
  '#####..###########################', // 23 north wall of library
  '#................................#', // 24 library
  '#................................#', // 25
  '#...............Z................#', // 26 zone center
  '#................................#', // 27
  '#................................#', // 28
  '##################################', // 29 outer wall
];

export interface ZoneDefinition {
  name: string;
  label: string;
  bounds: [number, number, number, number]; // [x0, y0, x1, y1]
  color: string;
  bgTint: string;
}

export const ZONES: ZoneDefinition[] = [
  { name: 'engineering', label: 'Engineering', bounds: [1, 1, 8, 8], color: '#0ea5e9', bgTint: 'rgba(14,165,233,0.12)' },
  { name: 'quality', label: 'Quality', bounds: [10, 1, 19, 8], color: '#f59e0b', bgTint: 'rgba(245,158,11,0.12)' },
  { name: 'internal', label: 'Internal', bounds: [21, 1, 32, 8], color: '#a1a1aa', bgTint: 'rgba(161,161,170,0.12)' },
  { name: 'creative', label: 'Creative', bounds: [1, 13, 8, 19], color: '#10b981', bgTint: 'rgba(16,185,129,0.12)' },
  { name: 'planner', label: 'Planner', bounds: [10, 13, 19, 19], color: '#8b5cf6', bgTint: 'rgba(139,92,246,0.12)' },
  { name: 'research', label: 'Research', bounds: [21, 13, 32, 19], color: '#14b8a6', bgTint: 'rgba(20,184,166,0.12)' },
  { name: 'library', label: 'Library', bounds: [1, 24, 32, 28], color: '#38bdf8', bgTint: 'rgba(56,189,248,0.12)' },
];

export function isWalkable(x: number, y: number): boolean {
  if (y < 0 || y >= GRID_ROWS || x < 0 || x >= GRID_COLS) return false;
  const row = VILLAGE_MAP[y];
  if (!row || x >= row.length) return false;
  const ch = row[x];
  return ch === '.' || ch === 'P' || ch === 'Z';
}

export function zoneForCluster(cluster: string | null | undefined): ZoneDefinition | undefined {
  if (!cluster) return undefined;
  return ZONES.find((z) => z.name === cluster);
}

export function bfs(
  start: { x: number; y: number },
  dest: { x: number; y: number },
): Array<{ x: number; y: number }> {
  if (start.x === dest.x && start.y === dest.y) return [];
  if (!isWalkable(dest.x, dest.y)) return [];
  const visited = new Map<string, string | null>();
  const startKey = `${start.x},${start.y}`;
  const destKey = `${dest.x},${dest.y}`;
  visited.set(startKey, null);
  const queue: Array<{ x: number; y: number }> = [start];
  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curKey = `${cur.x},${cur.y}`;
    if (curKey === destKey) { found = true; break; }
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isWalkable(nx, ny)) continue;
      const k = `${nx},${ny}`;
      if (visited.has(k)) continue;
      visited.set(k, curKey);
      queue.push({ x: nx, y: ny });
    }
  }
  if (!found) return [];
  const path: Array<{ x: number; y: number }> = [];
  let k: string | null = destKey;
  while (k && k !== startKey) {
    const [xs, ys] = k.split(',').map(Number);
    path.push({ x: xs, y: ys });
    k = visited.get(k) ?? null;
  }
  return path.reverse();
}

export function findZoneCenter(zone: ZoneDefinition): { x: number; y: number } {
  const [x0, y0, x1, y1] = zone.bounds;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (VILLAGE_MAP[y]?.[x] === 'Z') return { x, y };
    }
  }
  return { x: Math.floor((x0 + x1) / 2), y: Math.floor((y0 + y1) / 2) };
}

export function randomWalkableInZone(zone: ZoneDefinition): { x: number; y: number } {
  const [x0, y0, x1, y1] = zone.bounds;
  const candidates: Array<{ x: number; y: number }> = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (isWalkable(x, y)) candidates.push({ x, y });
    }
  }
  return candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : { x: Math.floor((x0 + x1) / 2), y: Math.floor((y0 + y1) / 2) };
}

export function randomWalkableNear(pos: { x: number; y: number }, range: number): { x: number; y: number } {
  for (let attempt = 0; attempt < 20; attempt++) {
    const dx = Math.floor(Math.random() * (range * 2 + 1)) - range;
    const dy = Math.floor(Math.random() * (range * 2 + 1)) - range;
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    if (isWalkable(nx, ny)) return { x: nx, y: ny };
  }
  return pos;
}
