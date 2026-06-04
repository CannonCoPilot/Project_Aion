import type { TaskJourneyStage } from '../../api/nexus-ops';

// Maps stage: label suffixes to the STAGE_DEFS names used in event-correlator
const STAGE_LABEL_TO_NAME: Record<string, string> = {
  intake: 'created',
  evaluate: 'evaluated',
  route: 'investigated',
  review: 'reviewed',
  queue: 'approved',
  execute: 'executed',
};

interface StageStepperProps {
  stages: TaskJourneyStage[];
  currentStage?: string | null;
}

export function StageStepper({ stages, currentStage }: StageStepperProps) {
  // If the task carries an authoritative stage: label, use it to find the active step.
  // Otherwise fall back to inferring from event completion state.
  const stageName = currentStage ? STAGE_LABEL_TO_NAME[currentStage] : null;
  const labelActiveIndex = stageName ? stages.findIndex((s) => s.name === stageName) : -1;

  const lastCompletedIndex = stages.reduce((last, s, i) => (s.completed ? i : last), -1);
  const allCompleted = stages.every((s) => s.completed);
  const inferredActiveIndex = allCompleted
    ? -1
    : lastCompletedIndex + 1 < stages.length
      ? lastCompletedIndex + 1
      : -1;

  const activeIndex = labelActiveIndex !== -1 ? labelActiveIndex : inferredActiveIndex;

  return (
    <div className="space-y-0">
      {stages.map((stage, i) => {
        const isCompleted = stage.completed;
        const isActive = i === activeIndex;
        // Time gap between this stage and the previous one
        const gap =
          i > 0 && stage.timestamp && stages[i - 1].timestamp
            ? timeBetween(stages[i - 1].timestamp!, stage.timestamp)
            : null;

        return (
          <div key={i}>
            {/* Gap indicator */}
            {gap && (
              <div className="flex items-center gap-3 pl-[11px]">
                <div
                  className={`w-px h-6 ${isCompleted || isActive ? 'bg-surface-3' : 'border-l border-dashed border-subtle'}`}
                />
                <span className="text-[10px] text-disabled italic">{gap} later</span>
              </div>
            )}

            {/* Stage row */}
            <div className="flex items-start gap-3">
              {/* Circle */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    isCompleted
                      ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                      : isActive
                        ? 'bg-accent/20 text-accent-text border border-accent/40 animate-pulse'
                        : 'bg-surface-2 text-disabled border border-subtle'
                  }`}
                >
                  {isCompleted ? '\u2713' : i + 1}
                </div>
                {/* Connector line */}
                {i < stages.length - 1 && (
                  <div
                    className={`w-px h-4 mt-0.5 ${
                      isCompleted ? 'bg-green-500/30' : 'border-l border-dashed border-subtle'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-sm font-medium ${
                      isCompleted ? 'text-secondary' : isActive ? 'text-accent-text' : 'text-faint'
                    }`}
                  >
                    {stage.name}
                  </span>
                  {stage.actor && <span className="text-xs text-amber-400/70">{stage.actor}</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {stage.timestamp && (
                    <span className="text-xs text-faint">
                      {new Date(stage.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </span>
                  )}
                  {stage.duration != null && (
                    <span className="text-xs text-faint">{formatDuration(stage.duration)}</span>
                  )}
                  {stage.cost != null && stage.cost > 0 && (
                    <span className="text-xs text-green-400/70">${stage.cost.toFixed(4)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function timeBetween(a: string, b: string): string {
  const diff = Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 1000;
  return formatDuration(diff);
}
