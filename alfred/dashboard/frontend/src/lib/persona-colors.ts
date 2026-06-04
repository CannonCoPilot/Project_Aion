import { CLUSTERS, resolveCluster, type ClusterId } from './persona-clusters';
import type { PersonaSummary } from '../api/personas';

export function colorFor(p: PersonaSummary | undefined): string {
  if (!p) return '#71717a';
  if (p.tier === 'A' || p.tier === 'B') return '#52525b';
  if (p.tier === 'C') return '#9333ea';
  const c = resolveCluster(p.name, p.cluster);
  if (c) return CLUSTERS[c as ClusterId].hex;
  return '#0ea5e9';
}

const CLUSTER_CHAR_MAP: Record<string, number> = {
  engineering: 0,
  quality: 1,
  research: 2,
  creative: 3,
  planner: 4,
  internal: 5,
};

const CLUSTER_HUE_OFFSETS: number[] = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

export function spriteForPersona(name: string, cluster: string | null): {
  charIndex: number;
  hueRotate: number;
} {
  const c = resolveCluster(name, cluster);
  const charIndex = c ? (CLUSTER_CHAR_MAP[c] ?? 0) : 0;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hueRotate = CLUSTER_HUE_OFFSETS[Math.abs(hash) % CLUSTER_HUE_OFFSETS.length];
  return { charIndex, hueRotate };
}
