import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import {
  useRecurringJobs,
  useToggleJob,
  useRunJob,
  useJobLogs,
  useJobWorkflow,
  useUpdateWorkflow,
  useCreateJob,
  useDeleteJob,
  useResetOverride,
  useUpdateJobSchedule,
  usePersonas,
  useWorkflowAssist,
} from '../api/recurring-jobs';
import type { RecurringJob, ExecutionLogEntry } from '../api/recurring-jobs';

type SourceFilter = 'all' | 'nexus' | 'cron' | 'systemd';
type HealthFilter = 'all' | 'healthy' | 'warning' | 'failing';
type DetailTab = 'overview' | 'workflow' | 'history';

function HealthDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    failing: 'bg-red-500',
    unknown: 'bg-gray-500',
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || colors.unknown}`} />
  );
}

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    nexus: 'bg-accent/20 text-accent-text',
    cron: 'bg-blue-500/20 text-blue-300',
    systemd: 'bg-purple-500/20 text-purple-300',
  };
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${styles[source] || 'bg-surface-2 text-muted'}`}
    >
      {source.toUpperCase()}
    </span>
  );
}

function Toggle({
  enabled,
  onToggle,
  disabled,
}: {
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-green-600' : 'bg-surface-3'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-4' : ''}`}
      />
    </button>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// Detail Drawer

function DetailDrawer({
  job,
  onClose,
  daysBack,
}: {
  job: RecurringJob;
  onClose: () => void;
  daysBack: number;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [editContent, setEditContent] = useState<string | null>(null);
  const [scheduleEdit, setScheduleEdit] = useState<Record<string, string | number>>({});
  const [configEdit, setConfigEdit] = useState<Record<string, number>>({});
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const { data: logs } = useJobLogs(job.source, job.name, daysBack);
  const { data: workflow, isError: workflowError } = useJobWorkflow(job.name);
  const updateWorkflow = useUpdateWorkflow();
  const updateSchedule = useUpdateJobSchedule();
  const resetOverride = useResetOverride();
  const { data: personasData } = usePersonas();
  const workflowAssist = useWorkflowAssist();

  // Reset tab and edit state when switching jobs
  useEffect(() => {
    setTab('overview'); // eslint-disable-line react-hooks/set-state-in-effect
    setEditContent(null);
    setScheduleEdit({});
    setConfigEdit({});
    setAiInstruction('');
  }, [job.id]);

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'workflow', label: 'Workflow' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-[520px] bg-surface-1 border-l border-surface-3 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
        <div className="flex items-center gap-2">
          <HealthDot status={job.health.status} />
          <h2 className="text-lg font-semibold text-primary">{job.name}</h2>
          <SourceBadge source={job.source} />
        </div>
        <button onClick={onClose} className="text-muted hover:text-primary text-xl">
          &times;
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 px-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'overview' && (
          <>
            {/* Health card */}
            <div className="rounded-lg bg-surface-2 p-3 space-y-2">
              <div className="text-xs text-muted uppercase tracking-wide">Health</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  Status: <span className="font-medium">{job.health.status}</span>
                </div>
                <div>
                  Failures: <span className="font-medium">{job.health.consecutiveFailures}</span>
                </div>
                <div>
                  Success rate:{' '}
                  <span className="font-medium">
                    {(job.health.sla.successRate7d * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  On-time rate:{' '}
                  <span className="font-medium">
                    {(job.health.sla.onTimeRate7d * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  Missed runs ({daysBack}d):{' '}
                  <span className="font-medium">{job.health.sla.missedRuns7d}</span>
                </div>
                <div>
                  Cost anomaly:{' '}
                  <span className="font-medium">{job.health.costAnomaly ? 'Yes' : 'No'}</span>
                </div>
              </div>
              {job.health.lastError && (
                <div className="text-xs text-red-400">{job.health.lastError}</div>
              )}
            </div>

            {/* Stats */}
            <div className="rounded-lg bg-surface-2 p-3 space-y-2">
              <div className="text-xs text-muted uppercase tracking-wide">{daysBack}-Day Stats</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  Runs: <span className="font-medium">{job.stats.runCount7d}</span>
                </div>
                <div>
                  Failures: <span className="font-medium">{job.stats.failCount7d}</span>
                </div>
                <div>
                  Total cost:{' '}
                  <span className="font-medium">${job.stats.totalCost7d.toFixed(2)}</span>
                </div>
                <div>
                  Avg cost: <span className="font-medium">${job.stats.avgCost.toFixed(2)}</span>
                </div>
                <div>
                  Avg duration:{' '}
                  <span className="font-medium">{formatDuration(job.stats.avgDurationMs)}</span>
                </div>
              </div>
            </div>

            {/* Schedule editor */}
            {job.source === 'nexus' && (
              <div className="rounded-lg bg-surface-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted uppercase tracking-wide">Schedule</div>
                  <div className="flex items-center gap-2">
                    {savedFlash === 'schedule' && (
                      <span className="text-[10px] text-green-400 animate-pulse">Saved</span>
                    )}
                    {job.hasOverride && (
                      <button
                        onClick={() => {
                          resetOverride.mutate({ source: job.source, jobId: job.name });
                          setSavedFlash('reset');
                          setTimeout(() => setSavedFlash(null), 2000);
                        }}
                        className="text-[10px] text-yellow-400 hover:text-yellow-300"
                      >
                        Reset Override
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-sm text-secondary">
                  Current: {job.schedule}{' '}
                  {job.hasOverride && <span className="text-yellow-400">(overridden)</span>}
                </div>
                <div className="flex gap-2 items-end flex-wrap">
                  <label className="text-xs text-muted">
                    Type
                    <select
                      className="block mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                      value={(scheduleEdit.scheduleType as string) ?? job.scheduleType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setScheduleEdit((s) => {
                          const next: Record<string, string | number> = { ...s, scheduleType: newType };
                          if (newType === 'interval') {
                            delete next.hour;
                            delete next.day;
                            if (!next.every_hours) next.every_hours = 1;
                          } else if (newType === 'daily') {
                            delete next.every_hours;
                            delete next.day;
                            if (next.hour === undefined) next.hour = 0;
                          } else if (newType === 'weekly') {
                            delete next.every_hours;
                            if (next.hour === undefined) next.hour = 0;
                            if (!next.day) next.day = 'monday';
                          }
                          return next;
                        });
                      }}
                    >
                      <option value="interval">Interval</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="on-demand">On-demand</option>
                    </select>
                  </label>
                  {((scheduleEdit.scheduleType as string) ?? job.scheduleType) === 'interval' && (
                    <label className="text-xs text-muted">
                      Every (hours)
                      <input
                        type="number"
                        min="0.08"
                        step="0.1"
                        className="block w-24 mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                        placeholder={job.scheduleType === 'interval' ? job.schedule.replace(/[^0-9.]/g, '') : '1'}
                        value={scheduleEdit.every_hours ?? ''}
                        onChange={(e) =>
                          setScheduleEdit((s) => ({
                            ...s,
                            every_hours: parseFloat(e.target.value),
                          }))
                        }
                      />
                    </label>
                  )}
                  {(['daily', 'weekly'].includes((scheduleEdit.scheduleType as string) ?? job.scheduleType)) && (
                    <label className="text-xs text-muted">
                      Hour (0-23)
                      <input
                        type="number"
                        min="0"
                        max="23"
                        className="block w-20 mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                        value={scheduleEdit.hour ?? ''}
                        onChange={(e) =>
                          setScheduleEdit((s) => ({ ...s, hour: parseInt(e.target.value) }))
                        }
                      />
                    </label>
                  )}
                  {((scheduleEdit.scheduleType as string) ?? job.scheduleType) === 'weekly' && (
                    <label className="text-xs text-muted">
                      Day
                      <select
                        className="block mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                        value={(scheduleEdit.day as string) ?? ''}
                        onChange={(e) => setScheduleEdit((s) => ({ ...s, day: e.target.value }))}
                      >
                        <option value="">—</option>
                        {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {Object.keys(scheduleEdit).length > 0 && (
                    <button
                      onClick={() => {
                        updateSchedule.mutate(
                          {
                            source: job.source,
                            jobId: job.name,
                            overrides: scheduleEdit,
                          },
                          {
                            onSuccess: () => {
                              setSavedFlash('schedule');
                              setTimeout(() => setSavedFlash(null), 2000);
                            },
                          },
                        );
                        setScheduleEdit({});
                      }}
                      className="px-3 py-1 bg-accent text-white text-sm rounded hover:bg-accent/80"
                    >
                      Apply
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Configuration editor */}
            {job.source === 'nexus' && (
              <div className="rounded-lg bg-surface-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted uppercase tracking-wide">Configuration</div>
                  {job.hasOverride && (
                    <button
                      onClick={() => resetOverride.mutate({ source: job.source, jobId: job.name })}
                      className="text-[10px] text-yellow-400 hover:text-yellow-300"
                    >
                      Reset Override
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm text-secondary">
                  <div>
                    Max Turns: <span className="font-medium">{job.maxTurns ?? '—'}</span>
                  </div>
                  <div>
                    Budget:{' '}
                    <span className="font-medium">{job.maxBudget ? `$${job.maxBudget}` : '—'}</span>
                  </div>
                  <div>
                    Daily Budget:{' '}
                    <span className="font-medium">
                      {job.maxDailyBudgetUsd ? `$${job.maxDailyBudgetUsd}` : '—'}
                    </span>
                  </div>
                  <div>
                    Timeout:{' '}
                    <span className="font-medium">
                      {job.timeoutMinutes ? `${job.timeoutMinutes}m` : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 items-end flex-wrap">
                  <label className="text-xs text-muted">
                    Max Turns
                    <input
                      type="number"
                      min="1"
                      max="200"
                      className="block w-20 mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                      value={configEdit.max_turns ?? ''}
                      onChange={(e) =>
                        setConfigEdit((s) => ({ ...s, max_turns: parseInt(e.target.value) }))
                      }
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Budget ($)
                    <input
                      type="number"
                      min="0.10"
                      max="50"
                      step="0.50"
                      className="block w-20 mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                      value={configEdit.max_budget_usd ?? ''}
                      onChange={(e) =>
                        setConfigEdit((s) => ({ ...s, max_budget_usd: parseFloat(e.target.value) }))
                      }
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Daily ($)
                    <input
                      type="number"
                      min="0.10"
                      max="100"
                      step="1"
                      className="block w-20 mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                      value={configEdit.max_daily_budget_usd ?? ''}
                      onChange={(e) =>
                        setConfigEdit((s) => ({
                          ...s,
                          max_daily_budget_usd: parseFloat(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Timeout (min)
                    <input
                      type="number"
                      min="1"
                      max="60"
                      className="block w-20 mt-1 px-2 py-1 bg-surface-1 border border-surface-3 rounded text-sm text-primary"
                      value={configEdit.timeout_minutes ?? ''}
                      onChange={(e) =>
                        setConfigEdit((s) => ({ ...s, timeout_minutes: parseInt(e.target.value) }))
                      }
                    />
                  </label>
                  {savedFlash === 'config' && (
                    <span className="text-[10px] text-green-400 animate-pulse self-center">Saved</span>
                  )}
                  {Object.keys(configEdit).length > 0 && (
                    <button
                      onClick={() => {
                        updateSchedule.mutate(
                          {
                            source: job.source,
                            jobId: job.name,
                            overrides: configEdit,
                          },
                          {
                            onSuccess: () => {
                              setSavedFlash('config');
                              setTimeout(() => setSavedFlash(null), 2000);
                            },
                          },
                        );
                        setConfigEdit({});
                      }}
                      className="px-3 py-1 bg-accent text-white text-sm rounded hover:bg-accent/80"
                    >
                      Apply
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Job metadata */}
            <div className="rounded-lg bg-surface-2 p-3 space-y-2">
              <div className="text-xs text-muted uppercase tracking-wide">Details</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  Persona:
                  {job.source === 'nexus' && personasData ? (
                    <select
                      className="bg-surface-1 border border-surface-3 rounded px-1 py-0.5 text-xs font-medium text-primary"
                      value={job.persona || ''}
                      onChange={(e) =>
                        updateSchedule.mutate({
                          source: job.source,
                          jobId: job.name,
                          overrides: { persona: e.target.value },
                        })
                      }
                    >
                      {personasData.personas.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-medium">{job.persona || '—'}</span>
                  )}
                </div>
                <div>
                  Engine: <span className="font-medium">{job.engine || 'claude-code'}</span>
                </div>
                <div>
                  Description: <span className="font-medium text-xs">{job.description}</span>
                </div>
                {job.workflowFile && (
                  <div>
                    Workflow: <span className="font-medium text-xs">{job.workflowFile}</span>
                  </div>
                )}
              </div>
              {personasData && job.source === 'nexus' && (
                <div className="text-xs text-muted mt-2">
                  Available personas: {personasData.personas.join(', ')}
                </div>
              )}
            </div>

            {/* Integrations */}
            {job.integrations && job.integrations.length > 0 && (
              <div className="rounded-lg bg-surface-2 p-3 space-y-2">
                <div className="text-xs text-muted uppercase tracking-wide">Integrations</div>
                {job.integrations.map((int, i) => (
                  <div key={i} className="text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                        {int.service}
                      </span>
                    </div>
                    {int.email && (
                      <div className="text-secondary">
                        Email: <span className="font-medium">{int.email}</span>
                      </div>
                    )}
                    {int.recipient && (
                      <div className="text-secondary">
                        Recipient: <span className="font-medium">{int.recipient}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Trigger */}
            {job.trigger && (
              <div className="rounded-lg bg-surface-2 p-3 space-y-2">
                <div className="text-xs text-muted uppercase tracking-wide">Trigger</div>
                <div className="text-sm space-y-1">
                  {job.trigger.webhook && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                        WEBHOOK
                      </span>
                    </div>
                  )}
                  {job.trigger.parameters && job.trigger.parameters.length > 0 && (
                    <div className="mt-1">
                      <div className="text-xs text-muted mb-1">Parameters:</div>
                      {job.trigger.parameters.map((p) => (
                        <div
                          key={p.name}
                          className="flex items-center gap-2 text-xs text-secondary ml-2"
                        >
                          <span className="font-mono font-medium text-primary">{p.name}</span>
                          {p.required && <span className="text-red-400 text-[10px]">required</span>}
                          {p.default !== undefined && (
                            <span className="text-muted">= {p.default || '""'}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Team */}
            {job.team && (
              <div className="rounded-lg bg-surface-2 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs text-muted uppercase tracking-wide">Team</div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">
                    {job.team.mode}
                  </span>
                </div>
                <div className="space-y-1">
                  {job.team.members.map((m) => (
                    <div key={m.name} className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-primary">{m.name}</span>
                      {m.persona && <span className="text-xs text-muted">{m.persona}</span>}
                      {m.model && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-3 text-muted">
                          {m.model}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {job.team.consensus && (
                  <div className="text-xs text-muted">
                    Consensus:{' '}
                    <span className="text-secondary font-medium">{job.team.consensus.rule}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'workflow' && job.source === 'nexus' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted uppercase tracking-wide">
                Workflow: {job.workflowFile || `${job.name}.md`}
              </div>
              {editContent !== null && (
                <button
                  onClick={() => {
                    updateWorkflow.mutate({ jobId: job.name, content: editContent });
                    setEditContent(null);
                  }}
                  disabled={updateWorkflow.isPending}
                  className="px-3 py-1 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50"
                >
                  {updateWorkflow.isPending ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>

            {/* AI Assist bar */}
            <div className="flex gap-2 items-stretch">
              <input
                type="text"
                placeholder="Ask AI to edit... (e.g. 'add error handling steps', 'check for duplicates before creating tasks')"
                className="flex-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded-lg text-sm text-primary placeholder:text-muted/50 focus:outline-none focus:border-purple-500"
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && aiInstruction.trim() && !workflowAssist.isPending) {
                    workflowAssist.mutate(
                      { jobId: job.name, instruction: aiInstruction.trim() },
                      {
                        onSuccess: (data) => {
                          setEditContent(data.content);
                          setAiInstruction('');
                        },
                      },
                    );
                  }
                }}
              />
              <button
                onClick={() => {
                  if (aiInstruction.trim()) {
                    workflowAssist.mutate(
                      { jobId: job.name, instruction: aiInstruction.trim() },
                      {
                        onSuccess: (data) => {
                          setEditContent(data.content);
                          setAiInstruction('');
                        },
                      },
                    );
                  }
                }}
                disabled={!aiInstruction.trim() || workflowAssist.isPending}
                className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
              >
                {workflowAssist.isPending ? (
                  <>
                    <span className="animate-pulse">AI Working...</span>
                  </>
                ) : (
                  <>
                    <span>AI Assist</span>
                  </>
                )}
              </button>
            </div>
            {workflowAssist.isError && (
              <div className="text-xs text-red-400">
                AI error: {(workflowAssist.error as Error)?.message || 'Failed to reach AI'}
              </div>
            )}

            <textarea
              className="w-full h-[450px] bg-surface-2 border border-surface-3 rounded-lg p-3 text-sm text-primary font-mono resize-none focus:outline-none focus:border-accent"
              value={
                editContent ??
                workflow?.content ??
                (workflowError ? 'Error loading workflow' : 'Loading...')
              }
              onChange={(e) => setEditContent(e.target.value)}
              onFocus={() => {
                if (editContent === null && workflow) setEditContent(workflow.content);
              }}
              readOnly={workflowError}
            />
            {workflowError && (
              <div className="text-xs text-red-400">
                Failed to load workflow file. It may not exist yet.
              </div>
            )}
            {updateWorkflow.isSuccess && (
              <div className="text-xs text-green-400">Saved successfully</div>
            )}
          </div>
        )}

        {tab === 'workflow' && job.source !== 'nexus' && (
          <div className="text-sm text-muted">
            Workflow editing is only available for Nexus jobs.
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-2">
            <div className="text-xs text-muted uppercase tracking-wide">Recent Executions</div>
            {!logs || logs.length === 0 ? (
              <div className="text-sm text-muted">No execution history available.</div>
            ) : (
              <div className="space-y-1">
                {(logs as ExecutionLogEntry[]).map((log) => (
                  <div
                    key={`${log.job}-${log.timestamp}-${log.isMissed ? 'missed' : ''}`}
                    className={`flex items-center justify-between px-3 py-2 rounded text-sm ${
                      log.isMissed
                        ? 'bg-yellow-500/10 border border-yellow-500/20'
                        : log.isError
                          ? 'bg-red-500/10'
                          : 'bg-surface-2'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          log.isMissed
                            ? 'text-yellow-400'
                            : log.isError
                              ? 'text-red-400'
                              : 'text-green-400'
                        }
                      >
                        {log.isMissed ? '\u26A0' : log.isError ? '\u2717' : '\u2713'}
                      </span>
                      <span className="text-secondary">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                      {log.isMissed && (
                        <span className="text-yellow-400 text-xs font-medium">Missed</span>
                      )}
                    </div>
                    {!log.isMissed && (
                      <div className="flex items-center gap-3 text-muted text-xs">
                        <span>{formatDuration(log.durationMs)}</span>
                        <span>${log.cost.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Create Dialog

function CreateDialog({ onClose }: { onClose: () => void }) {
  const createJob = useCreateJob();
  const { data: personasData } = usePersonas();
  const [form, setForm] = useState({
    name: '',
    description: '',
    persona: 'investigator',
    scheduleType: 'interval',
    every_hours: 6,
    day: 'monday',
    hour: 8,
    engine: 'claude-code',
    maxBudget: 2,
    maxTurns: 15,
  });

  const handleSubmit = () => {
    const schedule: Record<string, unknown> = { type: form.scheduleType };
    if (form.scheduleType === 'interval') schedule.every_hours = form.every_hours;
    if (form.scheduleType === 'weekly') {
      schedule.day = form.day;
      schedule.hour = form.hour;
    }
    if (form.scheduleType === 'daily') schedule.hour = form.hour;

    createJob.mutate(
      {
        name: form.name,
        description: form.description,
        persona: form.persona,
        schedule,
        engine: form.engine,
        maxBudget: form.maxBudget,
        maxTurns: form.maxTurns,
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 rounded-xl border border-surface-3 p-6 w-[480px] max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-primary">Create Recurring Job</h2>

        <label className="block text-sm text-muted">
          Name (slug)
          <input
            className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
            value={form.name}
            onChange={(e) =>
              setForm((f) => ({ ...f, name: e.target.value.replace(/[^a-z0-9-]/g, '') }))
            }
            placeholder="my-new-job"
          />
        </label>

        <label className="block text-sm text-muted">
          Description
          <input
            className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What this job does"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm text-muted">
            Persona
            <select
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.persona}
              onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
            >
              {(personasData?.personas || ['investigator', 'analyst']).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-muted">
            Schedule Type
            <select
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.scheduleType}
              onChange={(e) => setForm((f) => ({ ...f, scheduleType: e.target.value }))}
            >
              <option value="interval">Interval</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="on-demand">On Demand</option>
            </select>
          </label>
        </div>

        {form.scheduleType === 'interval' && (
          <label className="block text-sm text-muted">
            Every N hours
            <input
              type="number"
              min="0.25"
              step="0.5"
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.every_hours}
              onChange={(e) => setForm((f) => ({ ...f, every_hours: parseFloat(e.target.value) }))}
            />
          </label>
        )}

        {(form.scheduleType === 'daily' || form.scheduleType === 'weekly') && (
          <label className="block text-sm text-muted">
            Hour (0-23)
            <input
              type="number"
              min="0"
              max="23"
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.hour}
              onChange={(e) => setForm((f) => ({ ...f, hour: parseInt(e.target.value) }))}
            />
          </label>
        )}

        {form.scheduleType === 'weekly' && (
          <label className="block text-sm text-muted">
            Day
            <select
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.day}
              onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))}
            >
              {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(
                (d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ),
              )}
            </select>
          </label>
        )}

        <div className="grid grid-cols-3 gap-4">
          <label className="block text-sm text-muted">
            Engine
            <select
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.engine}
              onChange={(e) => setForm((f) => ({ ...f, engine: e.target.value }))}
            >
              <option value="claude-code">Claude Code</option>
              <option value="ollama">Ollama</option>
            </select>
          </label>
          <label className="block text-sm text-muted">
            Budget ($)
            <input
              type="number"
              min="0"
              step="0.5"
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.maxBudget}
              onChange={(e) => setForm((f) => ({ ...f, maxBudget: parseFloat(e.target.value) }))}
            />
          </label>
          <label className="block text-sm text-muted">
            Max Turns
            <input
              type="number"
              min="1"
              className="block w-full mt-1 px-3 py-2 bg-surface-2 border border-surface-3 rounded text-sm text-primary"
              value={form.maxTurns}
              onChange={(e) => setForm((f) => ({ ...f, maxTurns: parseInt(e.target.value) }))}
            />
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-primary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!form.name || !form.description || createJob.isPending}
            className="px-4 py-2 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50"
          >
            {createJob.isPending ? 'Creating...' : 'Create Job'}
          </button>
        </div>

        {createJob.isError && (
          <div className="text-xs text-red-400">
            Error: {(createJob.error as Error)?.message || 'Failed'}
          </div>
        )}
      </div>
    </div>
  );
}

// Main Page

const LOOKBACK_OPTIONS = [1, 7, 30, 90] as const;

export default function RecurringJobsPage() {
  const [daysBack, setDaysBack] = useState(7);
  const { data, isLoading } = useRecurringJobs(daysBack);
  const toggleJob = useToggleJob();
  const runJob = useRunJob();
  const deleteJob = useDeleteJob();

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<RecurringJob | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Cross-mode deep-link: /jobs?focus=<name> opens the matching job's drawer.
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus || !data?.jobs || selectedJob) return;
    const match = data.jobs.find((j) => j.name === focus);
    if (match) {
      setSelectedJob(match);
      const next = new URLSearchParams(searchParams);
      next.delete('focus');
      setSearchParams(next, { replace: true });
    }
  }, [data?.jobs, searchParams, selectedJob, setSearchParams]);

  const allTags = useMemo(() => {
    if (!data) return [];
    const tags = new Set<string>();
    data.jobs.forEach((j) => j.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [data]);

  const tagCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const counts = new Map<string, number>();
    data.jobs.forEach((j) => j.tags?.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    return counts;
  }, [data]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const filteredJobs = useMemo(() => {
    if (!data) return [];
    return data.jobs.filter((j) => {
      if (sourceFilter !== 'all' && j.source !== sourceFilter) return false;
      if (healthFilter !== 'all' && j.health.status !== healthFilter) return false;
      if (selectedTags.size > 0 && !(j.tags ?? []).some((t) => selectedTags.has(t))) return false;
      if (
        search &&
        !j.name.toLowerCase().includes(search.toLowerCase()) &&
        !j.description.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [data, sourceFilter, healthFilter, selectedTags, search]);

  const summary = data?.summary;

  return (
    <>
      <Header title="Recurring Jobs">
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80"
        >
          + New Job
        </button>
      </Header>

      {/* Stats bar */}
      {summary && (
        <div className="flex gap-4 px-4 py-3 text-sm border-b border-surface-3">
          <span className="text-muted">
            Total: <span className="text-primary font-medium">{summary.total}</span>
          </span>
          <span className="text-muted">
            Enabled: <span className="text-primary font-medium">{summary.enabled}</span>
          </span>
          <span className="text-muted">
            Running: <span className="text-blue-400 font-medium">{summary.running}</span>
          </span>
          <span className="text-muted">
            Healthy: <span className="text-green-400 font-medium">{summary.healthy}</span>
          </span>
          {summary.warning > 0 && (
            <span className="text-muted">
              Warning: <span className="text-yellow-400 font-medium">{summary.warning}</span>
            </span>
          )}
          {summary.failing > 0 && (
            <span className="text-muted">
              Failing: <span className="text-red-400 font-medium">{summary.failing}</span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex rounded overflow-hidden border border-surface-3">
              {LOOKBACK_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDaysBack(d)}
                  className={`px-2 py-0.5 text-xs font-medium ${daysBack === d ? 'bg-accent/20 text-accent-text' : 'text-muted hover:text-secondary'}`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <span className="text-muted">
              {daysBack}d cost:{' '}
              <span className="text-primary font-medium">${summary.totalCost7d.toFixed(2)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-surface-3">
        <div className="flex rounded overflow-hidden border border-surface-3">
          {(['all', 'nexus', 'cron', 'systemd'] as SourceFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`px-3 py-1 text-xs font-medium ${sourceFilter === s ? 'bg-accent/20 text-accent-text' : 'text-muted hover:text-secondary'}`}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              {s !== 'all' && summary && (
                <span className="ml-1 opacity-60">
                  ({summary.bySource[s as keyof typeof summary.bySource]})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex rounded overflow-hidden border border-surface-3">
          {(['all', 'healthy', 'warning', 'failing'] as HealthFilter[]).map((h) => (
            <button
              key={h}
              onClick={() => setHealthFilter(h)}
              className={`px-3 py-1 text-xs font-medium ${healthFilter === h ? 'bg-accent/20 text-accent-text' : 'text-muted hover:text-secondary'}`}
            >
              {h.charAt(0).toUpperCase() + h.slice(1)}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted mr-0.5">Tags:</span>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`px-2 py-0.5 text-xs font-medium rounded-full border transition-colors ${
                  selectedTags.has(t)
                    ? 'bg-teal-500/25 text-teal-300 border-teal-500/40'
                    : 'bg-surface-2 text-muted border-surface-3 hover:text-secondary'
                }`}
              >
                {t}
                <span className="ml-1 opacity-60">({tagCounts.get(t) || 0})</span>
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder="Search jobs..."
          className="ml-auto px-3 py-1 bg-surface-2 border border-surface-3 rounded text-sm text-primary w-48"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Jobs table */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center text-muted">Loading jobs...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-1 border-b border-surface-3">
              <tr className="text-left text-xs text-muted uppercase tracking-wide">
                <th className="pl-4 pr-2 py-2 w-8"></th>
                <th className="px-2 py-2 w-10"></th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2 w-16">Source</th>
                <th className="px-2 py-2">Schedule</th>
                <th className="px-2 py-2 w-16">Status</th>
                <th className="px-2 py-2">Last Run</th>
                <th className="px-2 py-2">Next Run</th>
                <th className="px-2 py-2 w-16 text-right">SLA</th>
                <th className="px-2 py-2 w-16 text-right">{daysBack}d Cost</th>
                <th className="pr-4 pl-2 py-2 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className="border-b border-surface-3/50 hover:bg-surface-2/50 cursor-pointer transition-colors"
                >
                  <td className="pl-4 pr-2 py-2">
                    <HealthDot status={job.health.status} />
                  </td>
                  <td className="px-2 py-2">
                    {job.capabilities.includes('toggle') && (
                      <Toggle
                        enabled={job.enabled}
                        onToggle={() =>
                          toggleJob.mutate({
                            source: job.source,
                            jobId: job.name,
                            enabled: !job.enabled,
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-primary">{job.name}</span>
                      {job.tags?.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-muted truncate max-w-[240px]">
                      {job.description}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <SourceBadge source={job.source} />
                  </td>
                  <td className="px-2 py-2 text-secondary">
                    {job.schedule}
                    {job.hasOverride && <span className="ml-1 text-yellow-400 text-[10px]">*</span>}
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`text-xs font-medium ${
                        job.status === 'running'
                          ? 'text-blue-400'
                          : job.status === 'disabled'
                            ? 'text-muted'
                            : 'text-secondary'
                      }`}
                    >
                      {job.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-muted text-xs">{timeAgo(job.lastRun)}</td>
                  <td className="px-2 py-2 text-muted text-xs">{timeAgo(job.nextRun)}</td>
                  <td className="px-2 py-2 text-right">
                    <span
                      className={`text-xs font-medium ${
                        job.health.sla.successRate7d >= 0.9
                          ? 'text-green-400'
                          : job.health.sla.successRate7d >= 0.7
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {job.health.sla.successRate7d > 0
                        ? `${(job.health.sla.successRate7d * 100).toFixed(0)}%`
                        : '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right text-muted text-xs">
                    {job.stats.totalCost7d > 0 ? `$${job.stats.totalCost7d.toFixed(2)}` : '—'}
                  </td>
                  <td className="pr-4 pl-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {job.capabilities.includes('run') && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            runJob.mutate({ source: job.source, jobId: job.name });
                          }}
                          className="px-2 py-0.5 text-xs text-accent-text bg-accent/10 rounded hover:bg-accent/20"
                          title="Run now"
                        >
                          Run
                        </button>
                      )}
                      {job.capabilities.includes('delete') &&
                        (confirmDelete === job.name ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteJob.mutate(job.name);
                              setConfirmDelete(null);
                            }}
                            className="px-2 py-0.5 text-xs text-red-400 bg-red-500/10 rounded hover:bg-red-500/20"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDelete(job.name);
                            }}
                            className="px-2 py-0.5 text-xs text-muted hover:text-red-400"
                            title="Delete"
                          >
                            Del
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail drawer */}
      {selectedJob && (
        <DetailDrawer job={selectedJob} onClose={() => setSelectedJob(null)} daysBack={daysBack} />
      )}

      {/* Create dialog */}
      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} />}
    </>
  );
}
