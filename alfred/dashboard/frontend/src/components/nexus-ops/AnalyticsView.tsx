import { useAnalytics } from '../../api/nexus-ops';
import { CostDashboard } from './analytics/CostDashboard';
import { PerformanceChart } from './analytics/PerformanceChart';
import { ApprovalSLA } from './analytics/ApprovalSLA';
import { AccuracyTrend } from './analytics/AccuracyTrend';
import { StageMetricsPanel } from './analytics/StageMetricsPanel';

interface Props {
  from?: string;
  to?: string;
}

export function AnalyticsView({ from, to }: Props) {
  const { data, isLoading, isError } = useAnalytics(from, to);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-8 text-center text-sm text-faint">
        Loading analytics...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        Failed to load analytics data.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-8 text-center text-sm text-faint">
        No analytics data available for the selected range.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Full width: Stage Health Metrics */}
      <StageMetricsPanel />

      {/* Full width: Cost Dashboard */}
      <CostDashboard cost={data.cost} />

      {/* Two column: Performance + Approval SLA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PerformanceChart performance={data.performance} />
        <ApprovalSLA sla={data.approvalSLA} />
      </div>

      {/* Full width: Accuracy Trend */}
      <AccuracyTrend accuracy={data.taskReviewerAccuracy} />
    </div>
  );
}
