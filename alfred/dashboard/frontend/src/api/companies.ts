import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface CompanyBudget {
  soft_limit_usd: number;
  throttle_at_usd: number;
  hard_limit_usd: number;
  period: string;
}

export interface CompanyObjective {
  id: string;
  description: string;
  quarter: string;
}

export interface Company {
  slug: string;
  name: string;
  mission: string;
  tags: string[];
  objectives: CompanyObjective[];
  agents: string[];
  jobs: string[];
  projects: string[];
  context_paths: string[];
  budget: CompanyBudget;
}

export interface CompanyCost {
  slug: string;
  name: string;
  spend: number;
  budget: CompanyBudget;
  tier: 'ok' | 'warning' | 'throttled' | 'exceeded';
  jobBreakdown: { job: string; cost: number; runs: number }[];
}

export interface CompanyCostsResponse {
  companies: CompanyCost[];
  totalSpend: number;
  orgBudget: { hard_limit_usd: number; period: string };
  period: { from: string; to: string };
}

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: () =>
      get<{
        companies: Company[];
        org: { name: string; globalBudget: { hard_limit_usd: number; period: string } };
      }>('/companies'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useCompanyCosts(from?: string, to?: string) {
  return useQuery({
    queryKey: ['company-costs', from, to],
    queryFn: () => get<CompanyCostsResponse>('/costs/by-company', { from, to }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
