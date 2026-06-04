import { useState, useEffect } from 'react';
import { Header } from '../components/layout/Header';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
  useSubscriptions,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
  sendTestNotification,
  type MinSeverity,
} from '../api/notifications';
import { useSettings, useUpdateSettings } from '../api/settings';
import {
  useNexusSettings,
  useUpdateRiskGates,
  useUpdateTiming,
  useActivateTurbo,
  useDeactivateTurbo,
  useUpdatePipelineRunner,
  useUpdateTaskTypeOverrides,
  useUpdateTaskReviewerThresholds,
  useAiProviderStatus,
  useUpdateAiProvider,
  type AiProviderSettings,
} from '../api/nexus-settings';

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer">
      <span className="text-sm text-tertiary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-3'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform mt-0.5 ${
            checked ? 'translate-x-4.5 ml-0' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const { data: prefs } = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const { data: subscriptions } = useSubscriptions();

  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [archiveDays, setArchiveDaysLocal] = useState(7);
  const [aggregatorInterval, setAggregatorIntervalLocal] = useState(5);

  // Nexus settings state
  const { data: nexusSettings } = useNexusSettings();
  const updateRiskGates = useUpdateRiskGates();
  const updateTimingMut = useUpdateTiming();
  const activateTurbo = useActivateTurbo();
  const deactivateTurbo = useDeactivateTurbo();
  const [turboHours, setTurboHours] = useState(2);
  const [timingDrafts, setTimingDrafts] = useState<Record<string, number>>({});
  const updatePipelineRunner = useUpdatePipelineRunner();
  const [maxDispatchDraft, setMaxDispatchDraft] = useState(20);
  const [turboRemaining, setTurboRemaining] = useState('');
  const updateTaskTypeOverrides = useUpdateTaskTypeOverrides();
  const updateTaskReviewerThresholds = useUpdateTaskReviewerThresholds();

  // AI Provider state
  const { data: aiStatus } = useAiProviderStatus();
  const updateAiProvider = useUpdateAiProvider();
  const [aiProviderDraft, setAiProviderDraft] = useState<'ollama' | 'openai'>('ollama');
  const [aiModelDraft, setAiModelDraft] = useState('');
  const [aiTempDraft, setAiTempDraft] = useState(0.3);
  const [aiSaved, setAiSaved] = useState(false);

  const EXECUTORS = ['task-executor', 'task-executor-infra', 'task-research'] as const;
  const RISK_LEVELS = ['risk:safe', 'risk:moderate', 'risk:destructive'] as const;
  const GATE_COLUMNS = ['auto_execute', 'with_approval', 'block'] as const;
  const TASK_TYPES = ['research', 'bug', 'maintenance', 'design', 'feature', 'parent'] as const;
  const GATE_OPTIONS = ['inherit', 'auto_execute', 'with_approval', 'block'] as const;
  const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;

  // Turbo countdown timer
  useEffect(() => {
    if (!nexusSettings?.turbo?.active || !nexusSettings.turbo.expires_at) {
      setTurboRemaining('');
      return;
    }
    const tick = () => {
      const remaining = new Date(nexusSettings.turbo.expires_at!).getTime() - Date.now();
      if (remaining <= 0) {
        setTurboRemaining('Expired');
        return;
      }
      const mins = Math.ceil(remaining / 60000);
      if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        setTurboRemaining(`${h}h ${m}m remaining`);
      } else {
        setTurboRemaining(`${mins}m remaining`);
      }
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [nexusSettings?.turbo?.active, nexusSettings?.turbo?.expires_at]);

  // Sync timing drafts from settings
  useEffect(() => {
    if (nexusSettings) {
      const drafts: Record<string, number> = {};
      for (const ex of EXECUTORS) {
        drafts[ex] = nexusSettings.timing[ex]?.every_hours ?? 1;
      }
      setTimingDrafts(drafts);
      setMaxDispatchDraft(nexusSettings.pipeline_runner?.max_dispatches_per_hour ?? 20);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- EXECUTORS is a const
  }, [nexusSettings]);

  // Sync AI provider drafts from server
  useEffect(() => {
    if (aiStatus) {
      setAiProviderDraft(aiStatus.provider);
      setAiModelDraft(
        aiStatus.provider === 'ollama' ? aiStatus.ollama_model : aiStatus.openai_model,
      );
      setAiTempDraft(aiStatus.temperature);
    }
  }, [aiStatus]);

  const handleMoveRisk = (
    executor: string,
    riskLevel: string,
    targetColumn: (typeof GATE_COLUMNS)[number],
  ) => {
    if (!nexusSettings) return;
    if (riskLevel === 'risk:destructive' && targetColumn === 'auto_execute') return;

    const current = nexusSettings.risk_gates[executor];
    const newGates = {
      auto_execute: current.auto_execute.filter((r) => r !== riskLevel),
      with_approval: current.with_approval.filter((r) => r !== riskLevel),
      block: current.block.filter((r) => r !== riskLevel),
    };
    newGates[targetColumn].push(riskLevel);
    updateRiskGates.mutate({ executor, gates: newGates });
  };

  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    isPushSubscribed().then(setSubscribed);
  }, []);

  useEffect(() => {
    if (settings) {
      setArchiveDaysLocal(settings.archive_days);
      setAggregatorIntervalLocal(settings.work_aggregator_interval_minutes ?? 5);
    }
  }, [settings]);

  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const result = await subscribeToPush();
      setSubscribed(result);
    } finally {
      setSubscribing(false);
    }
  };

  const handleUnsubscribe = async () => {
    setSubscribing(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } finally {
      setSubscribing(false);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    const { sent } = await sendTestNotification();
    setTestResult(
      sent > 0 ? `Sent to ${sent} device${sent > 1 ? 's' : ''}` : 'No subscriptions found',
    );
  };

  const handlePrefChange = (key: string, value: boolean | string | null) => {
    updatePrefs.mutate({ [key]: value });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Header title="Settings" />

      {/* Push Subscription */}
      <section className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-3">Push Notifications</h3>

        {!pushSupported && (
          <p className="text-sm text-amber-400">
            Push notifications are not supported in this browser.
          </p>
        )}

        {pushSupported && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span
                className={`w-2.5 h-2.5 rounded-full ${subscribed ? 'bg-green-500' : 'bg-surface-muted'}`}
              />
              <span className="text-sm text-tertiary">
                {subscribed ? 'Push notifications enabled' : 'Push notifications disabled'}
              </span>
            </div>

            <div className="flex gap-2">
              {!subscribed ? (
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50 transition-colors"
                >
                  {subscribing ? 'Enabling...' : 'Enable Push Notifications'}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleUnsubscribe}
                    disabled={subscribing}
                    className="rounded bg-surface-3 px-3 py-1.5 text-sm font-medium text-tertiary hover:bg-surface-muted disabled:opacity-50 transition-colors"
                  >
                    Disable
                  </button>
                  <button
                    onClick={handleTest}
                    className="rounded bg-surface-2 px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-3 transition-colors"
                  >
                    Send Test
                  </button>
                </>
              )}
            </div>

            {testResult && <p className="text-xs text-muted">{testResult}</p>}
          </div>
        )}

        {subscriptions && subscriptions.length > 0 && (
          <div className="mt-4 border-t border-default pt-3">
            <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
              Registered Devices
            </h4>
            <div className="space-y-1">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 text-xs text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span>{sub.label ?? 'Unknown device'}</span>
                  <span className="text-disabled">
                    {new Date(sub.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Notification Preferences */}
      {prefs && (
        <section className="rounded-lg border border-default bg-surface-1 p-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-secondary">Notification Categories</h3>
            <span className="text-[10px] text-disabled">auto-saves on toggle</span>
          </div>

          <div className="divide-y divide-default">
            <Toggle
              checked={prefs.escalations}
              onChange={(v) => handlePrefChange('escalations', v)}
              label="Escalations — agent needs your input or approval"
            />
            <Toggle
              checked={prefs.completions}
              onChange={(v) => handlePrefChange('completions', v)}
              label="Completions — job finished, project phase done"
            />
            <Toggle
              checked={prefs.pipeline}
              onChange={(v) => handlePrefChange('pipeline', v)}
              label="Pipeline — task routing, stalled tasks, project launches"
            />
            <Toggle
              checked={prefs.health_critical}
              onChange={(v) => handlePrefChange('health_critical', v)}
              label="Critical health — dispatcher down, service failures"
            />
          </div>
          <p className="text-xs text-disabled mt-2">
            All notifications are still recorded in history regardless of these settings.
          </p>

          <div className="mt-4 pt-3 border-t border-default">
            <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
              Minimum Severity
            </h4>
            <div className="flex items-center gap-1">
              {(['info', 'warn', 'error', 'critical'] as MinSeverity[]).map((level) => {
                const selected = prefs.min_severity === level;
                const colors: Record<MinSeverity, string> = {
                  info: selected
                    ? 'bg-accent/20 text-accent-text border-accent/40'
                    : 'text-faint border-subtle hover:border-b-muted',
                  warn: selected
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'text-faint border-subtle hover:border-b-muted',
                  error: selected
                    ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : 'text-faint border-subtle hover:border-b-muted',
                  critical: selected
                    ? 'bg-red-600/20 text-red-300 border-red-600/40'
                    : 'text-faint border-subtle hover:border-b-muted',
                };
                return (
                  <button
                    key={level}
                    onClick={() => handlePrefChange('min_severity', level)}
                    className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${colors[level]}`}
                  >
                    {level === 'warn' ? 'Warning' : level.charAt(0).toUpperCase() + level.slice(1)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-disabled mt-1">
              Only send push notifications at or above this severity level
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-default">
            <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
              Telegram
            </h4>
            <Toggle
              checked={prefs.telegram_enabled}
              onChange={(v) => handlePrefChange('telegram_enabled', v)}
              label="Telegram alerts — critical events sent to your phone"
            />
            <p className="text-xs text-disabled mt-1">
              When disabled, critical alerts still appear on the dashboard but won&apos;t reach
              Telegram
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-default">
            <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
              Quiet Hours
            </h4>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-faint block mb-1">Weekday (Mon–Fri)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={prefs.quiet_hours_start ?? ''}
                    onChange={(e) => handlePrefChange('quiet_hours_start', e.target.value || null)}
                    className="rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary focus:border-accent-border focus:outline-none"
                  />
                  <span className="text-xs text-faint">to</span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_end ?? ''}
                    onChange={(e) => handlePrefChange('quiet_hours_end', e.target.value || null)}
                    className="rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary focus:border-accent-border focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <span className="text-xs text-faint block mb-1">Weekend (Sat–Sun)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={prefs.quiet_hours_weekend_start ?? ''}
                    onChange={(e) =>
                      handlePrefChange('quiet_hours_weekend_start', e.target.value || null)
                    }
                    className="rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary focus:border-accent-border focus:outline-none"
                  />
                  <span className="text-xs text-faint">to</span>
                  <input
                    type="time"
                    value={prefs.quiet_hours_weekend_end ?? ''}
                    onChange={(e) =>
                      handlePrefChange('quiet_hours_weekend_end', e.target.value || null)
                    }
                    className="rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary focus:border-accent-border focus:outline-none"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-disabled mt-2">
              Suppress non-critical notifications during these hours (critical health alerts always
              sent)
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-default">
            <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-2">
              Timezone
            </h4>
            <select
              value={prefs.timezone}
              onChange={(e) => handlePrefChange('timezone', e.target.value)}
              className="rounded bg-surface-2 border border-subtle px-2 py-1.5 text-sm text-tertiary focus:border-accent-border focus:outline-none"
            >
              <option value="America/Denver">Mountain (America/Denver)</option>
              <option value="America/Chicago">Central (America/Chicago)</option>
              <option value="America/New_York">Eastern (America/New_York)</option>
              <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
              <option value="America/Phoenix">Arizona (America/Phoenix)</option>
              <option value="UTC">UTC</option>
            </select>
            <p className="text-xs text-disabled mt-1">
              Timezone for quiet hours and notification scheduling
            </p>
          </div>
        </section>
      )}
      {/* Archive Settings */}
      <section className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-3">Task Archive</h3>
        <p className="text-xs text-faint mb-4">
          Closed tasks older than this threshold are moved to the "Archived" view, keeping the main
          task list focused on recent work.
        </p>

        <div className="flex items-center gap-3">
          <label className="text-sm text-tertiary">Archive after</label>
          <input
            type="number"
            min={1}
            max={365}
            value={archiveDays}
            onChange={(e) => setArchiveDaysLocal(Math.max(1, parseInt(e.target.value, 10) || 7))}
            className="w-20 rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary text-center focus:border-accent-border focus:outline-none"
          />
          <span className="text-sm text-tertiary">days</span>
          <button
            onClick={() => updateSettings.mutate({ archive_days: archiveDays })}
            disabled={settings?.archive_days === archiveDays || updateSettings.isPending}
            className="rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updateSettings.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>

        {updateSettings.isSuccess && settings?.archive_days === archiveDays && (
          <p className="text-xs text-green-400 mt-2">Archive threshold updated.</p>
        )}
      </section>

      {/* Work Aggregator Settings */}
      <section className="rounded-lg border border-default bg-surface-1 p-5">
        <h3 className="text-sm font-semibold text-secondary mb-3">Work Aggregator</h3>
        <p className="text-xs text-faint mb-4">
          How often the work aggregator job runs to collect and enrich work report events.
        </p>

        <div className="flex items-center gap-3">
          <label className="text-sm text-tertiary">Run every</label>
          <input
            type="number"
            min={1}
            max={1440}
            value={aggregatorInterval}
            onChange={(e) =>
              setAggregatorIntervalLocal(Math.max(1, parseInt(e.target.value, 10) || 5))
            }
            className="w-20 rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary text-center focus:border-accent-border focus:outline-none"
          />
          <span className="text-sm text-tertiary">minutes</span>
          <button
            onClick={() =>
              updateSettings.mutate({ work_aggregator_interval_minutes: aggregatorInterval })
            }
            disabled={
              settings?.work_aggregator_interval_minutes === aggregatorInterval ||
              updateSettings.isPending
            }
            className="rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updateSettings.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>

        {updateSettings.isSuccess &&
          settings?.work_aggregator_interval_minutes === aggregatorInterval && (
            <p className="text-xs text-green-400 mt-2">Aggregator interval updated.</p>
          )}
      </section>

      {/* AI Provider */}
      {aiStatus && (
        <section className="rounded-lg border border-default bg-surface-1 p-5">
          <h3 className="text-sm font-semibold text-secondary mb-1">AI Provider</h3>
          <p className="text-xs text-faint mb-4">
            Configure which AI backend powers task questions and summaries.
          </p>

          {/* Provider toggle */}
          <div className="mb-4">
            <label className="text-xs font-medium text-faint uppercase tracking-wider block mb-2">
              Provider
            </label>
            <div className="flex items-center gap-1">
              {(['ollama', 'openai'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setAiProviderDraft(p);
                    setAiModelDraft(p === 'ollama' ? aiStatus.ollama_model : aiStatus.openai_model);
                  }}
                  className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
                    aiProviderDraft === p
                      ? 'bg-accent/20 text-accent-text border-accent/40'
                      : 'text-faint border-subtle hover:border-b-muted'
                  }`}
                >
                  {p === 'ollama' ? 'Ollama (Local)' : 'OpenAI'}
                </button>
              ))}
            </div>
            {aiProviderDraft === 'openai' && !aiStatus.openai_configured && (
              <p className="text-xs text-amber-400 mt-2">
                Set <code className="bg-surface-2 px-1 rounded">OPENAI_API_KEY</code> env var on the
                server to use OpenAI.
              </p>
            )}
          </div>

          {/* Model */}
          <div className="mb-4">
            <label className="text-xs font-medium text-faint uppercase tracking-wider block mb-2">
              Model
            </label>
            <input
              type="text"
              value={aiModelDraft}
              onChange={(e) => setAiModelDraft(e.target.value)}
              placeholder={aiProviderDraft === 'ollama' ? 'qwen2.5:32b' : 'gpt-4o-mini'}
              className="w-64 rounded bg-surface-2 border border-subtle px-3 py-1.5 text-sm text-tertiary focus:border-accent-border focus:outline-none"
            />
          </div>

          {/* Temperature */}
          <div className="mb-4">
            <label className="text-xs font-medium text-faint uppercase tracking-wider block mb-2">
              Temperature
            </label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={aiTempDraft}
              onChange={(e) =>
                setAiTempDraft(Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)))
              }
              className="w-20 rounded bg-surface-2 border border-subtle px-2 py-1.5 text-sm text-tertiary text-center focus:border-accent-border focus:outline-none"
            />
            <span className="text-xs text-disabled ml-2">0 = deterministic, 1 = creative</span>
          </div>

          {/* Save */}
          <button
            onClick={() => {
              const payload: Partial<AiProviderSettings> = {
                provider: aiProviderDraft,
                temperature: aiTempDraft,
                ...(aiProviderDraft === 'ollama'
                  ? { ollama_model: aiModelDraft }
                  : { openai_model: aiModelDraft }),
              };
              updateAiProvider.mutate(payload, {
                onSuccess: () => {
                  setAiSaved(true);
                  setTimeout(() => setAiSaved(false), 2000);
                },
              });
            }}
            disabled={updateAiProvider.isPending}
            className="rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {updateAiProvider.isPending ? 'Saving...' : 'Save'}
          </button>

          {aiSaved && <span className="text-xs text-green-400 ml-3">Saved.</span>}
        </section>
      )}

      {/* Nexus Executor Settings */}
      {nexusSettings && (
        <>
          {/* Pipeline Runner */}
          <section className="rounded-lg border border-default bg-surface-1 p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-secondary">Pipeline Runner</h3>
              <span
                className={`w-2 h-2 rounded-full ${nexusSettings.pipeline_runner?.enabled !== false ? 'bg-green-500' : 'bg-surface-muted'}`}
              />
            </div>
            <p className="text-xs text-faint mb-4">
              Event-driven fast path — dispatches handlers within 60s of stage transitions instead
              of waiting for cron cycles.
            </p>

            <Toggle
              checked={nexusSettings.pipeline_runner?.enabled !== false}
              onChange={(v) => updatePipelineRunner.mutate({ enabled: v })}
              label="Enable pipeline runner"
            />

            <div className="flex items-center gap-3 mt-3">
              <label className="text-sm text-tertiary">Max dispatches/hour</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxDispatchDraft}
                onChange={(e) =>
                  setMaxDispatchDraft(Math.max(1, parseInt(e.target.value, 10) || 20))
                }
                className="w-20 rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary text-center focus:border-accent-border focus:outline-none"
              />
              <button
                onClick={() =>
                  updatePipelineRunner.mutate({ max_dispatches_per_hour: maxDispatchDraft })
                }
                disabled={
                  nexusSettings.pipeline_runner?.max_dispatches_per_hour === maxDispatchDraft ||
                  updatePipelineRunner.isPending
                }
                className="rounded bg-accent-hover px-3 py-1 text-xs font-medium text-white hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-disabled mt-1">
              Cost guard — limits LLM dispatches per rolling hour. Cron safety net is unaffected.
            </p>
          </section>

          <section className="rounded-lg border border-default bg-surface-1 p-5">
            <h3 className="text-sm font-semibold text-secondary mb-3">Nexus Executor Settings</h3>

            {/* Turbo Mode */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-medium text-faint uppercase tracking-wider">
                  Turbo Mode
                </h4>
                {nexusSettings.turbo.active && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                )}
                {nexusSettings.turbo.active && nexusSettings.turbo.mode && (
                  <span
                    className={`text-[10px] rounded px-1.5 py-0.5 font-medium border ${
                      nexusSettings.turbo.mode === 'turbo+'
                        ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                        : 'bg-green-500/20 text-green-400 border-green-500/30'
                    }`}
                  >
                    {nexusSettings.turbo.mode === 'turbo+' ? '15min' : '30min'}
                  </span>
                )}
              </div>

              {nexusSettings.turbo.active ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-green-400 font-medium">{turboRemaining}</span>
                  <button
                    onClick={() => deactivateTurbo.mutate()}
                    disabled={deactivateTurbo.isPending}
                    className="rounded bg-red-500/20 border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                  >
                    {deactivateTurbo.isPending ? 'Reverting...' : 'Revert Now'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {[1, 2, 4, 8].map((h) => (
                      <button
                        key={h}
                        onClick={() => setTurboHours(h)}
                        className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
                          turboHours === h
                            ? 'bg-accent/20 text-accent-text border-accent/40'
                            : 'text-faint border-subtle hover:border-b-muted'
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                    <button
                      onClick={() => activateTurbo.mutate({ duration_hours: turboHours })}
                      disabled={activateTurbo.isPending}
                      className="rounded bg-accent-hover px-3 py-1.5 text-sm font-medium text-white hover:bg-accent disabled:opacity-50 transition-colors"
                    >
                      {activateTurbo.isPending ? 'Activating...' : 'Activate Turbo'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        activateTurbo.mutate({ duration_hours: 1, interval_hours: 0.25 })
                      }
                      disabled={activateTurbo.isPending}
                      className="rounded bg-orange-500/20 border border-orange-500/40 px-3 py-1.5 text-sm font-medium text-orange-400 hover:bg-orange-500/30 disabled:opacity-50 transition-colors"
                    >
                      {activateTurbo.isPending ? 'Activating...' : 'Turbo+'}
                    </button>
                    <span className="text-xs text-disabled">15min intervals for 1 hour</span>
                  </div>
                </div>
              )}
              <p className="text-xs text-disabled mt-1">
                Turbo sets all executor intervals to 30min. Turbo+ runs every 15min for 1 hour.
              </p>
            </div>

            {/* Timing */}
            <div className="border-t border-default pt-4 mb-5">
              <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">
                Executor Timing
              </h4>
              <div className="space-y-2">
                {EXECUTORS.map((executor) => (
                  <div key={executor} className="flex items-center gap-3">
                    <span className="text-sm text-tertiary w-44 font-mono">{executor}</span>
                    {nexusSettings.turbo.active && (
                      <span
                        className={`text-[10px] rounded px-1.5 py-0.5 border ${
                          nexusSettings.turbo.mode === 'turbo+'
                            ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                            : 'bg-green-500/20 text-green-400 border-green-500/30'
                        }`}
                      >
                        {nexusSettings.turbo.mode === 'turbo+' ? 'turbo+' : 'turbo'}
                      </span>
                    )}
                    <span className="text-xs text-faint">every</span>
                    <input
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={
                        timingDrafts[executor] ?? nexusSettings.timing[executor]?.every_hours ?? 1
                      }
                      onChange={(e) =>
                        setTimingDrafts((prev) => ({
                          ...prev,
                          [executor]: parseFloat(e.target.value) || 1,
                        }))
                      }
                      disabled={nexusSettings.turbo.active}
                      className="w-20 rounded bg-surface-2 border border-subtle px-2 py-1 text-sm text-tertiary text-center focus:border-accent-border focus:outline-none disabled:opacity-50"
                    />
                    <span className="text-xs text-faint">hours</span>
                    <button
                      onClick={() =>
                        updateTimingMut.mutate({ executor, every_hours: timingDrafts[executor] })
                      }
                      disabled={
                        nexusSettings.turbo.active ||
                        nexusSettings.timing[executor]?.every_hours === timingDrafts[executor] ||
                        updateTimingMut.isPending
                      }
                      className="rounded bg-accent-hover px-3 py-1 text-xs font-medium text-white hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Save
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Gates */}
            <div className="border-t border-default pt-4">
              <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">
                Risk Gates
              </h4>
              <div className="space-y-4">
                {EXECUTORS.map((executor) => (
                  <div key={executor}>
                    <span className="text-sm text-tertiary font-mono block mb-2">{executor}</span>
                    <div className="grid grid-cols-3 gap-2">
                      {GATE_COLUMNS.map((column) => {
                        const colorMap = {
                          auto_execute: {
                            bg: 'bg-green-500/10',
                            border: 'border-green-500/30',
                            label: 'text-green-400',
                            header: 'Auto-Execute',
                          },
                          with_approval: {
                            bg: 'bg-amber-500/10',
                            border: 'border-amber-500/30',
                            label: 'text-amber-400',
                            header: 'Approval',
                          },
                          block: {
                            bg: 'bg-red-500/10',
                            border: 'border-red-500/30',
                            label: 'text-red-400',
                            header: 'Blocked',
                          },
                        };
                        const style = colorMap[column];
                        const levels = nexusSettings.risk_gates[executor]?.[column] ?? [];
                        return (
                          <div
                            key={column}
                            className={`rounded-lg border ${style.border} ${style.bg} p-2`}
                          >
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wider ${style.label} block mb-1.5`}
                            >
                              {style.header}
                            </span>
                            <div className="space-y-1">
                              {levels.map((level) => (
                                <span
                                  key={level}
                                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium mr-1 ${
                                    level === 'risk:safe'
                                      ? 'bg-green-500/20 text-green-300'
                                      : level === 'risk:moderate'
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : 'bg-red-500/20 text-red-300'
                                  }`}
                                >
                                  {level.replace('risk:', '')}
                                </span>
                              ))}
                              {/* Droppable targets for levels not in this column */}
                              {RISK_LEVELS.filter((r) => !levels.includes(r)).map((level) => {
                                const isBlocked =
                                  level === 'risk:destructive' && column === 'auto_execute';
                                return (
                                  <button
                                    key={`add-${level}`}
                                    onClick={() => handleMoveRisk(executor, level, column)}
                                    disabled={isBlocked || updateRiskGates.isPending}
                                    title={
                                      isBlocked
                                        ? 'risk:destructive cannot be auto-executed'
                                        : `Move ${level} here`
                                    }
                                    className={`block rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                      isBlocked
                                        ? 'border-red-800/30 text-red-800/40 cursor-not-allowed'
                                        : 'border-surface-muted text-faint hover:border-accent/40 hover:text-accent-text cursor-pointer'
                                    }`}
                                  >
                                    + {level.replace('risk:', '')}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-disabled mt-3">
                Click a dashed tag to move a risk level into that column.{' '}
                <span className="text-red-400">risk:destructive</span> can never be auto-executed.
              </p>
            </div>

            {/* Task-Type Gate Overrides */}
            <div className="border-t border-default pt-4">
              <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">
                Task-Type Gate Overrides
              </h4>
              <p className="text-xs text-disabled mb-3">
                Override risk gates per task type. "Inherit" falls back to executor-level gates
                above.
              </p>
              <div className="space-y-2">
                {TASK_TYPES.map((taskType) => {
                  const override = nexusSettings.task_type_overrides?.[taskType];
                  const currentGate = override?.gate ?? 'inherit';
                  const currentMaxRisk = override?.max_risk ?? 'risk:moderate';
                  return (
                    <div key={taskType} className="flex items-center gap-3">
                      <span className="text-sm text-tertiary font-mono w-28">{taskType}</span>
                      <select
                        value={currentGate}
                        onChange={(e) => {
                          const gate = e.target.value;
                          const current = { ...(nexusSettings.task_type_overrides ?? {}) };
                          if (gate === 'inherit') {
                            delete current[taskType];
                          } else {
                            current[taskType] = { gate, max_risk: currentMaxRisk };
                          }
                          updateTaskTypeOverrides.mutate({ overrides: current });
                        }}
                        className="bg-surface-2 border border-default rounded px-2 py-1 text-sm text-secondary"
                      >
                        {GATE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt === 'inherit' ? 'Inherit' : opt.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                      {currentGate !== 'inherit' && (
                        <select
                          value={currentMaxRisk}
                          onChange={(e) => {
                            const current = { ...(nexusSettings.task_type_overrides ?? {}) };
                            current[taskType] = { gate: currentGate, max_risk: e.target.value };
                            updateTaskTypeOverrides.mutate({ overrides: current });
                          }}
                          className="bg-surface-2 border border-default rounded px-2 py-1 text-sm text-secondary"
                        >
                          {RISK_LEVELS.map((r) => (
                            <option key={r} value={r}>
                              {r.replace('risk:', 'max: ')}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Task Reviewer Decision Thresholds */}
            <div className="border-t border-default pt-4">
              <h4 className="text-xs font-medium text-faint uppercase tracking-wider mb-3">
                Task Reviewer Decision Thresholds
              </h4>
              <p className="text-xs text-disabled mb-3">
                Controls when Task Reviewer auto-executes, proposes, or escalates based on confidence and
                risk.
              </p>
              {(() => {
                const thresholds = nexusSettings.task_reviewer_thresholds ?? {
                  auto_execute: { min_confidence: 'high', max_risk: 'any' },
                  execute_medium: { min_confidence: 'medium', max_risk: 'risk:moderate' },
                  propose: { min_confidence: 'medium', max_risk: 'risk:destructive' },
                  escalate_below: 'low',
                };
                const tiers = [
                  { key: 'auto_execute', label: 'Auto-Execute', color: 'text-green-400' },
                  { key: 'execute_medium', label: 'Execute (Medium)', color: 'text-green-300' },
                  { key: 'propose', label: 'Propose', color: 'text-amber-400' },
                ] as const;
                const riskOptions = ['any', ...RISK_LEVELS] as const;

                const handleUpdate = (updates: Record<string, unknown>) => {
                  const merged = { ...thresholds, ...updates };
                  updateTaskReviewerThresholds.mutate({ thresholds: merged });
                };

                return (
                  <div className="space-y-3">
                    {tiers.map(({ key, label, color }) => {
                      const tier = thresholds[key];
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className={`text-sm font-medium w-36 ${color}`}>{label}</span>
                          <span className="text-xs text-faint w-12">conf &ge;</span>
                          <select
                            value={tier.min_confidence}
                            onChange={(e) =>
                              handleUpdate({ [key]: { ...tier, min_confidence: e.target.value } })
                            }
                            className="bg-surface-2 border border-default rounded px-2 py-1 text-sm text-secondary"
                          >
                            {CONFIDENCE_LEVELS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <span className="text-xs text-faint w-12">risk &le;</span>
                          <select
                            value={tier.max_risk}
                            onChange={(e) =>
                              handleUpdate({ [key]: { ...tier, max_risk: e.target.value } })
                            }
                            className="bg-surface-2 border border-default rounded px-2 py-1 text-sm text-secondary"
                          >
                            {riskOptions.map((r) => (
                              <option key={r} value={r}>
                                {r === 'any' ? 'any' : r.replace('risk:', '')}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium w-36 text-red-400">Escalate</span>
                      <span className="text-xs text-faint">below</span>
                      <select
                        value={thresholds.escalate_below}
                        onChange={(e) => handleUpdate({ escalate_below: e.target.value })}
                        className="bg-surface-2 border border-default rounded px-2 py-1 text-sm text-secondary"
                      >
                        {CONFIDENCE_LEVELS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })()}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
