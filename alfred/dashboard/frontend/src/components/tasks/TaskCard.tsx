import { useNavigate } from 'react-router-dom';
import type { Task } from '../../api/tasks';
import type { OrchestrationTaskMapEntry } from '../../api/orchestrations';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';
import { LabelChip } from './LabelChip';
import { BlockerBadge } from './BlockerBadge';
import { TaskActions } from './TaskActions';
import { StaleBadge, isStale } from './StaleBadge';
import { getBlockedReasons, getDependencyCount, getDependencyIds } from '../../lib/labels';

export function TaskCard({
  task,
  orchestration,
}: {
  task: Task;
  orchestration?: OrchestrationTaskMapEntry;
}) {
  const navigate = useNavigate();
  const stale = task.status !== 'closed' && isStale(task.updated_at);
  const labels = task.labels ?? [];
  const blockedReasons = getBlockedReasons(labels);
  const dependencyCount = getDependencyCount(task);
  const dependencyIds = getDependencyIds(task);
  const isResearchReview = labels.includes('review:research');
  const project = labels.find((l) => l.startsWith('project:'))?.replace('project:', '');
  const domain = labels.find((l) => l.startsWith('domain:'))?.replace('domain:', '');

  return (
    <div
      onClick={() => navigate(`/tasks/${task.id}`)}
      className={`cursor-pointer rounded-lg border bg-surface-1 p-3 hover:bg-surface-2/50 transition-colors ${
        orchestration
          ? 'border-teal-500/30 border-l-2 border-l-teal-500/70'
          : stale
            ? 'border-amber-500/30'
            : 'border-default'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <PriorityBadge level={task.priority} />
        <StatusBadge status={task.status} />
        {stale && <StaleBadge updatedAt={task.updated_at} />}
        <BlockerBadge
          blockedReasons={blockedReasons}
          dependencyCount={dependencyCount}
          dependencyIds={dependencyIds}
        />
        {isResearchReview && (
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
            {'\u{1F50D}'} Research
          </span>
        )}
        <div className="ml-auto">
          <TaskActions
            taskId={task.id}
            status={task.status}
            priority={task.priority}
            labels={task.labels ?? []}
          />
        </div>
      </div>
      <div className="font-mono text-xs text-faint mb-0.5">{task.id}</div>
      <h3 className="font-medium text-primary mb-1">{task.title}</h3>
      {orchestration && (
        <div className="mb-1">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30"
            title={`Project: ${orchestration.name} (${orchestration.status})`}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            {orchestration.name}
          </span>
        </div>
      )}
      {/* Context badges — project + domain */}
      {(project || domain) && (
        <div className="flex flex-wrap gap-1 mb-1">
          {project && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-300">
              {project}
            </span>
          )}
          {domain && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent/20 text-accent-text-light">
              {domain}
            </span>
          )}
        </div>
      )}
      {task.question && (
        <div className="border border-amber-500/30 bg-amber-500/10 rounded px-2 py-1.5 mb-1">
          <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
            Needs Answer
          </span>
          <p className="text-xs text-amber-200 mt-0.5 line-clamp-2">{task.question}</p>
        </div>
      )}
      {task.description && (
        <p className="text-xs text-faint mb-1 line-clamp-2">{task.description}</p>
      )}
      <div className="flex flex-wrap gap-1 mb-1">
        {(task.labels ?? []).map((l) => (
          <LabelChip key={l} label={l} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint mt-2">
        <span>{task.assignee ?? 'Unassigned'}</span>
        {(task.labels ?? []).find((l) => l.startsWith('source:')) && (
          <span>
            {(task.labels ?? []).find((l) => l.startsWith('source:'))!.replace('source:', '')}
          </span>
        )}
        <span className="ml-auto">
          {new Date(task.created_at).toLocaleDateString()} /{' '}
          {new Date(task.updated_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
