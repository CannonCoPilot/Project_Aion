import { useState, useMemo } from 'react';
import { useTaskJourney } from '../../api/nexus-ops';
import type { NexusOpsEvent } from '../../api/nexus-ops';
import { StageStepper } from './StageStepper';
import { EventCard } from './EventCard';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-accent/20 text-accent-text',
  in_progress: 'bg-amber-500/20 text-amber-400',
  done: 'bg-green-500/20 text-green-400',
  closed: 'bg-surface-muted/20 text-muted',
  blocked: 'bg-red-500/20 text-red-400',
};

const PRIORITY_DOTS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-accent-light',
  4: 'bg-surface-muted',
  5: 'bg-surface-muted',
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-red-500/20 text-red-400',
};

interface TaskJourneyPanelProps {
  taskId: string;
  onJobClick?: (job: string) => void;
  onClose: () => void;
}

export function TaskJourneyPanel({ taskId, onJobClick }: TaskJourneyPanelProps) {
  const { data, isLoading, isError } = useTaskJourney(taskId);
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());

  // All hooks MUST be above early returns to avoid React error #310
  const stages = useMemo(() => data?.stages ?? [], [data?.stages]);
  const journeyLog = useMemo(() => {
    const STAGE_NAMES = new Map<string, string>();
    const allEvents: (NexusOpsEvent & { stageName: string })[] = [];
    for (const stage of stages) {
      for (const event of stage.events) {
        if (!STAGE_NAMES.has(event.id)) {
          STAGE_NAMES.set(event.id, stage.name);
          allEvents.push({ ...event, stageName: stage.name });
        }
      }
    }
    allEvents.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
    return allEvents;
  }, [stages]);

  const toggleStage = (i: number) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-faint text-sm">Loading task journey...</div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Failed to load task journey for {taskId}.
        </div>
      </div>
    );
  }

  const { task, totalCost, totalDuration, relatedJobs, decisions } = data;

  const needsInput = task.labels.includes('waiting:david');
  const waitingLabel = task.labels.find((l) => l.startsWith('waiting:') && l !== 'waiting:david');

  return (
    <div className="space-y-6 p-4">
      {/* Needs input banner */}
      {needsInput && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-amber-300">Waiting for your review</div>
            <div className="text-xs text-amber-400/70 mt-0.5">
              Research or processing completed — needs your input to proceed
            </div>
          </div>
        </div>
      )}
      {!needsInput && waitingLabel && (
        <div className="rounded-lg border border-subtle bg-surface-2/50 px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
          <div className="text-sm text-muted">
            Waiting: <span className="text-tertiary">{waitingLabel.replace('waiting:', '')}</span>
          </div>
        </div>
      )}

      {/* Task header */}
      <div>
        <div className="flex items-start gap-2">
          <span
            className={`mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0 ${PRIORITY_DOTS[task.priority] ?? PRIORITY_DOTS[3]}`}
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-primary leading-tight">{task.title}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-xs font-mono text-faint">{task.id}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status] ?? STATUS_COLORS.open}`}
              >
                {task.status.replace('_', ' ')}
              </span>
            </div>
            {task.labels.length > 0 && (
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {task.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div className="text-xs text-disabled mt-1.5">
              Created{' '}
              {new Date(task.created).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Totals row */}
      <div className="flex items-center gap-4">
        {totalCost > 0 && (
          <div className="rounded-lg border border-default bg-surface-1 px-3 py-2">
            <div className="text-xs text-faint">Total Cost</div>
            <div className="text-sm font-medium text-green-400">${totalCost.toFixed(4)}</div>
          </div>
        )}
        {totalDuration > 0 && (
          <div className="rounded-lg border border-default bg-surface-1 px-3 py-2">
            <div className="text-xs text-faint">Total Duration</div>
            <div className="text-sm font-medium text-secondary">
              {formatDuration(totalDuration)}
            </div>
          </div>
        )}
      </div>

      {/* Stage stepper */}
      <div>
        <h3 className="text-xs text-faint uppercase tracking-wider mb-3">Pipeline</h3>
        <StageStepper stages={stages} currentStage={data.currentStage} />
      </div>

      {/* Chronological journey log */}
      {journeyLog.length > 0 && (
        <div>
          <h3 className="text-xs text-faint uppercase tracking-wider mb-3">Journey Log</h3>
          <div className="space-y-0">
            {journeyLog.map((event, i) => {
              const prevEvent = i > 0 ? journeyLog[i - 1] : null;
              const gap =
                prevEvent && event.timestamp && prevEvent.timestamp
                  ? Math.round(
                      (new Date(event.timestamp).getTime() -
                        new Date(prevEvent.timestamp).getTime()) /
                        1000,
                    )
                  : null;

              return (
                <div key={event.id}>
                  {/* Time gap indicator */}
                  {gap != null && gap > 60 && (
                    <div className="flex items-center gap-3 pl-[11px]">
                      <div className="w-px h-4 border-l border-dashed border-subtle" />
                      <span className="text-[10px] text-disabled italic">
                        {formatDuration(gap)} later
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-3 py-1.5">
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-surface-muted mt-1.5" />
                      {i < journeyLog.length - 1 && (
                        <div className="w-px h-full min-h-[16px] bg-surface-2 mt-0.5" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted font-medium">
                          {event.stageName}
                        </span>
                        {event.timestamp && (
                          <span className="text-[10px] text-disabled">
                            {new Date(event.timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            })}
                          </span>
                        )}
                        {event.persona && (
                          <span className="text-[10px] text-amber-400/60">{event.persona}</span>
                        )}
                      </div>
                      <div className="text-xs text-tertiary mt-0.5 leading-relaxed">
                        {event.summary}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Events per stage (collapsible) */}
      {stages.some((s) => s.events.length > 0) && (
        <div>
          <h3 className="text-xs text-faint uppercase tracking-wider mb-3">Events by Stage</h3>
          <div className="space-y-2">
            {stages.map((stage, i) => {
              if (stage.events.length === 0) return null;
              const isOpen = expandedStages.has(i);
              return (
                <div key={i} className="rounded-lg border border-default bg-surface-1/50">
                  <button
                    onClick={() => toggleStage(i)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-2/50 transition-colors rounded-lg"
                  >
                    <span className="text-sm text-tertiary">{stage.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-faint">
                        {stage.events.length} event{stage.events.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-disabled text-xs">{isOpen ? '\u25BC' : '\u25B6'}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2">
                      {stage.events.map((event) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          onTaskClick={() => {}} // Already viewing this task
                          onJobClick={onJobClick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Related jobs */}
      {relatedJobs.length > 0 && (
        <div>
          <h3 className="text-xs text-faint uppercase tracking-wider mb-3">Related Jobs</h3>
          <div className="flex flex-wrap gap-2">
            {relatedJobs.map((job) => (
              <button
                key={job}
                onClick={() => onJobClick?.(job)}
                className="rounded-full bg-purple-500/10 border border-purple-500/20 px-3 py-1 text-xs font-mono text-purple-400 hover:bg-purple-500/20 transition-colors"
              >
                {job}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Reviewer decisions */}
      {decisions.length > 0 && (
        <div>
          <h3 className="text-xs text-faint uppercase tracking-wider mb-3">AI Reviewer Decisions</h3>
          <div className="space-y-2">
            {decisions.map((d, i) => (
              <div key={i} className="rounded-lg border border-default bg-surface-1 px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-secondary">{d.action}</span>
                  {d.confidence != null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        d.confidence >= 0.8
                          ? 'bg-green-500/20 text-green-400'
                          : d.confidence >= 0.5
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {Math.round(d.confidence * 100)}%
                    </span>
                  )}
                  {d.risk && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLORS[d.risk] ?? RISK_COLORS.medium}`}
                    >
                      {d.risk} risk
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-disabled">
                    {new Date(d.timestamp).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </span>
                  {d.feedback && <span className="text-xs text-accent-text">{d.feedback}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}
