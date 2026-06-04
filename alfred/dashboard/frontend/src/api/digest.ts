import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface DigestEntry {
  task: {
    id: string;
    title: string;
    priority: number;
    status: string;
    labels: string[];
    external_ref?: string;
  };
  closedAt: string | null;
  closeReason: string | null;
  actor: string;
  events: { type: string; comment?: string; timestamp: string }[];
  project: string | null;
  domain: string | null;
  pipelineStages: string[];
  executionResult?: string | null;
}

export interface DigestSummary {
  dateRange: { from: string; to: string };
  totalCompleted: number;
  totalCreated: number;
  totalInProgress: number;
  byProject: Record<string, number>;
  byDomain: Record<string, number>;
  byActor: Record<string, number>;
  entries: DigestEntry[];
}

export function useDigest(params: {
  from: string;
  to: string;
  project?: string;
  domain?: string;
  actor?: string;
  status?: string;
}) {
  const query: Record<string, string> = { from: params.from, to: params.to };
  if (params.project) query.project = params.project;
  if (params.domain) query.domain = params.domain;
  if (params.actor) query.actor = params.actor;
  if (params.status) query.status = params.status;

  return useQuery({
    queryKey: ['digest', query],
    queryFn: () => get<DigestSummary>('/digest', query),
  });
}
