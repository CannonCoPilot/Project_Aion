import { useQuery } from '@tanstack/react-query';
import { get } from './client.js';

export interface TimelinePoint { ts: number; tokens: number; source: string }
export interface TimelineEvent { ts: number; type: string; label: string; tokens_before?: number; checkpoint_bytes?: number; duration_s?: number }
export interface ContextTimelineResponse {
  points: TimelinePoint[];
  events: TimelineEvent[];
  thresholds: { soft: number; hard: number; window: number };
}

export interface RagCollection { name: string; points_count: number; indexed_count: number; status: string; dimensions: number }
export interface RagCollectionsResponse {
  collections: RagCollection[];
  total_points: number;
  qdrant_up: boolean;
}

export interface CompressionEffectivenessResponse {
  efficiency_pct: number;
  components: { preservation: number; stage1_reduction: number; dedup: number };
  stats: { total_compressions: number; avg_duration_s: number; avg_checkpoint_bytes: number; total_tokens_processed: number; cumulative_tokens_saved: number };
}

export interface LayerHealthBucket { ts: number; layers: Record<string, string> }
export interface LayerHealthHistoryResponse { buckets: LayerHealthBucket[] }

export interface GraphitiStats { entities: number; episodes: number; edges: number; communities: number }
export interface GraphitiEntity { name: string; summary: string; edge_count: number }
export interface GraphitiEpisode { name: string; created_at: string }
export interface GraphitiGraph { nodes: { id: string; name: string }[]; edges: { source: string; target: string; name: string }[] }
export interface GraphitiOverviewResponse {
  stats: GraphitiStats;
  top_entities: GraphitiEntity[];
  recent_episodes: GraphitiEpisode[];
  sample_graph: GraphitiGraph;
}

export function useContextTimeline(hours = 168) {
  return useQuery({
    queryKey: ['jarvis-context-timeline', hours],
    queryFn: () => get<ContextTimelineResponse>('/jarvis/context-timeline', { hours: String(hours) }),
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useRagCollections() {
  return useQuery({
    queryKey: ['jarvis-rag-collections'],
    queryFn: () => get<RagCollectionsResponse>('/jarvis/rag-collections'),
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useCompressionEffectiveness() {
  return useQuery({
    queryKey: ['jarvis-compression-effectiveness'],
    queryFn: () => get<CompressionEffectivenessResponse>('/jarvis/compression-effectiveness'),
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useLayerHealthHistory(hours = 72) {
  return useQuery({
    queryKey: ['jarvis-layer-health-history', hours],
    queryFn: () => get<LayerHealthHistoryResponse>('/jarvis/layer-health-history', { hours: String(hours) }),
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function useGraphitiOverview(sample = 30) {
  return useQuery({
    queryKey: ['jarvis-graphiti-overview', sample],
    queryFn: () => get<GraphitiOverviewResponse>('/jarvis/graphiti-overview', { sample: String(sample) }),
    refetchInterval: 60_000,
    retry: 1,
  });
}
