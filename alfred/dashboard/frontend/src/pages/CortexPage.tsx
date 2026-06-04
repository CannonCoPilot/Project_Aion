import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Header } from '../components/layout/Header';
import {
  useStaleness,
  useTrainingStats,
  useVelocity,
  useRecommendations,
  useRecommendationHistory,
  postRecommendationAction,
  triggerCortexRun,
  type StalenessFile,
  type Recommendation,
  type RecommendationAction,
} from '../api/cortex';
import { usePatternStats, useFeedbackSummary } from '../api/patterns';

type TabKey = 'freshness' | 'training' | 'patterns' | 'recommendations';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'freshness', label: 'Knowledge Freshness' },
  { key: 'training', label: 'Training Pipeline' },
  { key: 'patterns', label: 'Pattern Health' },
  { key: 'recommendations', label: 'Recommendations' },
];

// --- Helpers ---

function tierColor(tier: string): string {
  switch (tier) {
    case 'fresh':
      return 'text-green-400';
    case 'aging':
      return 'text-blue-400';
    case 'stale':
      return 'text-amber-400';
    case 'critical':
      return 'text-red-400';
    default:
      return 'text-muted';
  }
}

function tierBg(tier: string): string {
  switch (tier) {
    case 'fresh':
      return 'bg-green-500/10';
    case 'aging':
      return 'bg-blue-500/10';
    case 'stale':
      return 'bg-amber-500/10';
    case 'critical':
      return 'bg-red-500/10';
    default:
      return 'bg-surface-2';
  }
}

function categoryIcon(cat: string): string {
  switch (cat) {
    case 'context':
      return '\u2139';
    case 'project':
      return '\u29BF';
    case 'persona':
      return '\u2691';
    case 'skill':
      return '\u2699';
    case 'memory':
      return '\u25C8';
    case 'patterns':
      return '\u2605';
    default:
      return '\u2022';
  }
}

function formatTimeAgo(ts: string | null): string {
  if (!ts) return 'never';
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((n / total) * 100)}%`;
}

// --- Summary Cards ---

function StatCard({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
      <p className={`text-2xl font-bold ${color || 'text-secondary'}`}>{value}</p>
      <p className="text-xs text-faint mt-0.5">{label}</p>
    </div>
  );
}

// --- Tab: Knowledge Freshness ---

function FreshnessTab() {
  const { data, isLoading, isError } = useStaleness();
  const velocity = useVelocity();

  if (isLoading)
    return <div className="text-faint py-8 text-center">Loading staleness data...</div>;
  if (isError || !data)
    return <div className="text-red-400 py-8 text-center">Failed to load staleness data.</div>;

  const { files, summary } = data;
  const categories = [...new Set(files.map((f) => f.category))].sort();

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard value={summary.total} label="Total Files" />
        <StatCard value={summary.fresh} label="Fresh (<7d)" color="text-green-400" />
        <StatCard value={summary.aging} label="Aging (7-30d)" color="text-blue-400" />
        <StatCard value={summary.stale} label="Stale (30-90d)" color="text-amber-400" />
        <StatCard value={summary.critical} label="Critical (>90d)" color="text-red-400" />
      </div>

      {/* Velocity mini-cards */}
      {velocity.data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
            <p className="text-lg font-bold text-secondary">
              {velocity.data.contextRefreshes.last7d}
            </p>
            <p className="text-xs text-faint">Context files updated (7d)</p>
          </div>
          <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
            <p className="text-lg font-bold text-secondary">
              {velocity.data.trainingCaptures.thisWeek}
            </p>
            <p className="text-xs text-faint">
              Captures this week
              {velocity.data.trainingCaptures.trend !== 0 && (
                <span
                  className={
                    velocity.data.trainingCaptures.trend > 0 ? 'text-green-400' : 'text-red-400'
                  }
                >
                  {' '}
                  ({velocity.data.trainingCaptures.trend > 0 ? '+' : ''}
                  {velocity.data.trainingCaptures.trend}%)
                </span>
              )}
            </p>
          </div>
          <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
            <p className="text-lg font-bold text-secondary">
              {velocity.data.patternsLastModified
                ? formatTimeAgo(velocity.data.patternsLastModified)
                : 'never'}
            </p>
            <p className="text-xs text-faint">Patterns last updated</p>
          </div>
        </div>
      )}

      {/* File table grouped by category */}
      {categories.map((cat) => {
        const catFiles = files.filter((f) => f.category === cat);
        const criticalCount = catFiles.filter((f) => f.stalenessTier === 'critical').length;
        return (
          <div key={cat} className="rounded-lg border border-default overflow-hidden">
            <div className="bg-surface-1 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">{categoryIcon(cat)}</span>
                <span className="text-sm font-semibold text-secondary capitalize">{cat}</span>
                <span className="text-xs text-faint">({catFiles.length})</span>
              </div>
              {criticalCount > 0 && (
                <span className="text-xs text-red-400 font-medium">{criticalCount} critical</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default/50">
                    <th className="text-left px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium">
                      File
                    </th>
                    <th className="text-left px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium w-24">
                      Age
                    </th>
                    <th className="text-left px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium w-24">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default/30">
                  {catFiles.map((file) => (
                    <FileRow key={file.path} file={file} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FileRow({ file }: { file: StalenessFile }) {
  return (
    <tr className="hover:bg-surface-1/50 transition-colors">
      <td
        className="px-4 py-1.5 text-muted font-mono text-xs truncate max-w-[400px]"
        title={file.path}
      >
        {file.path}
      </td>
      <td className="px-4 py-1.5 text-xs text-faint">{file.ageInDays}d</td>
      <td className="px-4 py-1.5">
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${tierBg(file.stalenessTier)} ${tierColor(file.stalenessTier)}`}
        >
          {file.stalenessTier}
        </span>
      </td>
    </tr>
  );
}

// --- Tab: Training Pipeline ---

function TrainingTab() {
  const { data, isLoading, isError } = useTrainingStats();

  if (isLoading)
    return <div className="text-faint py-8 text-center">Loading training stats...</div>;
  if (isError || !data)
    return <div className="text-red-400 py-8 text-center">Failed to load training stats.</div>;

  const { totalCaptures, capturesPerDay, byPersona, byModel, byRecordType, dataHealth } = data;
  const personaEntries = Object.entries(byPersona).sort((a, b) => b[1] - a[1]);
  const modelEntries = Object.entries(byModel).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={totalCaptures} label={`Total Captures (${data.days}d)`} />
        <StatCard
          value={
            capturesPerDay.length > 0 ? (capturesPerDay[capturesPerDay.length - 1]?.count ?? 0) : 0
          }
          label="Captures Today"
        />
        <StatCard
          value={byRecordType['execution'] || 0}
          label="Successful"
          color="text-green-400"
        />
        <StatCard value={byRecordType['failure'] || 0} label="Failures" color="text-red-400" />
      </div>

      {/* Data health callout */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
        <h4 className="text-sm font-semibold text-amber-400 mb-2">Pipeline Data Health</h4>
        <p className="text-xs text-muted mb-2">
          These metrics show what % of training captures have enriched fields populated. Low numbers
          indicate the capture pipeline needs upstream fixes.
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p
              className={`text-lg font-bold ${dataHealth.personaDataPopulated > 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {pct(dataHealth.personaDataPopulated, dataHealth.totalRecords)}
            </p>
            <p className="text-xs text-faint">persona_data populated</p>
          </div>
          <div>
            <p
              className={`text-lg font-bold ${dataHealth.humanFeedbackPopulated > 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {pct(dataHealth.humanFeedbackPopulated, dataHealth.totalRecords)}
            </p>
            <p className="text-xs text-faint">human_feedback populated</p>
          </div>
          <div>
            <p
              className={`text-lg font-bold ${dataHealth.taskIdsPopulated > 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {pct(dataHealth.taskIdsPopulated, dataHealth.totalRecords)}
            </p>
            <p className="text-xs text-faint">task_ids populated</p>
          </div>
        </div>
      </div>

      {/* Captures per day sparkline (text-based) */}
      {capturesPerDay.length > 0 && (
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
          <h4 className="text-sm font-semibold text-secondary mb-2">Captures / Day</h4>
          <div className="flex items-end gap-1 h-16">
            {capturesPerDay.map((d) => {
              const max = Math.max(...capturesPerDay.map((x) => x.count));
              const height = max > 0 ? Math.max(4, (d.count / max) * 64) : 4;
              return (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center gap-0.5"
                  title={`${d.date}: ${d.count}`}
                >
                  <div
                    className="w-full rounded-t bg-accent/40 hover:bg-accent/60 transition-colors"
                    style={{ height: `${height}px` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-disabled">{capturesPerDay[0]?.date}</span>
            <span className="text-xs text-disabled">
              {capturesPerDay[capturesPerDay.length - 1]?.date}
            </span>
          </div>
        </div>
      )}

      {/* Per-persona and per-model tables side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-default overflow-hidden">
          <div className="bg-surface-1 px-4 py-2">
            <span className="text-sm font-semibold text-secondary">By Persona</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-default/30">
              {personaEntries.map(([persona, count]) => (
                <tr key={persona} className="hover:bg-surface-1/50">
                  <td className="px-4 py-1.5 text-muted">{persona}</td>
                  <td className="px-4 py-1.5 text-secondary text-right font-mono">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-default overflow-hidden">
          <div className="bg-surface-1 px-4 py-2">
            <span className="text-sm font-semibold text-secondary">By Model</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-default/30">
              {modelEntries.map(([model, count]) => (
                <tr key={model} className="hover:bg-surface-1/50">
                  <td className="px-4 py-1.5 text-muted">{model}</td>
                  <td className="px-4 py-1.5 text-secondary text-right font-mono">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Tab: Pattern Health ---

function PatternsTab() {
  const { data: statsData, isLoading: statsLoading } = usePatternStats();
  const { data: feedbackData, isLoading: feedbackLoading } = useFeedbackSummary();

  if (statsLoading || feedbackLoading) {
    return <div className="text-faint py-8 text-center">Loading pattern data...</div>;
  }

  const stats = statsData?.stats || [];
  const totalHits = stats.reduce((sum, s) => sum + s.hit_count, 0);
  const zeroHitPatterns = stats.filter((s) => s.hit_count === 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={stats.length} label="Total Patterns" />
        <StatCard value={totalHits} label="Total Hits (30d)" />
        <StatCard
          value={zeroHitPatterns.length}
          label="Zero-Hit Patterns"
          color={zeroHitPatterns.length > 0 ? 'text-amber-400' : 'text-green-400'}
        />
        {feedbackData && (
          <StatCard
            value={`${feedbackData.total_agreed}/${feedbackData.total_adjusted}/${feedbackData.total_wrong}`}
            label="Agreed / Adjusted / Wrong"
          />
        )}
      </div>

      {/* Feedback summary */}
      {feedbackData && (
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
          <h4 className="text-sm font-semibold text-secondary mb-2">Feedback Distribution</h4>
          <div className="flex gap-1 h-6 rounded overflow-hidden">
            {(() => {
              const total =
                feedbackData.total_agreed + feedbackData.total_adjusted + feedbackData.total_wrong;
              if (total === 0) return <div className="flex-1 bg-surface-2" />;
              return (
                <>
                  <div
                    className="bg-green-500/60 transition-all"
                    style={{ width: `${(feedbackData.total_agreed / total) * 100}%` }}
                    title={`Agreed: ${feedbackData.total_agreed}`}
                  />
                  <div
                    className="bg-amber-500/60 transition-all"
                    style={{ width: `${(feedbackData.total_adjusted / total) * 100}%` }}
                    title={`Adjusted: ${feedbackData.total_adjusted}`}
                  />
                  <div
                    className="bg-red-500/60 transition-all"
                    style={{ width: `${(feedbackData.total_wrong / total) * 100}%` }}
                    title={`Wrong: ${feedbackData.total_wrong}`}
                  />
                </>
              );
            })()}
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-faint">
            <span>Agreed: {feedbackData.total_agreed}</span>
            <span>Adjusted: {feedbackData.total_adjusted}</span>
            <span>Wrong: {feedbackData.total_wrong}</span>
          </div>
          {feedbackData.last_feedback_date && (
            <p className="text-xs text-disabled mt-1">
              Last feedback: {formatTimeAgo(feedbackData.last_feedback_date)}
            </p>
          )}
        </div>
      )}

      {/* Pattern hit rate table */}
      <div className="rounded-lg border border-default overflow-hidden">
        <div className="bg-surface-1 px-4 py-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-secondary">Pattern Hit Rates (30d)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default/50">
                <th className="text-left px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium">
                  Pattern
                </th>
                <th className="text-right px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium w-20">
                  Hits
                </th>
                <th className="text-right px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium w-20">
                  Agreed
                </th>
                <th className="text-right px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium w-20">
                  Adj.
                </th>
                <th className="text-right px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium w-20">
                  Wrong
                </th>
                <th className="text-left px-4 py-2 text-xs text-faint uppercase tracking-wider font-medium w-28">
                  Last Fired
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default/30">
              {stats
                .sort((a, b) => b.hit_count - a.hit_count)
                .map((s) => (
                  <tr
                    key={s.pattern_name}
                    className={`hover:bg-surface-1/50 ${s.hit_count === 0 ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-1.5 text-muted">{s.pattern_name}</td>
                    <td className="px-4 py-1.5 text-secondary text-right font-mono">
                      {s.hit_count}
                    </td>
                    <td className="px-4 py-1.5 text-green-400 text-right font-mono">
                      {s.agreed_count}
                    </td>
                    <td className="px-4 py-1.5 text-amber-400 text-right font-mono">
                      {s.adjust_count}
                    </td>
                    <td className="px-4 py-1.5 text-red-400 text-right font-mono">
                      {s.wrong_count}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-disabled">
                      {s.last_fired ? formatTimeAgo(s.last_fired) : 'never'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Zero-hit patterns callout */}
      {zeroHitPatterns.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <h4 className="text-sm font-semibold text-amber-400 mb-1">Review Candidates</h4>
          <p className="text-xs text-muted mb-2">
            These patterns have not matched any task in the last 30 days. Consider whether they are
            still relevant.
          </p>
          <div className="flex flex-wrap gap-2">
            {zeroHitPatterns.map((s) => (
              <span
                key={s.pattern_name}
                className="rounded bg-surface-2 border border-default px-2 py-0.5 text-xs text-muted"
              >
                {s.pattern_name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Tab: Recommendations ---

function RecommendationsTab() {
  const { data, isLoading, isError } = useRecommendations();
  const { data: history } = useRecommendationHistory();
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [triggerStatus, setTriggerStatus] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const handleAction = async (id: string, action: RecommendationAction) => {
    setLastResult(null);
    try {
      const result = await postRecommendationAction(id, action);
      if (action === 'convert' && result.task_id) {
        setLastResult(`Task created: ${result.task_title || result.task_id}`);
      } else {
        const labels: Record<string, string> = {
          dismiss: 'Dismissed',
          acknowledge: 'Acknowledged',
          resolve: 'Resolved',
        };
        setLastResult(labels[action] || action);
      }
      queryClient.invalidateQueries({ queryKey: ['cortex', 'recommendations'] });
    } catch {
      setLastResult('Action failed');
    }
  };

  const handleTriggerRun = async () => {
    setTriggerStatus('Starting Cortex run...');
    try {
      await triggerCortexRun();
      setTriggerStatus('Cortex run triggered — results will appear after completion');
      setTimeout(() => setTriggerStatus(null), 8000);
    } catch {
      setTriggerStatus('Failed to trigger Cortex run');
      setTimeout(() => setTriggerStatus(null), 5000);
    }
  };

  if (isLoading)
    return <div className="text-faint py-8 text-center">Loading recommendations...</div>;
  if (isError)
    return <div className="text-red-400 py-8 text-center">Failed to load recommendations.</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-faint">
          {data && data.length > 0
            ? `${data.length} active recommendation${data.length === 1 ? '' : 's'}`
            : 'No active recommendations'}
        </p>
        <button
          onClick={handleTriggerRun}
          disabled={triggerStatus === 'Starting Cortex run...'}
          className="rounded border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent-text hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          Run Cortex Now
        </button>
      </div>

      {triggerStatus && (
        <div className="rounded border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-400">
          {triggerStatus}
        </div>
      )}

      {lastResult && (
        <div className="rounded border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-accent-text">
          {lastResult}
        </div>
      )}

      {(!data || data.length === 0) && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">{'\u25C9'}</p>
          <p className="text-secondary font-medium">All clear</p>
          <p className="text-sm text-faint mt-1">
            No active recommendations. Use "Run Cortex Now" to trigger a fresh analysis.
          </p>
        </div>
      )}

      {data?.map((rec: Recommendation) => (
        <RecommendationCard key={rec.id} rec={rec} onAction={handleAction} />
      ))}

      {history && history.length > 0 && (
        <div className="mt-6 border-t border-default pt-4">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-faint hover:text-muted transition-colors"
          >
            <span className={`transition-transform ${showHistory ? 'rotate-90' : ''}`}>▶</span>
            History ({history.length})
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2 opacity-60">
              {history.map((rec: Recommendation) => (
                <div
                  key={rec.id}
                  className="rounded border border-default bg-surface-1/50 px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">{rec.title}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${rec.status === 'resolved' ? 'bg-green-500/10 text-green-400' : 'bg-surface-2 text-disabled'}`}
                      >
                        {rec.status}
                      </span>
                      <span className="text-xs text-disabled">
                        {formatTimeAgo(
                          (rec as unknown as Record<string, string>).status_updated_at ||
                            rec.timestamp,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function categoryColor(cat: string): string {
  switch (cat) {
    case 'gap':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'refresh':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'drift':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'pattern':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'training':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'coverage':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    default:
      return 'bg-surface-2 text-muted border-default';
  }
}

function RecommendationCard({
  rec,
  onAction,
}: {
  rec: Recommendation;
  onAction: (id: string, action: RecommendationAction) => void;
}) {
  const priorityLabel = ['', 'P1', 'P2', 'P3', 'P4', 'P5'][rec.priority] || `P${rec.priority}`;

  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
      <div className="flex items-start gap-2">
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded ${rec.priority <= 2 ? 'bg-red-500/10 text-red-400' : 'bg-surface-2 text-muted'}`}
        >
          {priorityLabel}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-secondary">{rec.title}</span>
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${categoryColor(rec.category)}`}
            >
              {rec.category}
            </span>
          </div>
          {rec.rationale && <p className="text-sm text-muted mt-1 line-clamp-2">{rec.rationale}</p>}
          {rec.suggested_action && (
            <p className="text-xs text-faint mt-1">
              <span className="font-medium text-muted">Suggested:</span> {rec.suggested_action}
            </p>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-disabled">{formatTimeAgo(rec.timestamp)}</span>
              {rec.target && <span className="text-xs text-disabled">{rec.target}</span>}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onAction(rec.id, 'acknowledge')}
                className="rounded border border-default bg-surface-2 px-2 py-1 text-xs text-muted hover:text-secondary hover:bg-surface-3 transition-colors"
                title="Acknowledge — mark as seen"
              >
                Acknowledge
              </button>
              <button
                onClick={() => onAction(rec.id, 'convert')}
                className="rounded border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-400 hover:bg-green-500/20 transition-colors"
                title="Convert to Pulse task"
              >
                Create Task
              </button>
              <button
                onClick={() => onAction(rec.id, 'resolve')}
                className="rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
                title="Mark resolved — I fixed this"
              >
                Resolve
              </button>
              <button
                onClick={() => onAction(rec.id, 'dismiss')}
                className="rounded border border-default bg-surface-2 px-2 py-1 text-xs text-disabled hover:text-red-400 hover:border-red-500/30 transition-colors"
                title="Dismiss — not relevant"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function CortexPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as TabKey) || 'freshness';

  const setTab = (tab: TabKey) => {
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-4">
      <Header title="Cortex">
        <span className="text-xs text-faint">Self-improvement observability</span>
      </Header>

      <p className="text-sm text-faint">
        Knowledge freshness, training pipeline health, pattern effectiveness, and system improvement
        recommendations.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-default pb-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTab(tab.key)}
            className={`shrink-0 rounded-t px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-surface-2 text-secondary'
                : 'text-faint hover:text-tertiary hover:bg-surface-1 active:text-tertiary active:bg-surface-1'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'freshness' && <FreshnessTab />}
      {activeTab === 'training' && <TrainingTab />}
      {activeTab === 'patterns' && <PatternsTab />}
      {activeTab === 'recommendations' && <RecommendationsTab />}
    </div>
  );
}
