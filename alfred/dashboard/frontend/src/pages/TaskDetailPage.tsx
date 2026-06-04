import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTask, useTaskEvents, useObsidianBacklinks, useTaskLiveDetail } from '../api/tasks';
import { useCloseTask, useCreateTask } from '../api/mutations';
import { TaskDetail } from '../components/tasks/TaskDetail';
import { EventTimeline } from '../components/events/EventTimeline';
import { PipelineApprovalCard } from '../components/pipeline/PipelineApprovalCard';
import { TaskAskPanel } from '../components/tasks/TaskAskPanel';
import type { Task } from '../api/tasks';

// ─── Live Execution Panel ────────────────────────────────────────

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LiveExecutionPanel({ taskId }: { taskId: string }) {
  const { data: live } = useTaskLiveDetail(taskId);
  const [showTail, setShowTail] = useState(false);

  if (!live || live.status === 'not_active') return null;

  const isActive = live.status === 'active';

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${isActive ? 'border-blue-500/30 bg-blue-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-blue-400 animate-pulse' : 'bg-amber-400'}`} />
          <span className={`text-sm font-semibold ${isActive ? 'text-blue-300' : 'text-amber-300'}`}>
            {isActive ? 'Executing now' : 'Stale (process ended)'}
          </span>
        </div>
        {live.session_id && (
          <span className="text-[10px] font-mono text-faint" title={`Session: ${live.session_id}`}>
            {live.session_id.slice(0, 8)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1.5 text-xs">
        {live.persona && (
          <><span className="text-muted">Persona</span><span className="text-primary font-mono">{live.persona}</span></>
        )}
        {live.model && (
          <><span className="text-muted">Model</span><span className="text-primary font-mono">{live.model}</span></>
        )}
        {live.elapsed_seconds != null && (
          <><span className="text-muted">Elapsed</span><span className="text-primary">{formatElapsed(live.elapsed_seconds)}</span></>
        )}
        {live.log_bytes != null && live.log_bytes > 0 && (
          <><span className="text-muted">Output</span><span className="text-primary">{formatBytes(live.log_bytes)}</span></>
        )}
        {live.log_lines != null && live.log_lines > 0 && (
          <><span className="text-muted">Lines</span><span className="text-primary">{live.log_lines.toLocaleString()}</span></>
        )}
        {live.pid != null && (
          <><span className="text-muted">PID</span><span className="text-primary font-mono">{live.pid}</span></>
        )}
      </div>
      {live.activity_tail && live.activity_tail.length > 0 && (
        <div>
          <button
            onClick={() => setShowTail(!showTail)}
            className="text-[10px] text-muted hover:text-secondary transition-colors"
          >
            {showTail ? 'Hide' : 'Show'} activity tail ({live.activity_tail.length} lines)
          </button>
          {showTail && (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/40 px-3 py-2 text-[11px] text-green-300/80 font-mono leading-relaxed">
              {live.activity_tail.join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Research helpers ───────────────────────────────────────────

function isResearchTask(task: Task): boolean {
  return task.labels.some((l) => l === 'type:research' || l.startsWith('type:research-'));
}

function needsResearchTriage(task: Task): boolean {
  return task.status !== 'closed' && task.labels.includes('review:research');
}

function getResearchSubType(task: Task): string {
  const subType = task.labels.find((l) => l.startsWith('type:research-'));
  return subType ? subType.replace('type:research-', '') : 'general';
}

const RESEARCH_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  upgrade: {
    label: 'Upgrade Check',
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    icon: '\u2B06',
  },
  investigation: {
    label: 'Investigation',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    icon: '\u{1F50D}',
  },
  capability: {
    label: 'Capability Eval',
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    icon: '\u2699',
  },
  threat: {
    label: 'Threat Intel',
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
    icon: '\u26A0',
  },
  general: {
    label: 'Research',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    icon: '\u{1F4D6}',
  },
};

/** Parse the structured summary from task notes */
function parseResearchSummary(notes: string | undefined): {
  summaryBlock: string | null;
  signal: string | null;
  obsidianPath: string | null;
} {
  if (!notes) return { summaryBlock: null, signal: null, obsidianPath: null };

  // Extract the Research Summary section, stripping Signal/Obsidian metadata lines
  const summaryMatch = notes.match(/## Research Summary:[\s\S]*?(?=\n## (?!Research Summary)|$)/);
  let summaryBlock = summaryMatch ? summaryMatch[0].trim() : null;
  if (summaryBlock) {
    // Remove metadata lines that are rendered separately in the panel
    summaryBlock = summaryBlock
      .replace(/\*\*Signal\*\*:\s*(yes|no)\s*/gi, '')
      .replace(/\*\*Obsidian\*\*:\s*.+\s*/gi, '')
      .trim();
  }

  // Extract signal
  const signalMatch = notes.match(/\*\*Signal\*\*:\s*(yes|no)/i);
  const signal = signalMatch ? signalMatch[1].toLowerCase() : null;

  // Extract obsidian path
  const obsidianMatch = notes.match(/\*\*Obsidian\*\*:\s*(.+)/);
  const obsidianPath = obsidianMatch ? obsidianMatch[1].trim() : null;

  return { summaryBlock, signal, obsidianPath };
}

// ─── Research Output Panel ──────────────────────────────────────

function ResearchOutputPanel({ task }: { task: Task }) {
  const [followUpMode, setFollowUpMode] = useState<'more-research' | 'plan' | 'execute' | null>(
    null,
  );
  const [followUpTitle, setFollowUpTitle] = useState('');
  const [followUpDescription, setFollowUpDescription] = useState('');
  const closeMutation = useCloseTask(task.id);
  const createMutation = useCreateTask();

  const subType = getResearchSubType(task);
  const typeMeta = RESEARCH_TYPE_META[subType] || RESEARCH_TYPE_META.general;
  const { summaryBlock, signal, obsidianPath } = parseResearchSummary(task.notes ?? undefined);
  const waitingForTriage = needsResearchTriage(task);

  const obsidianUrl = obsidianPath
    ? `obsidian://open?vault=Obsidian&file=${encodeURIComponent(obsidianPath)}`
    : null;

  const handleNoted = () => {
    closeMutation.mutate({ reason: 'Research reviewed — noted, no action needed.' });
  };

  const handleCreateFollowUp = () => {
    if (!followUpTitle.trim()) return;

    const labels: string[] = [`source:dashboard`, `parent:${task.id}`, 'stage:intake'];

    if (followUpMode === 'more-research') {
      labels.push('type:research', `type:research-${subType}`);
    } else {
      // plan or execute — create as a regular task for David/Nexus
      labels.push('waiting:david');
      if (followUpMode === 'plan') labels.push('type:feature');
    }

    // Copy domain label from parent
    const domainLabel = task.labels.find((l) => l.startsWith('domain:'));
    if (domainLabel) labels.push(domainLabel);

    createMutation.mutate(
      {
        title: followUpTitle,
        description: `Follow-up from research: ${task.title} (${task.id})\n\n${followUpDescription}`,
        labels,
        priority: task.priority,
      },
      {
        onSuccess: () => {
          // Close the research task after creating follow-up
          closeMutation.mutate({
            reason: `Research triaged — created follow-up: ${followUpTitle}`,
          });
          setFollowUpMode(null);
          setFollowUpTitle('');
          setFollowUpDescription('');
        },
      },
    );
  };

  const isPending = closeMutation.isPending || createMutation.isPending;

  return (
    <div className="rounded-lg border border-purple-500/30 bg-purple-500/5">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between gap-3 border-b border-purple-500/20">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded border px-2 py-1 text-xs font-medium ${typeMeta.color}`}
          >
            {typeMeta.icon} {typeMeta.label}
          </span>
          {signal && (
            <span
              className={`text-xs font-medium ${signal === 'yes' ? 'text-amber-400' : 'text-green-400'}`}
            >
              {signal === 'yes' ? 'Actionable findings' : 'Informational — no action needed'}
            </span>
          )}
        </div>
        {obsidianUrl && (
          <a
            href={obsidianUrl}
            className="flex items-center gap-1.5 rounded border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            Open in Obsidian
          </a>
        )}
      </div>

      {/* Summary */}
      {summaryBlock && (
        <div className="px-5 py-4 text-sm text-secondary whitespace-pre-wrap leading-relaxed">
          {summaryBlock}
        </div>
      )}

      {/* Obsidian path */}
      {obsidianPath && (
        <div className="px-5 pb-3">
          <span className="text-xs text-faint">Source: </span>
          <span className="text-xs text-purple-300 font-mono">{obsidianPath}</span>
        </div>
      )}

      {/* Action buttons — only when waiting for triage */}
      {waitingForTriage && !followUpMode && (
        <div className="px-5 py-4 border-t border-purple-500/20 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-faint mr-1">Triage:</span>
          <button
            onClick={handleNoted}
            disabled={isPending}
            title="Acknowledge this research — no follow-up action needed. Closes the task as reviewed."
            className="rounded bg-slate-600/20 border border-slate-500/30 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600/30 transition-colors disabled:opacity-50"
          >
            Noted
          </button>
          <button
            onClick={() => {
              setFollowUpMode('more-research');
              setFollowUpTitle(
                `Research: Follow-up on ${task.title.replace(/^Research:\s*/i, '')}`,
              );
            }}
            disabled={isPending}
            title="Create a follow-up research task to dig deeper into these findings. Closes this task and links the new one."
            className="rounded bg-cyan-600/20 border border-cyan-500/30 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-600/30 transition-colors disabled:opacity-50"
          >
            More Research
          </button>
          <button
            onClick={() => {
              setFollowUpMode('plan');
              setFollowUpTitle('');
            }}
            disabled={isPending}
            title="Create a planning/feature task from these findings. The new task goes to AI Reviewer for design and scoping."
            className="rounded bg-indigo-600/20 border border-indigo-500/30 px-4 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-600/30 transition-colors disabled:opacity-50"
          >
            Plan It
          </button>
          <button
            onClick={() => {
              setFollowUpMode('execute');
              setFollowUpTitle('');
            }}
            disabled={isPending}
            title="Create an execution task — for straightforward actions that don't need a planning phase. Goes directly to AI Reviewer for implementation."
            className="rounded bg-green-600/20 border border-green-500/30 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-600/30 transition-colors disabled:opacity-50"
          >
            Execute
          </button>
        </div>
      )}

      {/* Follow-up creation form */}
      {followUpMode && (
        <div className="px-5 py-4 border-t border-purple-500/20 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-secondary">
              {followUpMode === 'more-research'
                ? 'Create follow-up research task'
                : followUpMode === 'plan'
                  ? 'Create project plan from findings'
                  : 'Create execution task from findings'}
            </span>
          </div>
          <input
            type="text"
            value={followUpTitle}
            onChange={(e) => setFollowUpTitle(e.target.value)}
            placeholder="Task title..."
            className="w-full rounded bg-surface-2 border border-subtle px-3 py-2 text-sm text-secondary placeholder-faint focus:border-accent-border focus:outline-none"
            autoFocus
          />
          <textarea
            value={followUpDescription}
            onChange={(e) => setFollowUpDescription(e.target.value)}
            placeholder={
              followUpMode === 'more-research'
                ? 'What specific question should the next research answer?'
                : followUpMode === 'plan'
                  ? 'What should the plan cover? Key objectives from the research...'
                  : 'What should be done? Steps from the research findings...'
            }
            rows={3}
            className="w-full rounded bg-surface-2 border border-subtle px-3 py-2 text-sm text-secondary placeholder-faint focus:border-accent-border focus:outline-none resize-none"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateFollowUp}
              disabled={isPending || !followUpTitle.trim()}
              className="rounded bg-accent-hover px-4 py-2 text-sm font-medium text-white hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Creating...' : 'Create & Close Research'}
            </button>
            <button
              onClick={() => {
                setFollowUpMode(null);
                setFollowUpTitle('');
                setFollowUpDescription('');
              }}
              className="rounded px-4 py-2 text-sm text-muted hover:text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Already triaged indicator */}
      {task.status === 'closed' && isResearchTask(task) && (
        <div className="px-5 py-3 border-t border-purple-500/20">
          <span className="text-xs text-green-400 font-medium">
            {'\u2714'} Research triaged{task.close_reason ? ` — ${task.close_reason}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: task, isLoading } = useTask(id);
  const { data: events } = useTaskEvents(id);
  const { data: backlinksData } = useObsidianBacklinks(id);
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'a' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setAskOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (isLoading) {
    return <div className="text-faint">Loading...</div>;
  }

  if (!task) {
    return <div className="text-faint">Task not found</div>;
  }

  const showResearchPanel =
    isResearchTask(task) &&
    (task.labels.includes('review:research') ||
      task.status === 'closed' ||
      (task.notes && task.notes.includes('## Research Summary')));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/tasks'))}
          className="text-sm text-muted hover:text-secondary"
        >
          &larr; Back
        </button>
        <div className="flex items-center gap-2">
          {id && (
            <button
              onClick={() => navigate(`/reo?task_id=${encodeURIComponent(id)}`)}
              className="flex items-center gap-1.5 rounded border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-xs font-medium text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/50 transition-colors"
              title="View this task's decision-event timeline in REO"
            >
              View in REO {'→'}
            </button>
          )}
          <button
            onClick={() => setAskOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-colors"
          >
            Ask a Question
            <kbd className="text-[10px] bg-surface-2 border border-subtle rounded px-1 py-0.5 text-faint font-mono ml-1">
              a
            </kbd>
          </button>
        </div>
      </div>

      {/* Ask panel */}
      {askOpen && id && <TaskAskPanel taskId={id} onClose={() => setAskOpen(false)} />}

      {/* Needs input banner — skip if research panel will handle it */}
      {task.status !== 'closed' &&
        task.labels.includes('waiting:david') &&
        !task.labels.includes('review:research') && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-amber-300">Waiting for your review</div>
              {task.question ? (
                <div className="text-sm text-amber-200 mt-1">{task.question}</div>
              ) : (
                <div className="text-xs text-amber-400/70 mt-0.5">
                  Research or processing completed — needs your input to proceed
                </div>
              )}
            </div>
          </div>
        )}

      {/* Research output panel — shown for all research tasks */}
      {showResearchPanel && <ResearchOutputPanel task={task} />}

      {id && <LiveExecutionPanel taskId={id} />}

      <PipelineApprovalCard task={task} />

      <TaskDetail task={task} />

      {/* Related Obsidian Notes */}
      {backlinksData && backlinksData.total > 0 && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5">
          <button
            onClick={() => setBacklinksOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-purple-400/60 font-medium">
                Obsidian
              </span>
              <span className="text-sm font-medium text-purple-300">Related Notes</span>
              <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-medium">
                {backlinksData.total}
              </span>
            </div>
            <span className="text-faint text-xs">{backlinksOpen ? '\u25B2' : '\u25BC'}</span>
          </button>

          {backlinksOpen && (
            <div className="px-4 pb-4 space-y-2">
              {backlinksData.backlinks.map((note, i) => (
                <div key={i} className="rounded border border-purple-500/10 bg-purple-500/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a
                        href={note.obsidianUrl}
                        className="text-sm font-medium text-purple-300 hover:text-purple-200 transition-colors"
                        title={`Open in Obsidian: ${note.path}`}
                      >
                        {note.title}
                      </a>
                      <p className="text-[11px] text-faint mt-0.5 truncate">{note.path}</p>
                      {note.snippet && (
                        <p className="text-xs text-muted mt-1 leading-relaxed">{note.snippet}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium text-muted mb-3">Event History</h2>
        <EventTimeline events={events ?? []} />
      </div>
    </div>
  );
}
