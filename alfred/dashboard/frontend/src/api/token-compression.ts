import { useQuery } from '@tanstack/react-query';
import { get } from './client.js';

export interface CompressionStats {
  total_tokens_saved: number;
  compression_rate: number; // 0-1 float representing average compression ratio
  total_events: number;
  avg_reduction: number; // average tokens saved per event
  sessions_compressed: number;
  last_compressed_at: number | null; // epoch ms
}

export interface CompressionEvent {
  id: string;
  session_id: string;
  phase: string;
  tokens_before: number;
  tokens_after: number;
  tokens_saved: number;
  compression_ratio: number; // 0-1 float
  triggered_at: number; // epoch ms
  status: 'success' | 'partial' | 'failed';
}

export interface CompressionPhase {
  phase: string;
  count: number;
  total_saved: number;
  avg_ratio: number; // 0-1 float
  last_run: number | null; // epoch ms
}

export function useCompressionStats() {
  return useQuery({
    queryKey: ['compression-stats'],
    queryFn: () => get<CompressionStats>('/token-compression/stats'),
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useCompressionEvents(limit = 50) {
  return useQuery({
    queryKey: ['compression-events', limit],
    queryFn: () =>
      get<CompressionEvent[]>('/token-compression/events', { limit: String(limit) }),
    refetchInterval: 15_000,
    retry: 1,
  });
}

export function useCompressionPhases() {
  return useQuery({
    queryKey: ['compression-phases'],
    queryFn: () => get<CompressionPhase[]>('/token-compression/phases'),
    refetchInterval: 15_000,
    retry: 1,
  });
}
