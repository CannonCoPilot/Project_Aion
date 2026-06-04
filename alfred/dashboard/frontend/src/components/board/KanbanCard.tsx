import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { Task } from '../../api/tasks';
import { useLastLabelEvent } from '../../api/tasks';
import { formatTimeAgo } from '../../lib/time';
import { post, del } from '../../api/client';
import { getPriority } from '../../lib/priorities';
import { getStatus } from '../../lib/statuses';
import { getDaysStale } from '../tasks/StaleBadge';
import { BlockerBadge } from '../tasks/BlockerBadge';
import {
  getBlockedReasons,
  getDependencyCount,
  getDependencyIds,
  isActionableBlock,
} from '../../lib/labels';
import { useToast } from '../notifications/ToastProvider';

const PRIORITY_STRIPE: Record<number, string> = {
  0: 'bg-red-500',
  1: 'bg-orange-500',
  2: 'bg-yellow-500',
  3: 'bg-accent-light',
  4: 'bg-surface-muted',
};

function extractLabel(labels: string[] | undefined, prefix: string): string | undefined {
  const match = labels?.find((l) => l.startsWith(`${prefix}:`));
  return match ? match.slice(prefix.length + 1) : undefined;
}

function extractYamlTaskId(description?: string): string | undefined {
  const match = description?.match(/\*{0,2}yaml_task_id\*{0,2}:\s*(\S+)/);
  return match?.[1];
}

function formatAge(createdAt: string): string {
  const days = getDaysStale(createdAt);
  if (days < 1) return '<1d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

interface KanbanCardProps {
  task: Task;
  overlay?: boolean;
  hideProject?: boolean;
  hideDomain?: boolean;
  /** YAML task ID override from orchestration map (e.g. "T1.3") */
  yamlTaskIdOverride?: string;
  /** Pulsing glow border when a pipeline action is actively running for this task */
  isGlowing?: boolean;
}

export function KanbanCard({
  task,
  overlay,
  hideProject,
  hideDomain,
  yamlTaskIdOverride,
  isGlowing,
}: KanbanCardProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: overlay,
  });

  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => {
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!menuOpen) {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      }
      setMenuOpen(true);
    } else {
      setMenuOpen(false);
    }
  };

  const handleExecuteNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      for (const rl of ['waiting:david', 'waiting:session', 'parked', 'auto:candidate', 'needs-input', 'pipeline:needs-approval']) {
        if (labels.includes(rl)) {
          await del(`/tasks/${task.id}/labels/${encodeURIComponent(rl)}`);
        }
      }
      for (const el of ['auto:ready', 'risk:safe', 'stage:queue', 'pipeline:approved']) {
        if (!labels.includes(el)) {
          await post(`/tasks/${task.id}/labels`, { labels: [el], actor: 'dashboard' });
        }
      }
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', task.id] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      addToast({ title: 'Queued for execution', body: `"${task.title}" will run on the next executor cycle.`, severity: 'info' });
    } catch {
      addToast({ title: 'Failed to queue task', body: 'Could not update labels. Try again.', severity: 'warning' });
    }
  };

  const style = overlay
    ? undefined
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const priority = getPriority(task.priority);
  const statusDef = getStatus(task.status);
  const project = extractLabel(task.labels, 'project');
  const domain = extractLabel(task.labels, 'domain');
  const orchestration = extractLabel(task.labels, 'orchestration');
  const phase = extractLabel(task.labels, 'phase');
  const yamlTaskId = yamlTaskIdOverride ?? extractYamlTaskId(task.description);
  const ageDays = getDaysStale(task.created_at);
  const ageStr = formatAge(task.created_at);
  const isStale = ageDays >= 14;
  const labels = task.labels ?? [];
  const isResearchReview = labels.includes('review:research');
  const chainId = task.metadata?.chain_id as string | undefined;
  const chainOrder = task.metadata?.chain_order as number | undefined;
  const chainSize = task.metadata?.chain_size as number | undefined;
  const hasChain = Boolean(chainId && chainOrder != null && chainSize != null && chainSize > 1);
  const blockedReasons = getBlockedReasons(labels);
  const dependencyCount = getDependencyCount(task);
  const dependencyIds = getDependencyIds(task);
  const isBlocked = blockedReasons.length > 0;
  const shouldDim = isBlocked && !isActionableBlock(blockedReasons);

  const { data: lastLabelEvent } = useLastLabelEvent(task.id);
  const timeInStage = lastLabelEvent ? formatTimeAgo(lastLabelEvent.created_at) : null;

  const handleClick = (e: React.MouseEvent) => {
    // Don't navigate if we just finished a drag
    if (isDragging) return;
    e.stopPropagation();
    navigate(`/tasks/${task.id}`);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex rounded-lg border bg-surface-1 overflow-hidden transition-all cursor-pointer ${
        isDragging
          ? 'opacity-40 border-accent/50'
          : isGlowing
            ? 'border-blue-400/70 ring-1 ring-blue-400/40 shadow-[0_0_8px_rgba(96,165,250,0.35)] animate-pulse'
            : orchestration
              ? 'border-teal-500/30 hover:border-teal-500/50'
              : 'border-default hover:border-subtle'
      } ${overlay ? 'shadow-xl shadow-black/50 border-accent/30' : ''} ${shouldDim && !isDragging ? 'opacity-60' : ''}`}
      onClick={handleClick}
    >
      {/* Priority stripe — teal overlay for orchestration tasks */}
      <div className={`w-1 shrink-0 ${PRIORITY_STRIPE[task.priority] ?? 'bg-surface-muted'}`} />

      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center px-1.5 text-disabled hover:text-muted cursor-grab active:cursor-grabbing shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="6" cy="2" r="1.5" />
          <circle cx="2" cy="7" r="1.5" />
          <circle cx="6" cy="7" r="1.5" />
          <circle cx="2" cy="12" r="1.5" />
          <circle cx="6" cy="12" r="1.5" />
        </svg>
      </div>

      {/* Context menu button (portal-based dropdown to escape overflow-hidden) */}
      {!overlay && (
        <div className="absolute top-1.5 right-1.5 z-10" onClick={(e) => e.stopPropagation()}>
          <button
            ref={menuButtonRef}
            className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-faint hover:text-secondary hover:bg-surface-2 transition-opacity text-base leading-none"
            onClick={handleMenuToggle}
            title="Task actions"
          >
            &#8943;
          </button>
        </div>
      )}
      {menuOpen && menuPos && createPortal(
        <div
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-40 rounded-lg border border-default bg-surface-1 shadow-xl py-1"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-green-400 hover:bg-surface-2 flex items-center gap-2"
            onClick={handleExecuteNow}
          >
            <span>&#9654;</span>
            Execute Now
          </button>
        </div>,
        document.body
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 py-2 pr-2.5">
        <h4 className="text-sm font-medium text-primary line-clamp-2 leading-tight">
          {yamlTaskId && (
            <span
              className="inline-flex items-center mr-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/20 text-teal-300 align-middle"
              title={`${orchestration} / ${phase}`}
            >
              {yamlTaskId}
            </span>
          )}
          {task.title}
        </h4>

        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* Priority */}
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${priority.bgClass} ${priority.textClass}`}
          >
            {priority.symbol}
          </span>

          {/* Status dot */}
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusDef.bgClass} ${statusDef.textClass}`}
            title={statusDef.label}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusDef.dotClass}`} />
            {statusDef.label}
          </span>

          {/* Research triage indicator — Action Required (amber) vs FYI (purple) */}
          {isResearchReview && (
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                labels.includes('waiting:david')
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
              }`}
            >
              {'\u{1F50D}'}{' '}
              {labels.includes('waiting:david') ? 'Research \u2014 Action' : 'Research \u2014 FYI'}
            </span>
          )}

          {/* Project tag (hidden when inside a ProjectGroup) */}
          {project && !hideProject && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-300">
              {project}
            </span>
          )}

          {/* Domain tag (hidden when inside a domain group) */}
          {domain && !hideDomain && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-accent/20 text-accent-text-light">
              {domain}
            </span>
          )}

          {/* Assignee */}
          {task.assignee && (
            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/20 text-teal-300">
              {task.assignee}
            </span>
          )}

          {/* Chain badge */}
          {hasChain && (
            <span
              className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30"
              title={`Chain: ${chainId}`}
            >
              &#128279; {chainOrder}/{chainSize}
            </span>
          )}

          {/* Blocker badges */}
          <BlockerBadge
            blockedReasons={blockedReasons}
            dependencyCount={dependencyCount}
            dependencyIds={dependencyIds}
          />

          {/* Time in stage */}
          {timeInStage && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-sky-500/15 text-sky-400"
              title="Time since last label change"
            >
              {timeInStage}
            </span>
          )}

          {/* Age */}
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
              isStale ? 'bg-amber-500/15 text-amber-400' : 'text-faint'
            }`}
          >
            {ageStr}
          </span>
        </div>
      </div>
    </div>
  );
}
