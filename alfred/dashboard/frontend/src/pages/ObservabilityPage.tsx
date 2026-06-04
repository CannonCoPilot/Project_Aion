import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  usePAIHealth,
  usePAIStats,
  usePAIRecentEvents,
  type HookEvent,
  type PAIStats,
} from '../api/pai-observability';
import {
  useNexusLogs,
  useNexusStats,
  useNexusIssues,
  useNexusExecutions,
  type NexusLogEntry,
  type NexusExecution,
} from '../api/nexus-logs';

// --- Helpers ---

function formatTimeAgo(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function truncateSessionId(id: string): string {
  if (id.length <= 12) return id;
  return id.slice(0, 8) + '\u2026';
}

function eventTypeColor(type: string): { bg: string; text: string } {
  if (type === 'tool_execution') return { bg: 'bg-accent/20', text: 'text-accent-text' };
  if (type === 'agent_start' || type === 'agent_end')
    return { bg: 'bg-purple-500/20', text: 'text-purple-400' };
  if (type === 'error') return { bg: 'bg-red-500/20', text: 'text-red-400' };
  if (type === 'notification') return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
  return { bg: 'bg-surface-muted/20', text: 'text-muted' };
}

// --- Stat card (matches Pipeline page pattern) ---

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <p className="text-xs text-faint uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className={`text-2xl font-bold ${color}`}>{value}</span>
      </div>
      {sub && <div className="mt-1 text-xs text-faint">{sub}</div>}
    </div>
  );
}

// --- Offline banner ---

function OfflineBanner() {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="text-sm font-semibold text-red-400">PAI Observability is offline</span>
      </div>
      <p className="text-xs text-faint">
        The PAI backend on port 4000 is not reachable. Start it to see hook event telemetry.
      </p>
    </div>
  );
}

// --- Complexity dots ---

function ComplexityDots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" title={`Complexity: ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i <= level
              ? level >= 4
                ? 'bg-amber-400'
                : level >= 2
                  ? 'bg-accent-light'
                  : 'bg-surface-muted'
              : 'bg-surface-3'
          }`}
        />
      ))}
    </span>
  );
}

// --- Context badge (task/orchestration) ---

function ContextBadge({ event }: { event: HookEvent }) {
  if (event.task_id) {
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-mono">
        {event.task_id}
      </span>
    );
  }
  if (event.orchestration_id) {
    return (
      <span
        className="inline-block text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono truncate max-w-[140px]"
        title={event.orchestration_id}
      >
        {event.orchestration_id}
      </span>
    );
  }
  if (event.orchestration_action) {
    return (
      <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
        proj:{event.orchestration_action}
      </span>
    );
  }
  return <span className="text-disabled">--</span>;
}

// --- Event row ---

function EventRow({ event }: { event: HookEvent }) {
  const [expanded, setExpanded] = useState(false);
  const tc = eventTypeColor(event.hook_event_type);
  const hasDetail = event.patterns?.length || event.payload.tool_input;

  return (
    <>
      <tr
        className={`hover:bg-surface-1/50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5 text-muted whitespace-nowrap">
          {hasDetail && (
            <span className="inline-block w-4 text-disabled text-xs">{expanded ? '▾' : '▸'}</span>
          )}
          {formatTimeAgo(event.timestamp)}
        </td>
        <td className="px-4 py-2.5">
          <span className="font-mono text-xs text-muted cursor-help" title={event.session_id}>
            {truncateSessionId(event.session_id)}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${tc.bg} ${tc.text}`}>
            {event.hook_event_type}
          </span>
        </td>
        <td className="px-4 py-2.5 text-tertiary">{event.payload.tool_name ?? '--'}</td>
        <td className="px-4 py-2.5">
          <ContextBadge event={event} />
        </td>
        <td className="px-4 py-2.5">
          <ComplexityDots level={event.payload.complexity ?? 1} />
        </td>
        <td className="px-4 py-2.5 text-muted">{event.source_app}</td>
      </tr>
      {expanded && (
        <tr className="bg-surface-1/30">
          <td colSpan={7} className="px-6 py-3">
            <div className="flex flex-wrap gap-4 text-xs">
              {event.patterns && event.patterns.length > 0 && (
                <div>
                  <span className="text-faint mr-2">Patterns:</span>
                  {event.patterns.map((p) => (
                    <span
                      key={p}
                      className="inline-block mr-1.5 mb-1 px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-400"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
              {event.payload.agent_type && event.payload.agent_type !== 'main' && (
                <div>
                  <span className="text-faint mr-1">Agent:</span>
                  <span className="text-purple-400">{event.payload.agent_type}</span>
                </div>
              )}
              {event.payload.tool_input && (
                <div className="w-full">
                  <span className="text-faint mr-1">Input:</span>
                  <pre className="mt-1 text-muted bg-surface-base rounded p-2 overflow-x-auto max-h-40 text-xs">
                    {JSON.stringify(event.payload.tool_input, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// --- Filter bar for Recent Events ---

function FilterBar({
  events,
  typeFilter,
  sourceFilter,
  onTypeChange,
  onSourceChange,
}: {
  events: HookEvent[];
  typeFilter: string;
  sourceFilter: string;
  onTypeChange: (v: string) => void;
  onSourceChange: (v: string) => void;
}) {
  const eventTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of events) types.add(e.hook_event_type);
    return Array.from(types).sort();
  }, [events]);

  const sourceApps = useMemo(() => {
    const apps = new Set<string>();
    for (const e of events) apps.add(e.source_app);
    return Array.from(apps).sort();
  }, [events]);

  return (
    <div className="flex items-center gap-3">
      <select
        value={typeFilter}
        onChange={(e) => onTypeChange(e.target.value)}
        className="bg-surface-1 border border-subtle rounded px-2 py-1.5 text-sm text-tertiary focus:outline-none focus:border-accent-border"
      >
        <option value="">All types</option>
        {eventTypes.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        value={sourceFilter}
        onChange={(e) => onSourceChange(e.target.value)}
        className="bg-surface-1 border border-subtle rounded px-2 py-1.5 text-sm text-tertiary focus:outline-none focus:border-accent-border"
      >
        <option value="">All sources</option>
        {sourceApps.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      {(typeFilter || sourceFilter) && (
        <button
          onClick={() => {
            onTypeChange('');
            onSourceChange('');
          }}
          className="text-xs text-faint hover:text-tertiary transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// --- Recent Events tab ---

function RecentEventsTab({
  events,
  stats,
  isLoading,
}: {
  events: HookEvent[] | undefined;
  stats: PAIStats | undefined;
  isLoading: boolean;
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  const totalEvents = events?.length ?? 0;
  const activeSessions =
    stats?.active_sessions?.length ??
    (stats?.by_session ? Object.keys(stats.by_session).length : 0);
  const toolMap = stats?.events_by_tool ?? stats?.by_tool;
  const mostActiveTool = toolMap
    ? (Object.entries(toolMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '--')
    : '--';
  const eventRate = totalEvents > 0 ? (totalEvents / 60).toFixed(1) : '0';

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (typeFilter && e.hook_event_type !== typeFilter) return false;
      if (sourceFilter && e.source_app !== sourceFilter) return false;
      return true;
    });
  }, [events, typeFilter, sourceFilter]);

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Events (1h)"
          value={totalEvents}
          color="text-accent-text"
          sub="Last hour"
        />
        <StatCard
          label="Active Sessions"
          value={activeSessions}
          color="text-green-400"
          sub="Unique sessions"
        />
        <StatCard
          label="Top Tool"
          value={
            <span className="text-lg truncate max-w-[120px] inline-block align-bottom">
              {mostActiveTool}
            </span>
          }
          color="text-purple-400"
          sub="Most used"
        />
        <StatCard
          label="Event Rate"
          value={`${eventRate}/m`}
          color="text-amber-400"
          sub="Events per minute"
        />
      </div>

      {/* Filter bar */}
      {events && events.length > 0 && (
        <FilterBar
          events={events}
          typeFilter={typeFilter}
          sourceFilter={sourceFilter}
          onTypeChange={setTypeFilter}
          onSourceChange={setSourceFilter}
        />
      )}

      {/* Event feed */}
      <div className="rounded-lg border border-default bg-transparent">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default">
          <h3 className="text-sm font-semibold text-secondary">Recent Events</h3>
          <span className="text-xs text-faint">
            {filteredEvents.length}
            {filteredEvents.length !== totalEvents ? ` / ${totalEvents}` : ''} events
          </span>
        </div>

        {isLoading ? (
          <div className="text-faint py-8 text-center text-sm">Loading events...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-faint py-8 text-center text-sm">
            {totalEvents === 0
              ? 'No events in the last hour'
              : 'No events match the current filters'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">When</th>
                  <th className="text-left px-4 py-2.5 font-medium">Session</th>
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tool</th>
                  <th className="text-left px-4 py-2.5 font-medium">Context</th>
                  <th className="text-left px-4 py-2.5 font-medium">Cplx</th>
                  <th className="text-left px-4 py-2.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default/50">
                {filteredEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Live Dashboard (embedded PAI) ---

function LiveDashboardTab() {
  const paiUrl = '/pai/';

  return (
    <div className="-mx-4 md:-mx-6 -mb-4 md:-mb-6" style={{ height: 'calc(100vh - 160px)' }}>
      <div className="text-xs text-faint mb-2 px-1">
        Embedded PAI Dashboard (external application)
      </div>
      <iframe
        src={paiUrl}
        className="w-full h-full border-0"
        title="PAI Observability Dashboard"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

// --- Nexus helpers ---

function nexusLevelColor(level: string): { bg: string; text: string } {
  const l = level.toLowerCase();
  if (l === 'error') return { bg: 'bg-red-500/20', text: 'text-red-400' };
  if (l === 'warn' || l === 'warning') return { bg: 'bg-amber-500/20', text: 'text-amber-400' };
  return { bg: 'bg-surface-muted/20', text: 'text-muted' };
}

function nexusComponentColor(component: string): string {
  if (component === 'dispatcher') return 'text-accent-text';
  if (component === 'executor') return 'text-purple-400';
  if (component === 'relay') return 'text-cyan-400';
  if (component === 'watchdog') return 'text-amber-400';
  return 'text-muted';
}

function NexusLogRow({ entry }: { entry: NexusLogEntry }) {
  const lc = nexusLevelColor(entry.level);
  return (
    <tr className="hover:bg-surface-1/50 transition-colors">
      <td className="px-4 py-2 text-muted whitespace-nowrap text-xs">
        {formatTimeAgo(entry.timestamp)}
      </td>
      <td className="px-4 py-2">
        <span className={`inline-block text-xs px-1.5 py-0.5 rounded ${lc.bg} ${lc.text}`}>
          {entry.level}
        </span>
      </td>
      <td className={`px-4 py-2 text-xs font-medium ${nexusComponentColor(entry.component)}`}>
        {entry.component}
      </td>
      <td className="px-4 py-2 text-xs">
        <span className="font-mono text-indigo-300">{entry.job}</span>
      </td>
      <td className="px-4 py-2 text-xs text-tertiary max-w-md truncate" title={entry.msg}>
        {entry.msg}
      </td>
      <td className="px-4 py-2 text-xs">
        {entry.status && (
          <span
            className={`px-1.5 py-0.5 rounded ${
              entry.status === 'ok'
                ? 'bg-green-500/20 text-green-400'
                : entry.status === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-surface-muted/20 text-muted'
            }`}
          >
            {entry.status}
          </span>
        )}
      </td>
    </tr>
  );
}

function NexusJobCard({
  job,
  lastSeen,
  status,
}: {
  job: string;
  lastSeen: number;
  status?: string;
}) {
  const ago = formatTimeAgo(lastSeen);
  // eslint-disable-next-line react-hooks/purity -- timestamp comparison is intentionally impure
  const isRecent = Date.now() - lastSeen < 3600000;
  return (
    <div className="flex items-center justify-between rounded-lg border border-default bg-surface-1 px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${isRecent ? 'bg-green-500' : 'bg-surface-muted'}`}
        />
        <span className="text-sm font-mono text-secondary">{job}</span>
      </div>
      <div className="flex items-center gap-2">
        {status && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              status === 'ok'
                ? 'bg-green-500/20 text-green-400'
                : status === 'error'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-surface-muted/20 text-muted'
            }`}
          >
            {status}
          </span>
        )}
        <span className="text-xs text-faint">{ago}</span>
      </div>
    </div>
  );
}

// --- Nexus tab ---

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function ExecutionCard({ exec }: { exec: NexusExecution }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
        exec.isError ? 'border-red-500/30 bg-red-500/5' : 'border-default bg-surface-1'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${exec.isError ? 'bg-red-500' : 'bg-green-500'}`}
          />
          <span className="text-sm font-mono text-secondary">{exec.job}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-faint">
          <span>{formatDuration(exec.durationMs)}</span>
          <span>${exec.cost.toFixed(2)}</span>
          <span>{exec.date.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')}</span>
        </div>
      </div>
      {exec.taskIds.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {exec.taskIds.map((id) => (
            <span
              key={id}
              className="inline-block text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-mono"
            >
              {id}
            </span>
          ))}
        </div>
      )}
      {expanded && (
        <pre className="mt-2 text-xs text-muted bg-surface-base rounded p-2 overflow-x-auto max-h-48 whitespace-pre-wrap">
          {exec.resultPreview}
        </pre>
      )}
    </div>
  );
}

function NexusTab() {
  const queryClient = useQueryClient();
  const [jobFilter, setJobFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [timeRange, setTimeRange] = useState(3600000); // 1h default

  const {
    data: logs,
    isLoading,
    isFetching,
  } = useNexusLogs({
    limit: 300,
    since: timeRange,
    level: levelFilter || undefined,
    job: jobFilter || undefined,
  });
  const { data: stats } = useNexusStats(86400000); // 24h stats
  const { data: issues } = useNexusIssues(86400000);
  const { data: executions } = useNexusExecutions(20);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['nexus-logs'] });
    queryClient.invalidateQueries({ queryKey: ['nexus-stats'] });
    queryClient.invalidateQueries({ queryKey: ['nexus-issues'] });
    queryClient.invalidateQueries({ queryKey: ['nexus-executions'] });
  };

  const jobs = useMemo(() => {
    if (!logs) return [];
    const set = new Set<string>();
    for (const e of logs) set.add(e.job);
    return Array.from(set).sort();
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-tertiary">Nexus Operations</h3>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            isFetching
              ? 'border-subtle text-disabled cursor-wait'
              : 'border-subtle text-muted hover:text-secondary hover:border-b-muted'
          }`}
        >
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Logs (24h)"
          value={stats?.totalLogs ?? '--'}
          color="text-accent-text"
          sub="Total entries"
        />
        <StatCard
          label="Errors"
          value={stats?.errorCount ?? 0}
          color={stats?.errorCount ? 'text-red-400' : 'text-green-400'}
          sub="Last 24h"
        />
        <StatCard
          label="Warnings"
          value={stats?.warnCount ?? 0}
          color={stats?.warnCount ? 'text-amber-400' : 'text-green-400'}
          sub="Last 24h"
        />
        <StatCard
          label="Components"
          value={stats ? Object.keys(stats.byComponent).length : '--'}
          color="text-purple-400"
          sub="Active"
        />
        <StatCard
          label="Jobs"
          value={stats ? Object.keys(stats.byJob).length : '--'}
          color="text-indigo-400"
          sub="Seen in 24h"
        />
      </div>

      {/* Recent jobs grid */}
      {stats && stats.recentJobs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-tertiary mb-2">Recent Job Executions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {stats.recentJobs
              .filter((j) => j.job !== 'dispatcher' && j.job !== 'executor')
              .slice(0, 9)
              .map((j) => (
                <NexusJobCard key={j.job} {...j} />
              ))}
          </div>
        </div>
      )}

      {/* Issues (errors/warnings) */}
      {issues && issues.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-2">
            Issues (24h): {issues.length} warnings/errors
          </h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {issues.slice(0, 10).map((e, i) => {
              const lc = nexusLevelColor(e.level);
              return (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-faint whitespace-nowrap">{formatTimeAgo(e.timestamp)}</span>
                  <span className={`px-1 py-0.5 rounded ${lc.bg} ${lc.text}`}>{e.level}</span>
                  <span className="font-mono text-indigo-300">{e.job}</span>
                  <span className="text-muted truncate">{e.msg}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent executions with task IDs */}
      {executions && executions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-tertiary mb-2">Recent Executions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {executions.slice(0, 10).map((exec) => (
              <ExecutionCard key={exec.file} exec={exec} />
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(Number(e.target.value))}
          className="bg-surface-1 border border-subtle rounded px-2 py-1.5 text-sm text-tertiary focus:outline-none focus:border-accent-border"
        >
          <option value={3600000}>Last 1h</option>
          <option value={21600000}>Last 6h</option>
          <option value={86400000}>Last 24h</option>
          <option value={604800000}>Last 7d</option>
        </select>

        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="bg-surface-1 border border-subtle rounded px-2 py-1.5 text-sm text-tertiary focus:outline-none focus:border-accent-border"
        >
          <option value="">All levels</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
        </select>

        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          className="bg-surface-1 border border-subtle rounded px-2 py-1.5 text-sm text-tertiary focus:outline-none focus:border-accent-border"
        >
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j} value={j}>
              {j}
            </option>
          ))}
        </select>

        {(levelFilter || jobFilter) && (
          <button
            onClick={() => {
              setLevelFilter('');
              setJobFilter('');
            }}
            className="text-xs text-faint hover:text-tertiary transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Log table */}
      <div className="rounded-lg border border-default bg-transparent">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default">
          <h3 className="text-sm font-semibold text-secondary">Nexus Logs</h3>
          <span className="text-xs text-faint">{logs?.length ?? 0} entries</span>
        </div>

        {isLoading ? (
          <div className="text-faint py-8 text-center text-sm">Loading Nexus logs...</div>
        ) : !logs || logs.length === 0 ? (
          <div className="text-faint py-8 text-center text-sm">No logs in selected time range</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">When</th>
                  <th className="text-left px-4 py-2.5 font-medium">Level</th>
                  <th className="text-left px-4 py-2.5 font-medium">Component</th>
                  <th className="text-left px-4 py-2.5 font-medium">Job</th>
                  <th className="text-left px-4 py-2.5 font-medium">Message</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default/50">
                {logs.map((entry, i) => (
                  <NexusLogRow key={`${entry.timestamp}-${i}`} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Tab types ---

type TabId = 'events' | 'live' | 'nexus';

const TABS: { id: TabId; label: string }[] = [
  { id: 'live', label: 'Live Dashboard' },
  { id: 'events', label: 'Recent Events' },
  { id: 'nexus', label: 'Nexus Logs' },
];

// --- Main page ---

export default function ObservabilityPage() {
  const [params, setParams] = useSearchParams();
  const { isError: healthError } = usePAIHealth();
  const { data: stats } = usePAIStats();
  const { data: events, isLoading } = usePAIRecentEvents();

  const isOffline = healthError;

  const rawTab = params.get('tab');
  const activeTab: TabId =
    rawTab === 'live'
      ? 'live'
      : rawTab === 'events'
        ? 'events'
        : rawTab === 'nexus'
          ? 'nexus'
          : 'live';

  const setTab = (id: TabId) => {
    if (id === 'live') {
      setParams({}, { replace: true });
    } else {
      setParams({ tab: id }, { replace: true });
    }
  };

  return (
    <div className={activeTab === 'live' ? '' : 'space-y-6 max-w-5xl mx-auto'}>
      {/* Header */}
      <div className={`flex items-start justify-between ${activeTab === 'live' ? 'mb-4' : ''}`}>
        <div>
          <h1 className="text-xl font-bold text-primary">Observability</h1>
          <p className="text-sm text-faint mt-1">Claude Code hook event telemetry from PAI</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isOffline ? 'bg-red-500' : 'bg-green-500'}`} />
          <span className={`text-xs ${isOffline ? 'text-red-400' : 'text-green-400'}`}>
            {isOffline ? 'Offline' : 'Connected'}
          </span>
        </div>
      </div>

      {/* Tab bar — always show (Nexus tab works without PAI) */}
      <div
        className={`flex items-center gap-4 border-b border-default pb-1 ${activeTab === 'live' ? 'mb-0' : ''}`}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`text-sm pb-2 border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-accent-border text-accent-text'
                : 'border-transparent text-faint hover:text-tertiary'
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Offline state — only for PAI tabs */}
      {isOffline && activeTab !== 'nexus' && <OfflineBanner />}

      {/* Tab content */}
      {activeTab === 'nexus' && <NexusTab />}
      {!isOffline && (
        <>
          {activeTab === 'live' && <LiveDashboardTab />}
          {activeTab === 'events' && (
            <RecentEventsTab events={events} stats={stats} isLoading={isLoading} />
          )}
        </>
      )}

      {activeTab !== 'live' && (
        <p className="text-xs text-disabled text-center">Auto-refreshes every 10s</p>
      )}
    </div>
  );
}
