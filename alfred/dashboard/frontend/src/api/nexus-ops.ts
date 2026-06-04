import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, put, post } from './client';

// --- Types ---

export type EventSource = 'tasks' | 'nexus_db' | 'task_reviewer' | 'execution' | 'relay' | 'dispatcher';
export type EventCategory = 'task' | 'job' | 'decision' | 'notification' | 'system';

export interface NexusOpsEvent {
  id: string;
  timestamp: string;
  type: string;
  source: EventSource;
  category: EventCategory;
  task_id?: string;
  job?: string;
  persona?: string;
  project?: string;
  summary: string;
  details?: Record<string, unknown>;
  cost?: number;
  duration?: number;
  tokens?: { input: number; output: number };
  severity?: 'info' | 'warn' | 'error' | 'critical';
}

export interface TimelineStats {
  totalEvents: number;
  totalCost: number;
  activeJobs: number;
  tasksProgressed: number;
  bySource: Record<EventSource, number>;
  byCategory: Record<EventCategory, number>;
}

export interface TaskStatusInfo {
  status: string;
  labels: string[];
  title: string;
}

export interface TimelineResponse {
  events: NexusOpsEvent[];
  total: number;
  taskStatuses: Record<string, TaskStatusInfo>;
  stats: TimelineStats;
}

export interface TimelineFilters {
  from?: string;
  to?: string;
  task_id?: string;
  job?: string;
  persona?: string;
  project?: string;
  source?: EventSource;
  category?: EventCategory;
  limit?: number;
  offset?: number;
}

// --- Phase 2 Types ---

export interface TaskJourneyStage {
  name: string;
  completed: boolean;
  timestamp?: string;
  duration?: number;
  cost?: number;
  events: NexusOpsEvent[];
  actor?: string;
}

export interface TaskJourney {
  task: {
    id: string;
    title: string;
    status: string;
    labels: string[];
    priority: number;
    created: string;
  };
  stages: TaskJourneyStage[];
  currentStage: string | null;
  totalCost: number;
  totalDuration: number;
  relatedJobs: string[];
  decisions: {
    action: string;
    confidence?: number;
    risk?: string;
    feedback?: string;
    timestamp: string;
  }[];
}

export interface JobRun {
  timestamp: string;
  status: 'completed' | 'failed';
  cost?: number;
  duration?: number;
  tokens?: { input: number; output: number };
  tasksProcessed: string[];
}

export interface JobDetail {
  job: {
    name: string;
    description?: string;
    persona?: string;
    schedule?: string;
    enabled?: boolean;
  };
  recentRuns: JobRun[];
  stats: {
    totalRuns: number;
    successRate: number;
    avgCost: number;
    avgDuration: number;
    totalCost: number;
  };
}

// --- Hooks ---

export function useTimeline(filters: TimelineFilters) {
  return useQuery({
    queryKey: ['nexus-ops-timeline', filters],
    queryFn: () =>
      get<TimelineResponse>('/nexus-ops/timeline', {
        from: filters.from,
        to: filters.to,
        task_id: filters.task_id,
        job: filters.job,
        persona: filters.persona,
        project: filters.project,
        source: filters.source,
        category: filters.category,
        limit: filters.limit ? String(filters.limit) : undefined,
        offset: filters.offset ? String(filters.offset) : undefined,
      }),
    refetchInterval: 30_000,
  });
}

export function useTaskJourney(taskId: string | null) {
  return useQuery({
    queryKey: ['nexus-ops-task-journey', taskId],
    queryFn: () => get<TaskJourney>(`/nexus-ops/task-journey/${taskId}`),
    enabled: !!taskId,
  });
}

export function useJobDetail(jobName: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ['nexus-ops-job-detail', jobName, from, to],
    queryFn: () => get<JobDetail>(`/nexus-ops/job-detail/${jobName}`, { from, to }),
    enabled: !!jobName,
  });
}

// --- Analytics Types ---

export interface AnalyticsResponse {
  cost: {
    today: number;
    weekTotal: number;
    trend: { date: string; cost: number; execution: number; nexus: number }[];
    byJob: { job: string; cost: number; runs: number }[];
    byPersona: { persona: string; cost: number }[];
  };
  performance: {
    byJob: {
      job: string;
      avgDuration: number;
      successRate: number;
      totalRuns: number;
      totalCost: number;
    }[];
  };
  approvalSLA: {
    avgTimeToFeedback: number;
    staleProposals: number;
    feedbackBreakdown: { agreed: number; wrong: number; adjust: number };
  };
  taskReviewerAccuracy: {
    trend: { date: string; accuracy: number; total: number }[];
    byAction: { action: string; accuracy: number; count: number }[];
  };
}

export function useAnalytics(from?: string, to?: string) {
  return useQuery({
    queryKey: ['nexus-ops-analytics', from, to],
    queryFn: () => get<AnalyticsResponse>('/nexus-ops/analytics', { from, to }),
    enabled: !!from,
    refetchInterval: 60_000,
  });
}

// --- Graph Types ---

export interface GraphNode {
  [key: string]: unknown;
  id: string;
  type: 'task' | 'job' | 'persona' | 'project' | 'event';
  label: string;
  status: 'running' | 'completed' | 'failed' | 'waiting' | 'idle';
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'triggered' | 'processed_by' | 'produced' | 'approved' | 'escalated' | 'feedback';
  label?: string;
  animated?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: { id: string; label: string; nodeIds: string[] }[];
}

export function useGraph(
  from?: string,
  to?: string,
  filters?: { project?: string; job?: string; persona?: string },
) {
  return useQuery({
    queryKey: ['nexus-ops-graph', from, to, filters],
    queryFn: () =>
      get<GraphData>('/nexus-ops/graph', {
        from,
        to,
        project: filters?.project,
        job: filters?.job,
        persona: filters?.persona,
      }),
    enabled: !!from,
    refetchInterval: 30_000,
  });
}

// --- Pipeline DAG Types ---

export interface PipelineTransition {
  from: string;
  to: string;
  timestamp: string;
  actor?: string;
  outcome?: string;
}

export interface PipelineDAGTask {
  id: string;
  title: string;
  status: string;
  currentStage: string | null;
  priority: number;
  labels: string[];
  stageEnteredAt: string | null;
  transitions: PipelineTransition[];
  decision?: {
    action: string;
    confidence?: number;
    risk?: string;
  };
}

export interface PipelineFlowEdge {
  from: string;
  to: string;
  count: number;
}

export interface StageAggregate {
  stage: string;
  count: number;
  avgDurationSecs: number;
  medianDurationSecs: number;
  p90DurationSecs: number;
  maxDurationSecs: number;
  completedTransitions: number;
  throughputPerDay: number;
}

export interface PipelineDAGResponse {
  tasks: PipelineDAGTask[];
  stageAggregates: StageAggregate[];
  flowEdges: PipelineFlowEdge[];
  timestamp: string;
}

export function usePipelineDAG() {
  return useQuery({
    queryKey: ['nexus-ops-pipeline-dag'],
    queryFn: () => get<PipelineDAGResponse>('/nexus-ops/pipeline-dag'),
    refetchInterval: 30_000,
  });
}

// --- Alert Types ---

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  threshold: number;
  severity: 'info' | 'warn' | 'error' | 'critical';
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warn' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  context: Record<string, unknown>;
  acknowledged: boolean;
}

export interface AlertsResponse {
  alerts: Alert[];
  rules: AlertRule[];
}

// --- Alert Hooks ---

export function useAlerts() {
  return useQuery({
    queryKey: ['nexus-ops-alerts'],
    queryFn: () => get<AlertsResponse>('/nexus-ops/alerts'),
    refetchInterval: 60_000,
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rule: AlertRule) => put<AlertRule>(`/nexus-ops/alerts/rules/${rule.id}`, rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nexus-ops-alerts'] });
    },
  });
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (alertId: string) => post<void>(`/nexus-ops/alerts/${alertId}/acknowledge`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nexus-ops-alerts'] });
    },
  });
}
