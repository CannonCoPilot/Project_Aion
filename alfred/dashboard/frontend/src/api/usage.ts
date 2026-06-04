/**
 * Usage API client — token-based, Anthropic session-aware.
 *
 * All data comes exclusively from proxy-captured Anthropic API headers.
 * "Session" = Anthropic's 5h rolling window, NOT a Claude Code session.
 */

import { useQuery } from '@tanstack/react-query';
import { get } from './client';

// ── Types ──

export interface SessionWindow {
  status?: string;
  message?: string;
  unified_status?: string;
  representative_claim?: string;
  five_hour?: {
    status: string;
    utilization: number | null;
    reset_at: string | null;
    reset_seconds: number | null;
  };
  seven_day?: {
    status: string;
    utilization: number | null;
    reset_at: string | null;
    reset_seconds: number | null;
  };
  per_minute_rate_limit?: {
    tokens_limit: number | null;
    tokens_remaining: number | null;
    input_remaining: number | null;
    output_remaining: number | null;
  };
  last_updated?: string;
}

export interface SessionTokens {
  status?: string;
  message?: string;
  window_reset?: string;
  window_first_request?: string;
  utilization?: number;
  tokens_spent?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  request_count?: number;
  rate_limit_tokens_limit?: number | null;
  rate_limit_tokens_remaining?: number | null;
}

export interface SessionSpendDollars {
  status?: string;
  message?: string;
  window_reset?: string;
  window_first_request?: string;
  total_usd?: number;
  request_count?: number;
  projection_to_window_end_usd?: number | null;
  by_model?: Array<{ model: string; cost_usd: number; request_count: number }>;
  by_agent?: Array<{ agent_name: string; cost_usd: number; request_count: number }>;
}

export interface ModelTokens {
  status?: string;
  message?: string;
  window_start?: string;
  models?: Array<{
    model: string;
    request_count: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    total_tokens: number;
  }>;
}

export interface MessageSizes {
  status?: string;
  message?: string;
  window_start?: string;
  max_message_tokens?: number;
  message_count?: number;
  messages?: Array<{
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    total_tokens: number;
    model: string;
    timestamp: string;
  }>;
}

export interface MessageSizesHistoricalBin {
  index: number;
  from: number;
  to: number | null;  // null on the open-ended top bin (>=from)
  label: string;
  count: number;
  q0: number;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
  n_sessions_with_msgs: number;
}

export interface MessageSizesHistorical {
  days?: number;
  computed_at?: string;
  max_message_tokens?: number;
  message_count?: number;
  n_sessions?: number;
  bins?: MessageSizesHistoricalBin[];
}

export interface LoadedModel {
  name: string;
  family: 'ollama' | 'mlx-embed';
  alive: boolean;
  size_vram?: number;
  expires_at?: string;
  embedding_dim?: number;
  uptime_seconds?: number;
}

export interface LoadedModels {
  models?: LoadedModel[];
}

export interface BudgetWindow {
  window_reset: string;
  window_start?: string;
  first_request: string;
  last_request: string;
  request_count: number;
  total_tokens: number;
  final_utilization: number;
  estimated_budget: number;
  confidence_cv_pct: number | null;
  confidence_label: string;
  day_of_week: number;
  day_name: string;
  hour_of_day: number;
}

export interface SessionBudgetHistory {
  windows?: BudgetWindow[];
  total_windows?: number;
}

export interface WindowTransition {
  transition_at: string;
  old_window_reset: string | null;
  new_window_reset: string;
  old_window_final_util: number;
  new_window_first_util: number;
  utilization_drop: number;
  gap_seconds: number;
}

export interface WindowTransitions {
  transitions?: WindowTransition[];
  total_transitions?: number;
}

export interface BurnRatePoint {
  elapsed_seconds: number;
  utilization: number;
  cumulative_tokens: number;
  seq: number;
  model?: string;
}

export interface BurnRateWindow {
  window_reset: string;
  window_open?: string;
  first_observed_util?: number;
  day_of_week: number;
  day_name: string;
  points: BurnRatePoint[];
}

export interface BurnRateCurve {
  windows?: BurnRateWindow[];
  total_windows?: number;
}

export interface CacheEffectiveness {
  status?: string;
  message?: string;
  overall_cache_hit_ratio?: number;
  total_input_tokens?: number;
  total_cache_read_tokens?: number;
  total_cache_write_tokens?: number;
  estimated_savings_factor?: number;
  request_count?: number;
  points?: Array<{
    timestamp: string;
    cache_hit_ratio: number;
    rolling_avg: number;
    model: string;
    input_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
  }>;
}

export interface RejectionEvent {
  timestamp: string;
  model: string;
  unified_status: string;
  five_hour_status: string;
  five_hour_utilization: number;
  seven_day_utilization: number;
  governing_claim: string;
  retry_after_secs: number | null;
  day_of_week: number;
  day_name: string;
  hour_of_day: number;
}

export interface RejectionEvents {
  rejections?: RejectionEvent[];
  near_misses?: Array<{
    timestamp: string;
    utilization: number;
    status: string;
  }>;
  total_rejections?: number;
  total_near_misses?: number;
}

// ── Hooks ──

export function useSessionWindow() {
  return useQuery<SessionWindow>({
    queryKey: ['usage', 'session-window'],
    queryFn: () => get('/usage/session-window'),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

export function useSessionTokens() {
  return useQuery<SessionTokens>({
    queryKey: ['usage', 'session-tokens'],
    queryFn: () => get('/usage/session-tokens'),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

export function useModelTokens() {
  return useQuery<ModelTokens>({
    queryKey: ['usage', 'model-tokens'],
    queryFn: () => get('/usage/model-tokens'),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

export function useMessageSizes() {
  return useQuery<MessageSizes>({
    queryKey: ['usage', 'message-sizes'],
    queryFn: () => get('/usage/message-sizes'),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

// Long-baseline historical message-size distribution. Server caches at 24h,
// so the client refetch interval can be aggressive without reload cost.
export function useMessageSizesHistorical() {
  return useQuery<MessageSizesHistorical>({
    queryKey: ['usage', 'message-sizes-historical'],
    queryFn: () => get('/usage/message-sizes-historical'),
    refetchInterval: 6 * 3600 * 1000,  // refetch every 6h (server still caps at 24h recompute)
    staleTime: 3600 * 1000,
  });
}

// Currently-loaded local models (Ollama + MLX-Embed). Refetch every 30s — Ollama
// auto-unloads on inactivity, so the loaded set is dynamic.
export function useLoadedModels() {
  return useQuery<LoadedModels>({
    queryKey: ['usage', 'loaded-models'],
    queryFn: () => get('/usage/loaded-models'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useSessionBudgetHistory() {
  return useQuery<SessionBudgetHistory>({
    queryKey: ['usage', 'session-budget-history'],
    queryFn: () => get('/usage/session-budget-history'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useSessionSpendDollars() {
  return useQuery<SessionSpendDollars>({
    queryKey: ['usage', 'session-spend-dollars'],
    queryFn: () => get('/usage/session-spend-dollars'),
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
}

export function useWindowTransitions() {
  return useQuery<WindowTransitions>({
    queryKey: ['usage', 'window-transitions'],
    queryFn: () => get('/usage/window-transitions'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useBurnRateCurve() {
  return useQuery<BurnRateCurve>({
    queryKey: ['usage', 'burn-rate-curve'],
    queryFn: () => get('/usage/burn-rate-curve'),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useCacheEffectiveness() {
  return useQuery<CacheEffectiveness>({
    queryKey: ['usage', 'cache-effectiveness'],
    queryFn: () => get('/usage/cache-effectiveness'),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useRejectionEvents() {
  return useQuery<RejectionEvents>({
    queryKey: ['usage', 'rejection-events'],
    queryFn: () => get('/usage/rejection-events'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
