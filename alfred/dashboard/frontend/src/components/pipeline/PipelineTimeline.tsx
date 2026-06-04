import { Link } from 'react-router-dom';
import { usePipelineEvents, type PipelineEvent } from '../../api/tasks';

const STAGE_ORDER = ['created', 'evaluated', 'approved', 'executing', 'completed'] as const;

function getPipelineStage(event: PipelineEvent): string {
  if (event.event_type === 'created') return 'created';
  if (event.event_type === 'closed') return 'completed';
  const comment = event.comment || '';
  if (comment.includes('pipeline:approved')) return 'approved';
  if (comment.includes('pipeline:needs-approval')) return 'needs-approval';
  if (comment.includes('capability:research')) return 'needs-research';
  if (comment.includes('stage:queue') || comment.includes('auto:ready')) return 'ready';
  if (comment.includes('stage:route') || comment.includes('auto:candidate')) return 'candidate';
  if (comment.includes('stage:evaluate')) return 'evaluated';
  if (comment.includes('waiting:david')) return 'waiting';
  if (event.event_type === 'status_changed' && event.new_value === 'in_progress') return 'executing';
  return event.event_type;
}

const STAGE_COLORS: Record<string, string> = {
  created: 'bg-surface-muted',
  evaluated: 'bg-accent',
  ready: 'bg-accent-light',
  candidate: 'bg-accent-text-light',
  'needs-approval': 'bg-amber-500',
  'needs-research': 'bg-purple-500',
  approved: 'bg-green-500',
  executing: 'bg-amber-400',
  completed: 'bg-green-600',
  paused: 'bg-red-400',
  escalated: 'bg-red-600',
  waiting: 'bg-amber-600',
};

const STAGE_LABELS: Record<string, string> = {
  created: 'Created',
  evaluated: 'Evaluated',
  ready: 'Ready',
  candidate: 'Candidate',
  'needs-approval': 'Needs Approval',
  'needs-research': 'Needs Research',
  approved: 'Approved',
  executing: 'Executing',
  completed: 'Completed',
  paused: 'Paused',
  escalated: 'Escalated',
  waiting: 'Waiting: David',
};

function formatTimeAgo(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function PipelineTimeline() {
  const { data: events, isLoading } = usePipelineEvents(200);

  if (isLoading) return <div className="text-faint py-4 text-center">Loading pipeline events...</div>;
  if (!events || events.length === 0) return <div className="text-disabled py-4 text-center">No pipeline events yet</div>;

  // Group events by task
  const taskGroups = new Map<string, { title: string; events: (PipelineEvent & { stage: string })[] }>();
  for (const event of events) {
    const stage = getPipelineStage(event);
    const key = event.issue_id;
    if (!taskGroups.has(key)) {
      taskGroups.set(key, { title: event.task_title, events: [] });
    }
    taskGroups.get(key)!.events.push({ ...event, stage });
  }

  // Count stage occurrences for summary
  const stageCounts: Record<string, number> = {};
  for (const event of events) {
    const stage = getPipelineStage(event);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }

  return (
    <div className="space-y-4">
      {/* Stage summary bar */}
      <div className="flex flex-wrap gap-2">
        {STAGE_ORDER.map(s => {
          const count = stageCounts[s] || 0;
          if (count === 0) return null;
          const color = STAGE_COLORS[s] || 'bg-surface-muted';
          return (
            <span key={s} className="flex items-center gap-1.5 text-xs text-tertiary">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              {STAGE_LABELS[s] || s}: {count}
            </span>
          );
        })}
      </div>

      {/* Event list */}
      <div className="space-y-0">
        {events.slice(0, 100).map(event => {
          const stage = getPipelineStage(event);
          const color = STAGE_COLORS[stage] || 'bg-surface-muted';
          const label = STAGE_LABELS[stage] || stage;

          return (
            <div key={event.id} className="flex items-start gap-3 py-2 border-l-2 border-default pl-4 relative hover:bg-surface-1/30">
              <span className={`absolute -left-1.5 top-3 w-3 h-3 rounded-full ${color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${color}/20 text-secondary`}>
                    {label}
                  </span>
                  <Link
                    to={`/tasks/${event.issue_id}`}
                    className="text-sm text-secondary hover:text-accent-text truncate"
                  >
                    {event.task_title}
                  </Link>
                </div>
                {event.comment && (
                  <p className="text-xs text-faint mt-0.5 truncate">{event.comment}</p>
                )}
                <div className="flex gap-2 text-xs text-disabled mt-0.5">
                  <span>{formatTimeAgo(event.created_at)}</span>
                  {event.actor && <span>by {event.actor}</span>}
                  <span className="text-ghost">|</span>
                  <span>{event.issue_id}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
