import { useState, useCallback, useMemo } from 'react';
import {
  useReviews,
  useSubmitFeedback,
  useSubmitBulkFeedback,
  type ReviewDecision,
  type TaskCostSummary,
} from '../api/reviews';
import { useTask } from '../api/tasks';
import { Header } from '../components/layout/Header';
import { STAGE_ORDER, extractStage } from '../lib/stages';
import { StageBadge } from '../components/stages';
import { SearchInput } from '../components/filters/SearchInput';

// ─── Helpers ────────────────────────────────────────────────────

function formatTimeAgo(ts: string): string {
  const diffMs = Date.now() - new Date(ts).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function decisionKey(d: ReviewDecision): string {
  return `${d.task_id}:${d.timestamp}`;
}

function actionColor(action: string): string {
  switch (action) {
    case 'execute':
    case 'fix':
      return 'text-green-400';
    case 'execute-approved':
      return 'text-emerald-400';
    case 'propose':
      return 'text-accent-text';
    case 'escalate':
      return 'text-red-400';
    case 'close':
    case 'cleanup':
      return 'text-muted';
    case 'skip':
      return 'text-disabled';
    case 'defer':
      return 'text-amber-400';
    default:
      return 'text-muted';
  }
}

function actionIcon(action: string): string {
  switch (action) {
    case 'execute':
      return '\u2713';
    case 'execute-approved':
      return '\u2713\u2713';
    case 'fix':
      return '\u2699';
    case 'propose':
      return '\u2192';
    case 'escalate':
      return '\u2691';
    case 'close':
      return '\u2715';
    case 'skip':
      return '\u2014';
    case 'defer':
      return '\u23F1';
    case 'cleanup':
      return '\u2672';
    default:
      return '\u2022';
  }
}

function confidenceStyle(confidence: string): string {
  switch (confidence) {
    case 'high':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'medium':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'low':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-surface-muted/10 text-muted border-b-muted/20';
  }
}

function riskStyle(risk: string): string {
  switch (risk) {
    case 'safe':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'moderate':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'destructive':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-surface-muted/10 text-muted border-b-muted/20';
  }
}

const isSkipOrDefer = (r: ReviewDecision) => r.action === 'skip' || r.action === 'defer';

// ─── Human-readable summary generator ───────────────────────────

function humanSummary(d: ReviewDecision): string {
  const added = d.labels_added ?? [];
  const removed = d.labels_removed ?? [];

  const stageFrom = removed.find((l) => l.startsWith('stage:'))?.replace('stage:', '');
  const stageTo = added.find((l) => l.startsWith('stage:'))?.replace('stage:', '');
  const value = added.find((l) => l.startsWith('value:'))?.replace('value:', '');
  const effort = added.find((l) => l.startsWith('effort:'))?.replace('effort:', '');
  const risk = added.find((l) => l.startsWith('risk:'))?.replace('risk:', '');
  const priority = added.find((l) => l.match(/^priority:/))?.replace('priority:', '');

  const parts: string[] = [];

  if (stageFrom && stageTo) {
    parts.push(`Moved from ${stageFrom} to ${stageTo}`);
  } else if (stageTo) {
    parts.push(`Set stage to ${stageTo}`);
  }

  if (value || effort) {
    const assessParts: string[] = [];
    if (value) assessParts.push(`${value} value`);
    if (effort) assessParts.push(`${effort} effort`);
    parts.push(`Assessed as ${assessParts.join(', ')}`);
  }

  if (risk) parts.push(`Risk: ${risk}`);
  if (priority) parts.push(`Set priority to P${priority}`);

  if (parts.length === 0) {
    switch (d.action) {
      case 'execute':
      case 'execute-approved':
        parts.push('Auto-executed pipeline action');
        break;
      case 'fix':
        parts.push('Fixed label configuration');
        break;
      case 'close':
        parts.push('Closed task');
        break;
      case 'cleanup':
        parts.push('Cleaned up task labels');
        break;
      case 'propose':
        parts.push('Proposed action for your approval');
        break;
      case 'escalate':
        parts.push('Escalated \u2014 needs human decision');
        break;
      case 'skip':
        parts.push('Skipped \u2014 already correctly routed');
        break;
      case 'defer':
        parts.push('Deferred for later processing');
        break;
      default:
        parts.push(d.reasoning.slice(0, 80));
    }
  }

  return parts.join('. ') + '.';
}

// ─── Types ──────────────────────────────────────────────────────

type PendingGroup = 'decision' | 'auto' | 'closed';
type FilterTab = 'all' | 'pending' | 'execute' | 'propose' | 'escalate' | 'close' | 'skip';

interface Filters {
  confidence: string | null;
  risk: string | null;
  stage: string | null;
}

function pendingGroup(action: string): PendingGroup {
  if (action === 'propose' || action === 'escalate') return 'decision';
  if (action === 'close' || action === 'cleanup') return 'closed';
  return 'auto';
}

function isCompactAction(action: string): boolean {
  return !['propose', 'escalate'].includes(action);
}

// ─── Sort & Group types ─────────────────────────────────────────

type ReviewSortField =
  | 'timestamp'
  | 'confidence'
  | 'risk'
  | 'action'
  | 'feedback'
  | 'blockingCount'
  | 'created_at';
type ReviewSortOrder = 'asc' | 'desc';
type ReviewGroupMode = 'none' | 'project' | 'domain' | 'action' | 'confidence' | 'risk';

const SORT_OPTIONS: { value: ReviewSortField; label: string }[] = [
  { value: 'timestamp', label: 'Decision Date' },
  { value: 'created_at', label: 'Task Created' },
  { value: 'blockingCount', label: 'Blocking Count' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'risk', label: 'Risk' },
  { value: 'action', label: 'Action' },
  { value: 'feedback', label: 'Feedback' },
];

const REVIEW_GROUP_OPTIONS: { value: ReviewGroupMode; label: string }[] = [
  { value: 'none', label: 'No Grouping' },
  { value: 'project', label: 'Project' },
  { value: 'domain', label: 'Domain' },
  { value: 'action', label: 'Action Type' },
  { value: 'confidence', label: 'Confidence' },
  { value: 'risk', label: 'Risk Level' },
];

const REVIEW_GROUP_COLORS: Record<ReviewGroupMode, string> = {
  none: '',
  project: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  domain: 'text-accent-text bg-accent/10 border-accent/20',
  action: 'text-green-400 bg-green-500/10 border-green-500/20',
  confidence: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  risk: 'text-red-400 bg-red-500/10 border-red-500/20',
};

function extractReviewLabel(decision: ReviewDecision, prefix: string): string | undefined {
  const match = decision.labels_added?.find((l) => l.startsWith(`${prefix}:`));
  return match ? match.slice(prefix.length + 1) : undefined;
}

function getReviewGroupKey(decision: ReviewDecision, mode: ReviewGroupMode): string | undefined {
  switch (mode) {
    case 'project':
      return extractReviewLabel(decision, 'project');
    case 'domain':
      return extractReviewLabel(decision, 'domain');
    case 'action':
      return decision.action;
    case 'confidence':
      return decision.confidence;
    case 'risk':
      return decision.risk;
    default:
      return undefined;
  }
}

interface SortContext {
  blockingCounts?: Record<string, number>;
  taskCreatedDates?: Record<string, string>;
}

function compareDecisions(
  a: ReviewDecision,
  b: ReviewDecision,
  field: ReviewSortField,
  order: ReviewSortOrder,
  ctx?: SortContext,
): number {
  const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const RISK_RANK: Record<string, number> = { safe: 0, moderate: 1, destructive: 2 };
  const FEEDBACK_RANK: Record<string, number> = { null: 0, agreed: 1, adjust: 2, wrong: 3 };

  let cmp = 0;
  switch (field) {
    case 'timestamp':
      cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      break;
    case 'created_at': {
      const aDate = ctx?.taskCreatedDates?.[a.task_id] ?? a.timestamp;
      const bDate = ctx?.taskCreatedDates?.[b.task_id] ?? b.timestamp;
      cmp = new Date(aDate).getTime() - new Date(bDate).getTime();
      break;
    }
    case 'blockingCount': {
      const aCount = ctx?.blockingCounts?.[a.task_id] ?? 0;
      const bCount = ctx?.blockingCounts?.[b.task_id] ?? 0;
      cmp = aCount - bCount;
      break;
    }
    case 'confidence':
      cmp = (CONFIDENCE_RANK[a.confidence] ?? 9) - (CONFIDENCE_RANK[b.confidence] ?? 9);
      break;
    case 'risk':
      cmp = (RISK_RANK[a.risk] ?? 9) - (RISK_RANK[b.risk] ?? 9);
      break;
    case 'action':
      cmp = a.action.localeCompare(b.action);
      break;
    case 'feedback':
      cmp = (FEEDBACK_RANK[String(a.feedback)] ?? 9) - (FEEDBACK_RANK[String(b.feedback)] ?? 9);
      break;
  }
  return order === 'asc' ? cmp : -cmp;
}

// ─── Small UI components ────────────────────────────────────────

function FeedbackBadge({ feedback, action }: { feedback: string; action?: string }) {
  const isApprovedProposal = feedback === 'agreed' && action === 'propose';
  const styles: Record<string, string> = {
    agreed: isApprovedProposal
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      : 'bg-green-500/20 text-green-300 border-green-500/30',
    wrong: 'bg-red-500/20 text-red-300 border-red-500/30',
    adjust: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };
  const icons: Record<string, string> = {
    agreed: isApprovedProposal ? '\u23F3' : '\u2713',
    wrong: '\u2715',
    adjust: '\u21BB',
  };
  const label = isApprovedProposal ? 'approved \u2192 queued' : feedback;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${styles[feedback] || ''}`}
    >
      {icons[feedback]} {label}
    </span>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-faint mt-0.5">{label}</p>
    </div>
  );
}

function GroupHeader({ title, count, accent }: { title: string; count: number; accent: string }) {
  return (
    <div className={`flex items-center gap-2 pt-4 pb-2 border-l-2 pl-3 ${accent}`}>
      <span className="text-sm font-semibold text-secondary">{title}</span>
      <span className="text-xs text-disabled">({count})</span>
    </div>
  );
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded bg-surface-2 border border-default px-2 py-1.5 text-xs text-secondary focus:border-accent-border focus:outline-none cursor-pointer"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {label}: {o}
        </option>
      ))}
    </select>
  );
}

// ─── Before / After card layout ─────────────────────────────────

function BeforeAfterSummary({ decision }: { decision: ReviewDecision }) {
  const added = decision.labels_added ?? [];
  const removed = decision.labels_removed ?? [];

  const stageFrom = removed.find((l) => l.startsWith('stage:'))?.replace('stage:', '');
  const stageTo = added.find((l) => l.startsWith('stage:'))?.replace('stage:', '');

  const beforeLabels = removed.filter((l) => !l.startsWith('stage:'));
  const afterLabels = added.filter((l) => !l.startsWith('stage:'));

  const hasChanges = stageFrom || stageTo || beforeLabels.length > 0 || afterLabels.length > 0;
  if (!hasChanges) return null;

  return (
    <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
      <div className="rounded bg-surface-base border border-default/50 px-3 py-2">
        <span className="text-faint uppercase tracking-wide font-semibold text-[10px]">Before</span>
        <div className="mt-1 space-y-1">
          {stageFrom && (
            <div>
              <span className="text-faint">Stage:</span>{' '}
              <span className="text-muted">{stageFrom}</span>
            </div>
          )}
          {beforeLabels.map((l) => (
            <span
              key={l}
              className="inline-flex items-center rounded bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-xs text-red-400 mr-1"
            >
              {l}
            </span>
          ))}
          {!stageFrom && beforeLabels.length === 0 && (
            <span className="text-disabled italic">no prior state</span>
          )}
        </div>
      </div>

      <div className="rounded bg-surface-base border border-default/50 px-3 py-2">
        <span className="text-faint uppercase tracking-wide font-semibold text-[10px]">
          AI Reviewer Changed To
        </span>
        <div className="mt-1 space-y-1">
          {stageTo && (
            <div>
              <span className="text-faint">Stage:</span>{' '}
              <span className="text-secondary font-medium">{stageTo}</span>
            </div>
          )}
          {afterLabels.map((l) => (
            <span
              key={l}
              className="inline-flex items-center rounded bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 text-xs text-green-400 mr-1"
            >
              {l}
            </span>
          ))}
          {!stageTo && afterLabels.length === 0 && (
            <span className="text-disabled italic">no label changes</span>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveStatusWarning({
  decision,
  taskStatus,
  taskLabels,
}: {
  decision: ReviewDecision;
  taskStatus: string;
  taskLabels: string[];
}) {
  const decisionStage = extractStage(decision.labels_added ?? []);
  const currentStage = extractStage(taskLabels);
  const isClosed = taskStatus === 'closed';

  const stageProgressed =
    decisionStage &&
    currentStage &&
    decisionStage !== currentStage &&
    STAGE_ORDER.indexOf(currentStage as (typeof STAGE_ORDER)[number]) >
      STAGE_ORDER.indexOf(decisionStage as (typeof STAGE_ORDER)[number]);

  if (!isClosed && !stageProgressed) return null;

  return (
    <div className="mt-2 rounded border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs">
      <span className="text-green-400 font-medium">
        {isClosed
          ? '\u2714 Task is now closed \u2014 decision was correct'
          : `\u2714 Task progressed to ${currentStage} \u2014 decision was correct`}
      </span>
    </div>
  );
}

// ─── StageTrail ─────────────────────────────────────────────────

function StageTrail({ decision }: { decision: ReviewDecision }) {
  const { data: task } = useTask(decision.task_id);

  const prevStage = extractStage(decision.labels_removed ?? []);
  const decisionStage = extractStage(decision.labels_added ?? []);
  const currentStage = task ? extractStage(task.labels) : decisionStage;

  const stages: { name: string; state: 'past' | 'transition' | 'current' }[] = [];

  if (prevStage) {
    const prevIdx = STAGE_ORDER.indexOf(prevStage as (typeof STAGE_ORDER)[number]);
    if (prevIdx > 0) {
      stages.push({ name: STAGE_ORDER[prevIdx - 1], state: 'past' });
    }
    stages.push({ name: prevStage, state: 'past' });
  }

  if (decisionStage && decisionStage !== prevStage) {
    stages.push({
      name: decisionStage,
      state: currentStage === decisionStage ? 'current' : 'transition',
    });
  }

  if (currentStage && currentStage !== decisionStage && currentStage !== prevStage) {
    stages.push({ name: currentStage, state: 'current' });
  }

  const isClosed = task?.status === 'closed';
  const isDeferred = decision.action === 'defer';

  if (stages.length === 0 && !isClosed && !isDeferred) return null;

  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      {stages.map((s, i) => (
        <span key={s.name} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-disabled text-xs">{'\u2192'}</span>}
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
              s.state === 'current'
                ? 'bg-accent-hover/20 text-accent-text border border-accent-border/30'
                : s.state === 'transition'
                  ? 'bg-surface-2 text-muted border border-default/50'
                  : 'bg-surface-base text-faint border border-default/30'
            }`}
          >
            {s.name}
          </span>
        </span>
      ))}
      {isClosed && (
        <span className="flex items-center gap-1.5">
          {stages.length > 0 && <span className="text-disabled text-xs">{'\u2192'}</span>}
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-surface-base text-muted border border-default/50">
            closed
          </span>
        </span>
      )}
      {isDeferred && !isClosed && (
        <span className="flex items-center gap-1.5">
          {stages.length > 0 && <span className="text-disabled text-xs">{'\u2192'}</span>}
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            deferred
          </span>
        </span>
      )}
    </div>
  );
}

// ─── Review card details (expandable) ───────────────────────────

function ReviewCardDetails({ decision }: { decision: ReviewDecision }) {
  const { data: task, isLoading } = useTask(decision.task_id);

  if (isLoading) {
    return (
      <div className="mt-3 rounded bg-surface-2/50 px-4 py-3 text-xs text-faint">
        Loading task details...
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded bg-surface-2/50 px-4 py-3 text-sm">
      {task?.description && (
        <div>
          <span className="text-xs font-semibold text-faint uppercase tracking-wide">
            Description
          </span>
          <p className="text-muted mt-0.5 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {task?.notes && (
        <div>
          <span className="text-xs font-semibold text-faint uppercase tracking-wide">Notes</span>
          <p className="text-muted mt-0.5 whitespace-pre-wrap">{task.notes}</p>
        </div>
      )}

      {task?.close_reason && (
        <div>
          <span className="text-xs font-semibold text-faint uppercase tracking-wide">
            Close Reason
          </span>
          <p className="text-muted mt-0.5">{task.close_reason}</p>
        </div>
      )}

      {(decision.value || decision.effort || decision.recommendation) && (
        <div className="border-t border-default/50 pt-2 space-y-2">
          <span className="text-xs font-semibold text-faint uppercase tracking-wide">
            AI Reviewer Assessment
          </span>
          {decision.value && (
            <p className="text-muted mt-0.5">
              <span className="text-faint">Value:</span> {decision.value}
            </p>
          )}
          {decision.effort && (
            <p className="text-muted">
              <span className="text-faint">Effort:</span> {decision.effort}
            </p>
          )}
          {decision.recommendation && (
            <p className="text-muted">
              <span className="text-faint">Recommendation:</span> {decision.recommendation}
            </p>
          )}
        </div>
      )}

      {task && (
        <div className="border-t border-default/50 pt-2 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-faint">
            Live status: <span className="text-muted font-medium">{task.status}</span>
          </span>
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center rounded bg-surface-base border border-default/50 px-1.5 py-0.5 text-xs text-muted"
                >
                  {l}
                </span>
              ))}
            </div>
          )}
          <a
            href={`/tasks/${decision.task_id}`}
            className="text-xs text-accent-text hover:text-accent-hover active:text-accent-hover transition-colors ml-auto py-1"
          >
            {'View full task \u2192'}
          </a>
        </div>
      )}

      {!task && (
        <div className="text-xs text-faint">Task not found \u2014 may have been deleted.</div>
      )}
    </div>
  );
}

// ─── Stage transition badge ─────────────────────────────────────

function StageTransition({ decision }: { decision: ReviewDecision }) {
  const previous = extractStage(decision.labels_removed ?? []);
  const current = decision.stage || extractStage(decision.labels_added ?? []) || previous;
  const prev = previous !== current ? previous : null;

  if (!prev && !current) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {prev && <StageBadge label="prev:" stage={prev} />}
      {prev && current && <span className="text-disabled text-xs">{'\u2192'}</span>}
      {current && <StageBadge label={prev ? 'now:' : 'stage:'} stage={current} />}
    </span>
  );
}

// ─── Inline before/after for compact rows ──────────────────────

function InlineBeforeAfter({ decision }: { decision: ReviewDecision }) {
  const added = decision.labels_added ?? [];
  const removed = decision.labels_removed ?? [];

  const stageFrom = removed.find((l) => l.startsWith('stage:'))?.replace('stage:', '');
  const stageTo = added.find((l) => l.startsWith('stage:'))?.replace('stage:', '');
  const beforeLabels = removed.filter((l) => !l.startsWith('stage:'));
  const afterLabels = added.filter((l) => !l.startsWith('stage:'));

  const hasChanges = stageFrom || stageTo || beforeLabels.length > 0 || afterLabels.length > 0;
  if (!hasChanges) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs flex-wrap">
      {/* Before side */}
      <span className="text-faint shrink-0">{stageFrom || '\u2014'}</span>
      {beforeLabels.map((l) => (
        <span
          key={l}
          className="inline-flex rounded bg-red-500/10 border border-red-500/20 px-1 py-0 text-[10px] text-red-400"
        >
          {l}
        </span>
      ))}

      {/* Arrow */}
      <span className="text-disabled shrink-0">{'\u2192'}</span>

      {/* After side */}
      <span className="text-secondary font-medium shrink-0">{stageTo || '\u2014'}</span>
      {afterLabels.map((l) => (
        <span
          key={l}
          className="inline-flex rounded bg-green-500/10 border border-green-500/20 px-1 py-0 text-[10px] text-green-400"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

// ─── Compact review row ─────────────────────────────────────────

function CompactReviewRow({
  decision,
  selected,
  onToggleSelect,
  blockingCount,
  cost,
}: {
  decision: ReviewDecision;
  selected: boolean;
  onToggleSelect: (key: string) => void;
  blockingCount: number;
  cost?: TaskCostSummary;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [comment, setComment] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<'agreed' | 'wrong' | 'adjust' | null>(
    null,
  );
  const feedbackMutation = useSubmitFeedback();
  const { data: task } = useTask(decision.task_id);
  const hasFeedback = decision.feedback !== null;
  const key = decisionKey(decision);
  const isClosed = task?.status === 'closed';
  const summary = humanSummary(decision);

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't expand if clicking checkbox, button, or link
    const target = e.target as HTMLElement;
    if (target.closest('input[type="checkbox"]') || target.closest('button') || target.closest('a'))
      return;
    setExpanded(!expanded);
  };

  const handleConfirmFeedback = () => {
    if (!selectedFeedback) return;
    feedbackMutation.mutate({
      task_id: decision.task_id,
      task_title: decision.task_title,
      decision_timestamp: decision.timestamp,
      action: decision.action,
      feedback: selectedFeedback,
      comment,
    });
    setShowFeedback(false);
    setComment('');
    setSelectedFeedback(null);
  };

  return (
    <div
      className={`rounded-lg border transition-colors ${
        hasFeedback
          ? 'border-default/30 bg-surface-base'
          : expanded
            ? 'border-default bg-surface-1'
            : selected
              ? 'border-accent-border/50 bg-accent-hover/5'
              : 'border-default/50 bg-surface-1 hover:bg-surface-2/50'
      }`}
    >
      {/* Compact header row — always visible */}
      <div
        className="grid grid-cols-[auto_auto_1fr_auto_1fr_auto_auto_auto_auto_auto] items-center gap-3 px-4 py-2.5 cursor-pointer"
        onClick={handleRowClick}
      >
        {/* Col 1: Checkbox */}
        {!hasFeedback ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(key)}
            className="h-4 w-4 rounded border-default bg-surface-2 text-accent-text focus:ring-accent-border cursor-pointer"
          />
        ) : (
          <span className="w-4" />
        )}

        {/* Col 2: Action icon + expand indicator */}
        <span className={`text-sm font-medium ${actionColor(decision.action)}`}>
          {actionIcon(decision.action)}
        </span>

        {/* Col 3: Title + summary */}
        <div className="min-w-0">
          <span className="text-sm text-secondary truncate block">{decision.task_title}</span>
          <span className="text-xs text-faint truncate block">{summary}</span>
        </div>

        {/* Col 4: Task ID + blocking count */}
        <span className="text-xs text-disabled font-mono flex items-center gap-1.5">
          {decision.task_id}
          {blockingCount > 0 && (
            <span
              className="inline-flex items-center rounded bg-orange-500/15 border border-orange-500/25 px-1.5 py-0 text-[10px] text-orange-400 font-semibold"
              title={`Blocking ${blockingCount} task${blockingCount > 1 ? 's' : ''}`}
            >
              {'\u26D4'}
              {blockingCount}
            </span>
          )}
        </span>

        {/* Col 5: Before → After */}
        <div className="min-w-0">
          <InlineBeforeAfter decision={decision} />
        </div>

        {/* Col 6: Confidence */}
        <span
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${confidenceStyle(decision.confidence)}`}
        >
          {decision.confidence}
        </span>

        {/* Col 7: Time */}
        <span className="text-xs text-disabled w-14 text-right">
          {formatTimeAgo(decision.timestamp)}
        </span>

        {/* Col 8: Cost (v1.3 §6.1 #3 — Reviewer Dash cost column) */}
        {cost && cost.cost_usd_total > 0 ? (
          <span
            className={`text-xs font-mono w-16 text-right ${
              cost.cost_usd_total >= 2
                ? 'text-red-400'
                : cost.cost_usd_total >= 0.5
                  ? 'text-amber-400'
                  : 'text-disabled'
            }`}
            title={`${cost.runs_count} run${cost.runs_count !== 1 ? 's' : ''} · ${cost.models.join(', ')} · ${Math.round(cost.total_duration_s)}s total`}
          >
            ${cost.cost_usd_total.toFixed(2)}
          </span>
        ) : (
          <span className="w-16 text-xs text-disabled text-right">—</span>
        )}

        {/* Col 9: Status indicator */}
        {isClosed && !hasFeedback ? (
          <span className="text-green-400 text-xs" title="Task is closed \u2014 decision confirmed">
            {'\u2714'}
          </span>
        ) : (
          <span className="w-3" />
        )}

        {/* Col 10: Action button */}
        {hasFeedback ? (
          <FeedbackBadge feedback={decision.feedback!} action={decision.action} />
        ) : (
          <button
            onClick={() =>
              feedbackMutation.mutate({
                task_id: decision.task_id,
                task_title: decision.task_title,
                decision_timestamp: decision.timestamp,
                action: decision.action,
                feedback: 'agreed',
                comment: '',
              })
            }
            disabled={feedbackMutation.isPending}
            className="rounded bg-green-600/20 border border-green-500/30 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-600/30 active:bg-green-600/30 disabled:opacity-50 transition-colors"
          >
            {'\u2713'} Looks Good
          </button>
        )}
      </div>

      {/* Expanded detail section */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-default/30">
          {/* Before / After */}
          <BeforeAfterSummary decision={decision} />

          {/* Live status warning */}
          {task && (
            <LiveStatusWarning
              decision={decision}
              taskStatus={task.status}
              taskLabels={task.labels}
            />
          )}

          {/* AI Reviewer's reasoning */}
          <p className="text-xs text-muted mt-3">{decision.reasoning}</p>

          {/* Question if present */}
          {decision.question && (
            <div className="border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2 mt-3">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                Question
              </span>
              <p className="text-amber-200 mt-0.5 text-sm">{decision.question}</p>
            </div>
          )}

          {/* Stage trail */}
          <StageTrail decision={decision} />

          {/* Full task details */}
          <ReviewCardDetails decision={decision} />

          {/* Feedback comment if exists */}
          {decision.feedback_comment && (
            <div className="mt-2 rounded bg-surface-2/50 px-3 py-2">
              <p className="text-xs text-faint">
                Your feedback: <span className="text-muted">{decision.feedback_comment}</span>
              </p>
            </div>
          )}

          {/* Full feedback buttons when expanded */}
          {!hasFeedback && !showFeedback && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button
                onClick={() =>
                  feedbackMutation.mutate({
                    task_id: decision.task_id,
                    task_title: decision.task_title,
                    decision_timestamp: decision.timestamp,
                    action: decision.action,
                    feedback: 'agreed',
                    comment: '',
                  })
                }
                disabled={feedbackMutation.isPending}
                className="rounded bg-green-600/20 border border-green-500/30 px-4 py-2.5 text-sm font-medium text-green-400 hover:bg-green-600/30 active:bg-green-600/30 disabled:opacity-50 transition-colors"
              >
                {'\u2713'} Looks Good
              </button>
              <button
                onClick={() => {
                  setSelectedFeedback('wrong');
                  setShowFeedback(true);
                }}
                disabled={feedbackMutation.isPending}
                className="rounded bg-red-600/20 border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/30 active:bg-red-600/30 disabled:opacity-50 transition-colors"
              >
                {'\u2715'} Wrong
              </button>
              <button
                onClick={() => {
                  setSelectedFeedback('adjust');
                  setShowFeedback(true);
                }}
                disabled={feedbackMutation.isPending}
                className="rounded bg-amber-600/20 border border-amber-500/30 px-4 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-600/30 active:bg-amber-600/30 disabled:opacity-50 transition-colors"
              >
                {'\u21BB'} Adjust
              </button>
            </div>
          )}

          {/* Feedback comment input */}
          {showFeedback && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-faint">
                {selectedFeedback === 'wrong'
                  ? 'What should it never do? (add "unless..." for exceptions)'
                  : 'What should be adjusted?'}
              </p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  selectedFeedback === 'wrong'
                    ? 'Never do this because... (unless...)'
                    : 'Right direction, but tweak...'
                }
                rows={2}
                autoFocus
                className="w-full rounded bg-surface-2 border border-subtle px-3 py-2 text-sm text-secondary placeholder-faint focus:border-accent-border focus:outline-none resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConfirmFeedback}
                  disabled={feedbackMutation.isPending}
                  className="rounded bg-accent-hover px-4 py-2.5 text-sm font-medium text-white hover:bg-accent active:bg-accent disabled:opacity-50 transition-colors"
                >
                  Submit
                </button>
                <button
                  onClick={() => {
                    setShowFeedback(false);
                    setSelectedFeedback(null);
                    setComment('');
                  }}
                  className="rounded px-4 py-2.5 text-sm text-muted hover:text-secondary hover:bg-surface-2 active:text-secondary active:bg-surface-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Full review card ───────────────────────────────────────────

function ReviewCard({
  decision,
  selected,
  onToggleSelect,
  blockingCount,
}: {
  decision: ReviewDecision;
  selected: boolean;
  onToggleSelect: (key: string) => void;
  blockingCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [comment, setComment] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<'agreed' | 'wrong' | 'adjust' | null>(
    null,
  );
  const feedbackMutation = useSubmitFeedback();
  const { data: task } = useTask(decision.task_id);
  const key = decisionKey(decision);
  const summary = humanSummary(decision);

  const handleSubmitFeedback = (fb: 'agreed' | 'wrong' | 'adjust') => {
    if (fb === 'agreed') {
      feedbackMutation.mutate({
        task_id: decision.task_id,
        task_title: decision.task_title,
        decision_timestamp: decision.timestamp,
        action: decision.action,
        feedback: fb,
        comment: '',
      });
    } else {
      setSelectedFeedback(fb);
      setShowFeedback(true);
    }
  };

  const handleConfirmFeedback = () => {
    if (!selectedFeedback) return;
    feedbackMutation.mutate({
      task_id: decision.task_id,
      task_title: decision.task_title,
      decision_timestamp: decision.timestamp,
      action: decision.action,
      feedback: selectedFeedback,
      comment,
    });
    setShowFeedback(false);
    setComment('');
    setSelectedFeedback(null);
  };

  const hasFeedback = decision.feedback !== null;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        hasFeedback
          ? 'border-default/50 bg-surface-base'
          : selected
            ? 'border-accent-border/50 bg-accent-hover/5'
            : 'border-default bg-surface-1'
      }`}
    >
      <div className="px-5 py-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {!hasFeedback && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(key)}
                className="h-4 w-4 mt-1 rounded border-default bg-surface-2 text-accent-text focus:ring-accent-border cursor-pointer shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-lg font-medium ${actionColor(decision.action)}`}>
                  {actionIcon(decision.action)}
                </span>
                <span className="text-sm font-semibold text-secondary truncate">
                  {decision.task_title}
                </span>
                <span className="text-xs text-disabled font-mono">{decision.task_id}</span>
                {blockingCount > 0 && (
                  <span
                    className="inline-flex items-center rounded bg-orange-500/15 border border-orange-500/25 px-1.5 py-0.5 text-xs text-orange-400 font-semibold"
                    title={`Blocking ${blockingCount} task${blockingCount > 1 ? 's' : ''}`}
                  >
                    {'\u26D4'} Blocking {blockingCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${confidenceStyle(decision.confidence)}`}
                >
                  Confidence: {decision.confidence}
                </span>
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${riskStyle(decision.risk)}`}
                >
                  Risk: {decision.risk}
                </span>
                <StageTransition decision={decision} />
                <span className="text-xs text-disabled">{formatTimeAgo(decision.timestamp)}</span>
              </div>
            </div>
          </div>

          {hasFeedback && <FeedbackBadge feedback={decision.feedback!} action={decision.action} />}
        </div>

        {/* Human-readable summary */}
        <p className="text-sm text-secondary mt-3 font-medium">{summary}</p>

        {/* Question callout — visible without expanding for propose/escalate */}
        {decision.question && (
          <div className="border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2 mt-3">
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
              Question
            </span>
            <p className="text-amber-200 mt-0.5 text-sm">{decision.question}</p>
          </div>
        )}

        {/* Before / After */}
        <BeforeAfterSummary decision={decision} />

        {/* Live status warning */}
        {task && (
          <LiveStatusWarning
            decision={decision}
            taskStatus={task.status}
            taskLabels={task.labels}
          />
        )}

        {/* AI Reviewer's reasoning */}
        <p className="text-xs text-muted mt-3">{decision.reasoning}</p>

        {/* Stage trail */}
        <StageTrail decision={decision} />

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-faint hover:text-muted active:text-muted mt-2 flex items-center gap-1 transition-colors py-2"
        >
          <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
          {expanded ? 'Hide details' : 'Show full task details'}
        </button>

        {expanded && <ReviewCardDetails decision={decision} />}

        {decision.feedback_comment && (
          <div className="mt-2 rounded bg-surface-2/50 px-3 py-2">
            <p className="text-xs text-faint">
              Your feedback: <span className="text-muted">{decision.feedback_comment}</span>
            </p>
          </div>
        )}

        {/* Feedback buttons */}
        {!hasFeedback && !showFeedback && (
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {(decision.action === 'propose' || decision.action === 'escalate') && (
              <button
                onClick={() => {
                  setSelectedFeedback('agreed');
                  setShowFeedback(true);
                }}
                disabled={feedbackMutation.isPending}
                className="rounded bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-500 active:bg-green-500 disabled:opacity-50 transition-colors"
              >
                {'\u2713'} Approve
              </button>
            )}
            {decision.action !== 'propose' && decision.action !== 'escalate' && (
              <button
                onClick={() => handleSubmitFeedback('agreed')}
                disabled={feedbackMutation.isPending}
                className="rounded bg-green-600/20 border border-green-500/30 px-4 py-2.5 text-sm font-medium text-green-400 hover:bg-green-600/30 active:bg-green-600/30 disabled:opacity-50 transition-colors"
              >
                {'\u2713'} Looks Good
              </button>
            )}
            <button
              onClick={() => handleSubmitFeedback('wrong')}
              disabled={feedbackMutation.isPending}
              className="rounded bg-red-600/20 border border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/30 active:bg-red-600/30 disabled:opacity-50 transition-colors"
            >
              {'\u2715'} Wrong
            </button>
            <button
              onClick={() => handleSubmitFeedback('adjust')}
              disabled={feedbackMutation.isPending}
              className="rounded bg-amber-600/20 border border-amber-500/30 px-4 py-2.5 text-sm font-medium text-amber-400 hover:bg-amber-600/30 active:bg-amber-600/30 disabled:opacity-50 transition-colors"
            >
              {'\u21BB'} Adjust
            </button>
          </div>
        )}

        {showFeedback && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-faint">
              {selectedFeedback === 'wrong'
                ? 'What should it never do? (add "unless..." for exceptions)'
                : selectedFeedback === 'agreed'
                  ? 'Optional: add conditions (e.g., "approved if X", "only when Y")'
                  : 'What should be adjusted?'}
            </p>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                selectedFeedback === 'wrong'
                  ? 'Never do this because... (unless...)'
                  : selectedFeedback === 'agreed'
                    ? "Approved. (Optional: add conditions like 'only if...')"
                    : 'Right direction, but tweak...'
              }
              rows={2}
              autoFocus
              className="w-full rounded bg-surface-2 border border-subtle px-3 py-2 text-sm text-secondary placeholder-faint focus:border-accent-border focus:outline-none resize-none"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleConfirmFeedback}
                disabled={feedbackMutation.isPending}
                className="rounded bg-accent-hover px-4 py-2.5 text-sm font-medium text-white hover:bg-accent active:bg-accent disabled:opacity-50 transition-colors"
              >
                Submit
              </button>
              <button
                onClick={() => {
                  setShowFeedback(false);
                  setSelectedFeedback(null);
                  setComment('');
                }}
                className="rounded px-4 py-2.5 text-sm text-muted hover:text-secondary hover:bg-surface-2 active:text-secondary active:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bulk action bar ────────────────────────────────────────────

function BulkReviewActions({
  selectedCount,
  totalCount,
  onApproveAll,
  onDeselectAll,
  isPending,
}: {
  selectedCount: number;
  totalCount: number;
  onApproveAll: () => void;
  onDeselectAll: () => void;
  isPending: boolean;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-10 mx-auto max-w-3xl">
      <div className="flex items-center gap-4 rounded-xl border border-accent-border/50 bg-surface-2/95 backdrop-blur-sm px-5 py-3 shadow-lg">
        <span className="text-sm text-secondary font-medium">
          {selectedCount} of {totalCount} selected
        </span>
        <div className="flex-1" />
        <button
          onClick={onDeselectAll}
          className="rounded px-3 py-1.5 text-sm text-muted hover:text-secondary hover:bg-surface-base active:text-secondary active:bg-surface-base transition-colors"
        >
          Deselect All
        </button>
        <button
          onClick={onApproveAll}
          disabled={isPending}
          className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500 active:bg-green-500 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {isPending ? (
            <>
              <span className="animate-spin text-xs">{'\u25CE'}</span>
              Processing...
            </>
          ) : (
            <>
              {'\u2713'} Approve All ({selectedCount})
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────

export default function ReviewPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>({ confidence: null, risk: null, stage: null });
  const [sortField, setSortField] = useState<ReviewSortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<ReviewSortOrder>('desc');
  const [groupBy, setGroupBy] = useState<ReviewGroupMode>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useReviews();
  const bulkMutation = useSubmitBulkFeedback();

  const reviews = useMemo(() => data?.reviews ?? [], [data]);
  const stats = data?.stats;
  const blockingCounts = useMemo(() => data?.blockingCounts ?? {}, [data?.blockingCounts]);
  const taskCreatedDates = useMemo(() => data?.taskCreatedDates ?? {}, [data?.taskCreatedDates]);
  const costByTask = useMemo(() => data?.costByTask ?? {}, [data?.costByTask]);

  // Extract unique filter values
  const filterOptions = useMemo(() => {
    const confidences = new Set<string>();
    const risks = new Set<string>();
    const stages = new Set<string>();
    for (const r of reviews) {
      if (r.confidence) confidences.add(r.confidence);
      if (r.risk) risks.add(r.risk);
      const s = extractStage(r.labels_added ?? []);
      if (s) stages.add(s);
    }
    return {
      confidence: ['high', 'medium', 'low'].filter((c) => confidences.has(c)),
      risk: ['safe', 'moderate', 'destructive'].filter((r) => risks.has(r)),
      stage: Array.from(stages).sort(),
    };
  }, [reviews]);

  // Apply tab + dropdown + search filters
  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      // Tab filter
      if (activeTab === 'pending' && (r.feedback || isSkipOrDefer(r))) return false;
      if (activeTab === 'skip' && !isSkipOrDefer(r)) return false;
      if (activeTab === 'execute' && !['execute', 'fix', 'execute-approved'].includes(r.action))
        return false;
      if (activeTab === 'propose' && r.action !== 'propose') return false;
      if (activeTab === 'escalate' && r.action !== 'escalate') return false;
      if (activeTab === 'close' && r.action !== 'close') return false;

      // Dropdown filters
      if (filters.confidence && r.confidence !== filters.confidence) return false;
      if (filters.risk && r.risk !== filters.risk) return false;
      if (filters.stage) {
        const s = extractStage(r.labels_added ?? []);
        if (s !== filters.stage) return false;
      }

      // Search filter
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.task_title.toLowerCase().includes(q) &&
          !r.task_id.toLowerCase().includes(q) &&
          !r.labels_added?.some((l) => l.toLowerCase().includes(q)) &&
          !r.reasoning?.toLowerCase().includes(q)
        )
          return false;
      }

      return true;
    });
  }, [reviews, activeTab, filters, search]);

  // Sort filtered results
  const sortCtx = useMemo<SortContext>(
    () => ({ blockingCounts, taskCreatedDates }),
    [blockingCounts, taskCreatedDates],
  );
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => compareDecisions(a, b, sortField, sortOrder, sortCtx));
  }, [filtered, sortField, sortOrder, sortCtx]);

  // Group sorted results (when grouping is active)
  const reviewGroups = useMemo(() => {
    if (groupBy === 'none') return null;
    const groups: Record<string, ReviewDecision[]> = {};
    const ungrouped: ReviewDecision[] = [];
    for (const d of sorted) {
      const key = getReviewGroupKey(d, groupBy);
      if (key) {
        (groups[key] ??= []).push(d);
      } else {
        ungrouped.push(d);
      }
    }
    return {
      groups: Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)),
      ungrouped,
    };
  }, [sorted, groupBy]);

  const pendingCount = useMemo(
    () => reviews.filter((r) => !r.feedback && !isSkipOrDefer(r)).length,
    [reviews],
  );

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'pending', label: 'Needs Your Review', count: pendingCount },
    { key: 'all', label: 'All', count: reviews.length },
    {
      key: 'execute',
      label: 'Auto-Approved',
      count: reviews.filter(
        (r) => r.action === 'execute' || r.action === 'fix' || r.action === 'execute-approved',
      ).length,
    },
    {
      key: 'propose',
      label: 'Proposals',
      count: reviews.filter((r) => r.action === 'propose').length,
    },
    {
      key: 'escalate',
      label: 'Needs You',
      count: reviews.filter((r) => r.action === 'escalate').length,
    },
    { key: 'close', label: 'Closed', count: reviews.filter((r) => r.action === 'close').length },
    {
      key: 'skip',
      label: 'Skipped/Deferred',
      count: reviews.filter((r) => isSkipOrDefer(r)).length,
    },
  ];

  // Group pending items (only when no custom grouping is active)
  const pendingGroups = useMemo(() => {
    if (activeTab !== 'pending' || groupBy !== 'none') return null;
    const pending = sorted.filter((r) => !r.feedback);
    const groups: Record<PendingGroup, ReviewDecision[]> = { decision: [], auto: [], closed: [] };
    for (const r of pending) {
      groups[pendingGroup(r.action)].push(r);
    }
    return groups;
  }, [sorted, activeTab, groupBy]);

  const toggleGroupCollapse = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  }, []);

  const toggleAllGroups = useCallback(() => {
    if (!reviewGroups) return;
    const allNames = reviewGroups.groups.map(([name]) => name);
    setCollapsedGroups((prev) => (prev.size === allNames.length ? new Set() : new Set(allNames)));
  }, [reviewGroups]);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const keys = new Set<string>();
    for (const r of sorted) {
      if (!r.feedback) keys.add(decisionKey(r));
    }
    setSelectedKeys(keys);
  }, [sorted]);

  const deselectAll = useCallback(() => setSelectedKeys(new Set()), []);

  const handleBulkApprove = useCallback(() => {
    const items = sorted
      .filter((r) => !r.feedback && selectedKeys.has(decisionKey(r)))
      .map((r) => ({
        task_id: r.task_id,
        task_title: r.task_title,
        decision_timestamp: r.timestamp,
        action: r.action,
        feedback: 'agreed' as const,
        comment: '',
      }));
    if (items.length === 0) return;
    bulkMutation.mutate({ items }, { onSuccess: () => setSelectedKeys(new Set()) });
  }, [sorted, selectedKeys, bulkMutation]);

  const pendingSelectableCount = useMemo(() => sorted.filter((r) => !r.feedback).length, [sorted]);

  const hasActiveFilters = filters.confidence || filters.risk || filters.stage || search;

  function renderDecisions(decisions: ReviewDecision[]) {
    return decisions.map((decision, i) => {
      const key = decisionKey(decision);
      const isPending = !decision.feedback;

      if (activeTab === 'pending' && isPending && isCompactAction(decision.action)) {
        return (
          <CompactReviewRow
            key={`${key}-${i}`}
            decision={decision}
            selected={selectedKeys.has(key)}
            onToggleSelect={toggleSelect}
            blockingCount={blockingCounts[decision.task_id] ?? 0}
            cost={costByTask[decision.task_id]}
          />
        );
      }

      return (
        <ReviewCard
          key={`${key}-${i}`}
          decision={decision}
          selected={selectedKeys.has(key)}
          onToggleSelect={toggleSelect}
          blockingCount={blockingCounts[decision.task_id] ?? 0}
        />
      );
    });
  }

  return (
    <div className="space-y-4">
      <Header title="AI Review" />

      <p className="text-sm text-faint">
        Training AI Reviewer through feedback. Every click improves future decisions. Refreshes every
        30s.
      </p>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          <StatCard label="Pending Review" value={pendingCount} color="text-accent-text" />
          <StatCard label="Agreed" value={stats.agreed} color="text-green-400" />
          <StatCard label="Wrong" value={stats.wrong} color="text-red-400" />
          <StatCard label="Adjusted" value={stats.adjusted} color="text-amber-400" />
          <StatCard label="Total Decisions" value={stats.total} color="text-tertiary" />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-default pb-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setSelectedKeys(new Set());
            }}
            className={`shrink-0 rounded-t px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-surface-2 text-secondary'
                : 'text-faint hover:text-tertiary hover:bg-surface-1 active:text-tertiary active:bg-surface-1'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`ml-1.5 text-xs ${activeTab === tab.key ? 'text-muted' : 'text-disabled'}`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Row 1: Search + filter dropdowns */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search reviews..." />
        <FilterDropdown
          label="Confidence"
          value={filters.confidence}
          options={filterOptions.confidence}
          onChange={(v) => setFilters((f) => ({ ...f, confidence: v }))}
        />
        <FilterDropdown
          label="Risk"
          value={filters.risk}
          options={filterOptions.risk}
          onChange={(v) => setFilters((f) => ({ ...f, risk: v }))}
        />
        <FilterDropdown
          label="Stage"
          value={filters.stage}
          options={filterOptions.stage}
          onChange={(v) => setFilters((f) => ({ ...f, stage: v }))}
        />
        {hasActiveFilters && (
          <button
            onClick={() => {
              setFilters({ confidence: null, risk: null, stage: null });
              setSearch('');
            }}
            className="text-xs text-muted hover:text-secondary active:text-secondary transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Row 2: Sort + Group + Select controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-faint uppercase tracking-wider font-medium">
            Sort
          </label>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as ReviewSortField)}
            className="rounded bg-surface-2 border border-default px-2 py-1.5 text-xs text-secondary focus:border-accent-border focus:outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="rounded bg-surface-2 border border-default px-1.5 py-1 text-xs text-tertiary hover:text-secondary transition-colors"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '\u25B2' : '\u25BC'}
          </button>
        </div>

        {/* Group */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-faint uppercase tracking-wider font-medium">
            Group
          </label>
          <select
            value={groupBy}
            onChange={(e) => {
              setGroupBy(e.target.value as ReviewGroupMode);
              setCollapsedGroups(new Set());
            }}
            className="rounded bg-surface-2 border border-default px-2 py-1.5 text-xs text-secondary focus:border-accent-border focus:outline-none cursor-pointer"
          >
            {REVIEW_GROUP_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Expand/Collapse All */}
        {groupBy !== 'none' && reviewGroups && reviewGroups.groups.length > 0 && (
          <button
            onClick={toggleAllGroups}
            className="text-[10px] text-faint hover:text-tertiary uppercase tracking-wider transition-colors"
          >
            {collapsedGroups.size === reviewGroups.groups.length ? 'Expand All' : 'Collapse All'}
          </button>
        )}

        <div className="flex-1" />

        {pendingSelectableCount > 0 && (
          <>
            <button
              onClick={selectAllVisible}
              className="text-xs text-accent-text hover:text-accent-hover active:text-accent-hover transition-colors"
            >
              Select All Visible ({pendingSelectableCount})
            </button>
            {selectedKeys.size > 0 && (
              <button
                onClick={deselectAll}
                className="text-xs text-muted hover:text-secondary active:text-secondary transition-colors"
              >
                Deselect All
              </button>
            )}
          </>
        )}
      </div>

      {/* Loading / Error */}
      {isLoading && <div className="text-faint py-8 text-center">Loading decisions...</div>}
      {isError && !data && (
        <div className="text-red-400 py-8 text-center">Failed to load decisions.</div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && sorted.length === 0 && (
        <div className="text-center py-12">
          <p className="text-2xl text-ghost mb-2">
            {activeTab === 'pending' ? '\u2714' : '\u2205'}
          </p>
          <p className="text-faint">
            {activeTab === 'pending'
              ? hasActiveFilters
                ? 'No decisions match these filters'
                : 'All decisions reviewed'
              : 'No decisions in this category'}
          </p>
          <p className="text-xs text-disabled mt-1">
            {activeTab === 'pending' && !hasActiveFilters
              ? 'AI Reviewer is learning from your feedback'
              : activeTab === 'pending' && hasActiveFilters
                ? 'Try clearing filters to see all pending items'
                : 'AI Reviewer will populate this as it processes tasks'}
          </p>
        </div>
      )}

      {/* Mode 1: Pending tab with default grouping (decision/auto/closed) */}
      {activeTab === 'pending' && pendingGroups && (
        <div className="space-y-1">
          {pendingGroups.decision.length > 0 && (
            <>
              <GroupHeader
                title="Needs Your Decision"
                count={pendingGroups.decision.length}
                accent="border-amber-500"
              />
              <div className="space-y-3">{renderDecisions(pendingGroups.decision)}</div>
            </>
          )}

          {pendingGroups.auto.length > 0 && (
            <>
              <GroupHeader
                title="Auto-Approved"
                count={pendingGroups.auto.length}
                accent="border-green-500"
              />
              <div className="space-y-1">{renderDecisions(pendingGroups.auto)}</div>
            </>
          )}

          {pendingGroups.closed.length > 0 && (
            <>
              <GroupHeader
                title="Closed"
                count={pendingGroups.closed.length}
                accent="border-default"
              />
              <div className="space-y-1">{renderDecisions(pendingGroups.closed)}</div>
            </>
          )}
        </div>
      )}

      {/* Mode 2: Custom grouping (any tab, when groupBy !== 'none') */}
      {reviewGroups && (
        <div className="space-y-1">
          {reviewGroups.groups.map(([groupName, decisions]) => (
            <div key={groupName}>
              <button
                onClick={() => toggleGroupCollapse(groupName)}
                className="flex items-center gap-2 w-full pt-4 pb-2 text-left"
              >
                <span className="text-xs text-faint">
                  {collapsedGroups.has(groupName) ? '\u25B6' : '\u25BC'}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded border ${REVIEW_GROUP_COLORS[groupBy]}`}
                >
                  {groupName}
                </span>
                <span className="text-xs text-disabled">({decisions.length})</span>
              </button>
              {!collapsedGroups.has(groupName) && (
                <div className="space-y-1">{renderDecisions(decisions)}</div>
              )}
            </div>
          ))}
          {reviewGroups.ungrouped.length > 0 && (
            <div>
              <GroupHeader
                title="Ungrouped"
                count={reviewGroups.ungrouped.length}
                accent="border-default"
              />
              <div className="space-y-1">{renderDecisions(reviewGroups.ungrouped)}</div>
            </div>
          )}
        </div>
      )}

      {/* Mode 3: Flat list (non-pending, no grouping) */}
      {activeTab !== 'pending' && !reviewGroups && (
        <div className="space-y-3">
          {sorted.map((decision, i) => (
            <ReviewCard
              key={`${decisionKey(decision)}-${i}`}
              decision={decision}
              selected={selectedKeys.has(decisionKey(decision))}
              onToggleSelect={toggleSelect}
              blockingCount={blockingCounts[decision.task_id] ?? 0}
            />
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      <BulkReviewActions
        selectedCount={selectedKeys.size}
        totalCount={pendingSelectableCount}
        onApproveAll={handleBulkApprove}
        onDeselectAll={deselectAll}
        isPending={bulkMutation.isPending}
      />
    </div>
  );
}
