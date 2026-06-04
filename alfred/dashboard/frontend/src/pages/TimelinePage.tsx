import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { useTimeline, useJobHistory, type TimelineJob, type JobHistoryEvent } from '../api/timeline';
import { PipelineTimeline } from '../components/pipeline/PipelineTimeline';

const SCHEDULE_COLORS: Record<string, string> = {
  interval: 'bg-accent',
  daily: 'bg-purple-500',
  weekly: 'bg-teal-500',
  on_demand: 'bg-surface-muted',
};

function formatTimeUntil(isoStr: string | null): string {
  if (!isoStr) return '-';
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs < 0) return 'overdue';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  const days = Math.floor(hrs / 24);
  return `${days}d ${hrs % 24}h`;
}

function formatTimeAgo(isoStr: string | null): string {
  if (!isoStr) return 'never';
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function TimelineBar({ job }: { job: TimelineJob }) {
  // Calculate position on 24-hour bar
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const dayMs = dayEnd.getTime() - dayStart.getTime();

  const lastRunPct = job.lastRun
    ? Math.max(0, Math.min(100, ((new Date(job.lastRun).getTime() - dayStart.getTime()) / dayMs) * 100))
    : null;

  const nextRunPct = job.nextRun
    ? Math.max(0, Math.min(100, ((new Date(job.nextRun).getTime() - dayStart.getTime()) / dayMs) * 100))
    : null;

  const nowPct = ((now.getTime() - dayStart.getTime()) / dayMs) * 100;
  const barColor = SCHEDULE_COLORS[job.schedule.type] ?? 'bg-surface-muted';

  return (
    <div className="relative h-3 rounded-full bg-surface-2 overflow-hidden">
      {/* Now marker */}
      <div
        className="absolute top-0 bottom-0 w-px bg-white/30 z-10"
        style={{ left: `${nowPct}%` }}
      />

      {/* Last run marker */}
      {lastRunPct !== null && lastRunPct >= 0 && lastRunPct <= 100 && (
        <div
          className={`absolute top-0.5 w-2 h-2 rounded-full ${barColor} z-20`}
          style={{ left: `${lastRunPct}%`, transform: 'translateX(-50%)' }}
          title={`Last: ${job.lastRun}`}
        />
      )}

      {/* Next run marker */}
      {nextRunPct !== null && nextRunPct >= 0 && nextRunPct <= 100 && (
        <div
          className={`absolute top-0.5 w-2 h-2 rounded-full ${barColor} opacity-40 ring-1 ring-white/20 z-20`}
          style={{ left: `${nextRunPct}%`, transform: 'translateX(-50%)' }}
          title={`Next: ${job.nextRun}`}
        />
      )}
    </div>
  );
}

function JobHistoryPanel({ jobName }: { jobName: string }) {
  const { data: events, isLoading } = useJobHistory(jobName);

  if (isLoading) return <div className="text-faint text-xs py-2">Loading history...</div>;
  if (!events || events.length === 0) return <div className="text-disabled text-xs py-2">No execution history</div>;

  return (
    <div className="space-y-1 mt-2">
      {events.slice(0, 10).map((e: JobHistoryEvent) => (
        <div key={e.id} className="flex items-center gap-3 text-xs py-1 px-2 rounded hover:bg-surface-2/50">
          <span className={`w-1.5 h-1.5 rounded-full ${
            e.type === 'job_completed' ? 'bg-green-500' : e.type === 'job_failed' ? 'bg-red-500' : 'bg-surface-muted'
          }`} />
          <span className="text-muted w-28 shrink-0">{formatTimeAgo(e.timestamp)}</span>
          {e.duration != null && (
            <span className="text-faint w-12 shrink-0 text-right">{e.duration}s</span>
          )}
          {e.cost != null && (
            <span className="text-faint w-16 shrink-0 text-right">${e.cost.toFixed(3)}</span>
          )}
          <span className="text-muted truncate">{e.summary ?? ''}</span>
        </div>
      ))}
    </div>
  );
}

export default function TimelinePage() {
  const { data: jobs, isLoading, isError } = useTimeline();
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [tab, setTab] = useState<'jobs' | 'pipeline'>('jobs');

  const filteredJobs = jobs?.filter(j => {
    if (filter === 'all') return true;
    if (filter === 'scheduled') return j.schedule.type !== 'on_demand';
    if (filter === 'on_demand') return j.schedule.type === 'on_demand';
    return j.schedule.type === filter;
  }) ?? [];

  // Hour markers for the timeline
  const hours = [0, 3, 6, 9, 12, 15, 18, 21];

  return (
    <div className="space-y-4">
      <Header title="Timeline" />

      {/* Tab switcher */}
      <div className="flex items-center gap-1 border-b border-default pb-0">
        <button
          onClick={() => setTab('jobs')}
          className={`px-3 py-1.5 text-sm rounded-t transition-colors ${tab === 'jobs' ? 'bg-surface-2 text-secondary border-b-2 border-accent-border' : 'text-faint hover:text-tertiary'}`}
        >
          Jobs
        </button>
        <button
          onClick={() => setTab('pipeline')}
          className={`px-3 py-1.5 text-sm rounded-t transition-colors ${tab === 'pipeline' ? 'bg-surface-2 text-secondary border-b-2 border-accent-border' : 'text-faint hover:text-tertiary'}`}
        >
          Pipeline
        </button>
      </div>

      {tab === 'pipeline' && <PipelineTimeline />}

      {tab === 'jobs' && <>
      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
        >
          <option value="all">All Jobs ({jobs?.length ?? 0})</option>
          <option value="scheduled">Scheduled Only</option>
          <option value="interval">Interval</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="on_demand">On Demand</option>
        </select>
        <span className="text-xs text-disabled">Auto-refreshes every 30s</span>
      </div>

      {isLoading && <div className="text-faint py-8 text-center">Loading timeline...</div>}
      {isError && <div className="text-red-400 py-8 text-center">Failed to load timeline.</div>}

      {/* 24h timeline header */}
      <div className="relative ml-72 mr-4 h-5 border-b border-default">
        {hours.map(h => (
          <div
            key={h}
            className="absolute text-[10px] text-disabled -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h}:00
          </div>
        ))}
        {/* Now line label */}
        <div
          className="absolute text-[10px] text-accent-text -translate-x-1/2 font-medium"
          style={{ left: `${((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * 100}%`, top: '-2px' }}
        >
          now
        </div>
      </div>

      {/* Job rows */}
      <div className="space-y-0.5">
        {filteredJobs.map(job => {
          const barColor = SCHEDULE_COLORS[job.schedule.type] ?? 'bg-surface-muted';
          const isExpanded = expandedJob === job.name;

          return (
            <div key={job.name}>
              <div
                className="flex items-center gap-3 py-2 px-2 rounded hover:bg-surface-1/50 cursor-pointer transition-colors"
                onClick={() => setExpandedJob(isExpanded ? null : job.name)}
              >
                {/* Job info */}
                <div className="w-68 shrink-0 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${barColor}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-secondary truncate">{job.name}</div>
                    <div className="flex items-center gap-2 text-[10px] text-faint">
                      <span>{job.scheduleDisplay}</span>
                      <span className="text-ghost">|</span>
                      <span>{job.persona}</span>
                    </div>
                  </div>
                </div>

                {/* 24h bar */}
                <div className="flex-1">
                  <TimelineBar job={job} />
                </div>

                {/* Timing info */}
                <div className="w-28 shrink-0 text-right">
                  <div className="text-xs text-muted">{formatTimeAgo(job.lastRun)}</div>
                  <div className="text-[10px] text-disabled">
                    next: {formatTimeUntil(job.nextRun)}
                  </div>
                </div>
              </div>

              {/* Expanded history */}
              {isExpanded && (
                <div className="ml-4 mb-2 rounded-lg border border-default bg-surface-1/50 p-3">
                  <div className="text-xs text-muted mb-2">{job.description}</div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <div>
                      <span className="text-disabled">Engine: </span>
                      <span className="text-tertiary">{job.engine ?? 'claude-code'}</span>
                    </div>
                    {job.maxBudget && (
                      <div>
                        <span className="text-disabled">Budget: </span>
                        <span className="text-tertiary">${job.maxBudget}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-disabled">Type: </span>
                      <span className="text-tertiary">{job.schedule.type}</span>
                    </div>
                  </div>
                  <h5 className="text-xs font-medium text-faint mb-1">Recent Executions</h5>
                  <JobHistoryPanel jobName={job.name} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}
