import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface DocGuardRule {
  name: string;
  pattern: string;
  tier: 'critical' | 'high' | 'medium' | 'low';
  checks: string[];
  message?: string;
  purpose?: string;
  protectedSections?: string[];
  protectedKeys?: string[];
  lockedFields?: string[];
  project?: string;
}

export interface DocGuardSettings {
  enabled: boolean;
  v1: { enabled: boolean; credentialScan: boolean; structuralChecks: boolean };
  v2: { enabled: boolean; model: string; timeout: number };
  failMode: string;
  overrideTTL: number;
  maxViolationsShown: number;
}

export interface DocGuardGeneral {
  name: string;
  check: string;
  action: string;
}

export interface CredentialPattern {
  name: string;
  pattern: string;
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  file: string;
  violations?: { check: string; tier?: string; message: string }[];
  rules?: string[];
  project?: string;
}

export interface DocGuardStats {
  enabled: boolean;
  failMode: string;
  rulesByTier: Record<string, number>;
  totalRules: number;
  logStats: {
    blocks: number;
    warnings: number;
    overrides: number;
    total: number;
    lastEvent: string | null;
  };
}

interface RulesResponse {
  settings: DocGuardSettings;
  general: DocGuardGeneral[];
  rules: DocGuardRule[];
  credentialPatterns: CredentialPattern[];
}

interface LogResponse {
  entries: AuditEntry[];
  total: number;
}

export function useDocGuardRules() {
  return useQuery({
    queryKey: ['document-guard', 'rules'],
    queryFn: () => get<RulesResponse>('/document-guard/rules'),
    refetchInterval: 60_000,
  });
}

export function useDocGuardLog(limit = 50, action?: string, project?: string) {
  return useQuery({
    queryKey: ['document-guard', 'log', limit, action, project],
    queryFn: () =>
      get<LogResponse>('/document-guard/log', {
        limit: String(limit),
        action,
        project,
      }),
    refetchInterval: 30_000,
  });
}

export function useDocGuardStats() {
  return useQuery({
    queryKey: ['document-guard', 'stats'],
    queryFn: () => get<DocGuardStats>('/document-guard/stats'),
    refetchInterval: 60_000,
  });
}
