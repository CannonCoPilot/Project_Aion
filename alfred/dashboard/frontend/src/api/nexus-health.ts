import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface PersonaModelRow {
  persona: string;
  currentModel: string;
  routerOverridden: boolean;
  runs: number;
  totalCost: number;
  avgCost: number;
  avgDurationS: number;
  successRate: number;
  lastRunTs: string;
  modelsUsed: Record<string, number>;
}

export interface NexusHealthResponse {
  windowHours: number;
  personas: PersonaModelRow[];
  summary: {
    totalRuns: number;
    totalCost: number;
    avgCostPerJob: number;
    modelMix: Record<string, number>;
    failedRuns: number;
  };
  lastRunTs: string | null;
  lastUpdated: string;
}

export function useNexusHealth(hours = 6) {
  return useQuery({
    queryKey: ['nexus-health', 'models', hours],
    queryFn: () => get<NexusHealthResponse>('/nexus-health/models', { hours: String(hours) }),
    refetchInterval: 60000,
  });
}
