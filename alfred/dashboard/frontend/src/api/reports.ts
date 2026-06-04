import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export interface WorkEvent {
  id: number;
  timestamp: string;
  agent: string; // nexus, interactive, aurora
  actor: string; // task-reviewer, task-executor, infra-deployer, researcher, david, aurora-action
  actor_type: string; // ai-persona, automated-job, human, hybrid
  action: string; // completed, approved, deferred, escalated, proposed, parked, failed, skipped
  task_id: string | null;
  task_title: string | null;
  domain: string | null;
  project: string | null;
  summary: string | null;
  value_description: string | null;
  value_rating: string | null; // high, medium, low
  quantitative: string | null;
  confidence: number | null;
  stage_from: string | null;
  stage_to: string | null;
  source_file: string | null;
  ingested_at: string;
}

export interface WorkEventsSummary {
  total_events: number;
  by_action: Record<string, number>;
  by_agent: Record<string, number>;
  by_actor: Record<string, number>;
  by_domain: Record<string, number>;
  by_project: Record<string, number>;
  by_actor_type: Record<string, number>;
  value_breakdown: { high: number; medium: number; low: number; unrated: number };
}

export interface ChartDataPoint {
  label: string;
  value: number;
  group?: string;
}

export interface ReportFilters {
  from: string;
  to: string;
  agent?: string;
  actor?: string;
  actor_type?: string;
  action?: string;
  domain?: string;
  project?: string;
  value_rating?: string;
  search?: string;
}

/** Convert ReportFilters to query params object, omitting undefined values */
function filtersToParams(filters: ReportFilters): Record<string, string | undefined> {
  return {
    from: filters.from,
    to: filters.to,
    agent: filters.agent,
    actor: filters.actor,
    actor_type: filters.actor_type,
    action: filters.action,
    domain: filters.domain,
    project: filters.project,
    value_rating: filters.value_rating,
    search: filters.search,
  };
}

export function useReportEvents(filters: ReportFilters & { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ['report-events', filters],
    queryFn: () =>
      get<{ events: WorkEvent[]; total: number }>('/reports/events', {
        ...filtersToParams(filters),
        limit: String(filters.limit ?? 50),
        offset: String(filters.offset ?? 0),
      }),
  });
}

export function useReportSummary(filters: ReportFilters) {
  return useQuery({
    queryKey: ['report-summary', filters],
    queryFn: () => get<WorkEventsSummary>('/reports/summary', filtersToParams(filters)),
  });
}

export function useReportCharts(filters: ReportFilters, groupBy: string) {
  return useQuery({
    queryKey: ['report-charts', filters, groupBy],
    queryFn: () =>
      get<ChartDataPoint[]>('/reports/charts', {
        ...filtersToParams(filters),
        group_by: groupBy,
      }),
  });
}
