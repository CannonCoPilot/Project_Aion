import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface SessionInfo {
  authenticated: boolean;
  username: string | null;
  email: string | null;
  uid: string | null;
  groups: string[];
  issuedAt: number | null;
  expiresAt: number | null;
  authProvider: string;
  logoutUrl: string;
}

export interface ClaudeStatus {
  status: 'authenticated' | 'not_authenticated' | 'not_installed' | 'unknown';
  version: string | null;
  model?: string | null;
  pingCostUsd?: number;
  error?: string;
  checkedAt?: number;
  staleMinutes?: number | null;
  source?: string;
}

export function useSession() {
  return useQuery<SessionInfo>({
    queryKey: ['auth-session'],
    queryFn: () => get<SessionInfo>('/auth/session'),
    refetchInterval: 300_000,
    staleTime: 60_000,
  });
}

export function useClaudeStatus() {
  return useQuery<ClaudeStatus>({
    queryKey: ['claude-status'],
    queryFn: () => get<ClaudeStatus>('/auth/claude-status'),
    staleTime: 120_000,
    refetchInterval: 600_000,
  });
}
