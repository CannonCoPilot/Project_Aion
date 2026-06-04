import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Task } from '../../api/tasks';
import type { OrchestrationTaskMapEntry } from '../../api/orchestrations';
import { useUpdateTask } from '../../api/mutations';
import { PriorityBadge } from './PriorityBadge';
import { StatusBadge } from './StatusBadge';
import { LabelChip } from './LabelChip';
import { TaskActions } from './TaskActions';
import { StaleBadge, isStale } from './StaleBadge';
import { BlockerBadge } from './BlockerBadge';
import {
  getBlockedReasons,
  getDependencyCount,
  getDependencyIds,
  isActionableBlock,
} from '../../lib/labels';

const COL_COUNT = 14; // must match COLUMNS in TaskTable + checkbox + actions

interface TaskRowProps {
  task: Task;
  isFocused?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  orchestration?: OrchestrationTaskMapEntry;
}

export function TaskRow({
  task,
  isFocused = false,
  isSelected = false,
  onToggleSelect,
  orchestration,
}: TaskRowProps) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const update = useUpdateTask(task.id);
  const labels = task.labels ?? [];
  const domain = labels.find((l) => l.startsWith('domain:'));
  const project = labels.find((l) => l.startsWith('project:'));
  const source = labels.find((l) => l.startsWith('source:'));
  const stage = labels.find((l) => l.startsWith('stage:'));
  const orchLabel = labels.find((l) => l.startsWith('orchestration:'));
  const phaseLabel = labels.find((l: string) => l.startsWith('phase:'));
  const yamlTaskId = task.description?.match(/\*{0,2}yaml_task_id\*{0,2}:\s*(\S+)/)?.[1];
  const hasContext = !!(task.description || task.notes || labels.length > 0);
  const stale = task.status !== 'closed' && isStale(task.updated_at);
  const blockedReasons = getBlockedReasons(labels);
  const dependencyCount = getDependencyCount(task);
  const dependencyIds = getDependencyIds(task);
  const isBlocked = blockedReasons.length > 0;
  const shouldDim = isBlocked && !isActionableBlock(blockedReasons);
  const isResearchReview = labels.includes('review:research');

  const handleAddNote = () => {
    if (!quickNote.trim()) return;
    const newNotes = task.notes ? `${task.notes}\n${quickNote}` : quickNote;
    update.mutate(
      { notes: newNotes },
      {
        onSuccess: () => {
          setQuickNote('');
          setShowNoteInput(false);
        },
      },
    );
  };

  return (
    <>
      <tr
        onClick={() => navigate(`/tasks/${task.id}`)}
        className={`cursor-pointer border-b border-default hover:bg-surface-2/50 transition-colors ${
          isFocused ? 'ring-1 ring-accent/50 bg-accent/5' : ''
        } ${isSelected ? 'bg-accent/10' : ''} ${
          orchestration || orchLabel
            ? 'border-l-2 border-l-teal-500/70 bg-teal-500/[0.03]'
            : stale
              ? 'border-l-2 border-l-amber-500/50'
              : ''
        } ${shouldDim ? 'opacity-60' : ''}`}
      >
        <td className="px-3 py-2 w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="rounded border-b-muted bg-surface-2 text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer"
          />
        </td>
        <td className="px-3 py-2">
          <PriorityBadge level={task.priority} />
        </td>
        <td className="px-3 py-2">
          <StatusBadge status={task.status} />
        </td>
        <td className="px-3 py-2">{stage && <LabelChip label={stage} />}</td>
        <td className="px-3 py-2">
          <span className="font-mono text-xs text-faint">{task.id}</span>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            {hasContext && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="text-disabled hover:text-tertiary text-xs flex-shrink-0 w-4"
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? '\u25BC' : '\u25B6'}
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {(yamlTaskId || orchestration?.yamlTaskId) && (
                  <span className="inline-flex items-center text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 whitespace-nowrap flex-shrink-0">
                    {yamlTaskId || orchestration?.yamlTaskId}
                  </span>
                )}
                <span className="font-medium text-primary">{task.title}</span>
                {stale && <StaleBadge updatedAt={task.updated_at} />}
                <BlockerBadge
                  blockedReasons={blockedReasons}
                  dependencyCount={dependencyCount}
                  dependencyIds={dependencyIds}
                />
                {isResearchReview && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                      labels.includes('waiting:david')
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                    }`}
                  >
                    {'\u{1F50D}'}{' '}
                    {labels.includes('waiting:david')
                      ? 'Research \u2014 Action'
                      : 'Research \u2014 FYI'}
                  </span>
                )}
              </div>
              {!expanded && task.description && (
                <div className="text-xs text-faint mt-0.5 line-clamp-1 max-w-md">
                  {task.description}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2">{domain && <LabelChip label={domain} />}</td>
        <td className="px-3 py-2">{project && <LabelChip label={project} />}</td>
        <td className="px-3 py-2">{source && <LabelChip label={source} />}</td>
        <td className="px-3 py-2">
          {(orchestration || orchLabel) && (
            <div className="flex flex-col gap-0.5">
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 whitespace-nowrap w-fit"
                title={
                  orchestration
                    ? `${orchestration.name}${orchestration.phase ? ` / ${orchestration.phase}` : ''}`
                    : orchLabel!.slice('orchestration:'.length)
                }
              >
                <svg
                  className="w-3 h-3 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                {orchestration?.name ??
                  orchLabel!
                    .slice('orchestration:'.length)
                    .split('-')
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')}
              </span>
              {(orchestration?.phase || phaseLabel) && (
                <span className="text-[9px] text-teal-400/60 px-2 truncate max-w-[160px]">
                  {orchestration?.phase ?? phaseLabel!.slice('phase:'.length).replace(/-/g, ' ')}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-sm text-muted">{task.assignee ?? '\u2014'}</td>
        <td className="px-3 py-2 text-sm text-faint">
          {new Date(task.created_at).toLocaleDateString()}
        </td>
        <td className="px-3 py-2 text-sm text-faint">
          {new Date(task.updated_at).toLocaleDateString()}
        </td>
        <td className="px-3 py-2">
          <TaskActions
            taskId={task.id}
            status={task.status}
            priority={task.priority}
            labels={task.labels ?? []}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-1/50">
          <td colSpan={COL_COUNT} className="px-6 py-3">
            <div className="space-y-2 text-sm max-w-3xl">
              {task.question && (
                <div className="border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-2">
                  <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
                    Needs Answer
                  </span>
                  <p className="text-amber-200 mt-0.5">{task.question}</p>
                </div>
              )}
              {task.description && (
                <div>
                  <span className="text-xs text-faint uppercase">Description</span>
                  <p className="text-tertiary whitespace-pre-wrap mt-0.5">{task.description}</p>
                </div>
              )}
              {task.notes && (
                <div>
                  <span className="text-xs text-faint uppercase">Notes</span>
                  <p className="text-tertiary whitespace-pre-wrap mt-0.5">{task.notes}</p>
                </div>
              )}
              {labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {labels.map((l) => (
                    <LabelChip key={l} label={l} />
                  ))}
                </div>
              )}
              {/* Quick note input */}
              <div onClick={(e) => e.stopPropagation()}>
                {!showNoteInput ? (
                  <button
                    onClick={() => setShowNoteInput(true)}
                    title="Append a quick note to this task"
                    className="rounded bg-surface-2 border border-subtle px-2.5 py-1 text-xs text-muted hover:text-accent-text hover:border-b-muted transition-colors"
                  >
                    + Add Note
                  </button>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                      placeholder="Add a quick note..."
                      className="flex-1 rounded bg-surface-1 border border-subtle px-2 py-1 text-xs text-primary focus:border-accent-border focus:outline-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && quickNote.trim()) handleAddNote();
                        if (e.key === 'Escape') {
                          setShowNoteInput(false);
                          setQuickNote('');
                        }
                      }}
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!quickNote.trim() || update.isPending}
                      className="rounded bg-accent-hover px-2 py-1 text-xs text-white hover:bg-accent disabled:opacity-50"
                    >
                      {update.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setShowNoteInput(false);
                        setQuickNote('');
                      }}
                      className="text-xs text-faint hover:text-tertiary"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
