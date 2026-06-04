import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { usePulsars, useTogglePulsar, useResetPulsar } from '../api/pulsars';
import type { PulsarDefinition } from '../api/pulsars';

type TypeFilter = 'all' | 'gate' | 'recurring' | 'monitor' | 'external';

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    watching: 'bg-blue-500',
    fired: 'bg-green-500',
    active: 'bg-green-500',
    external: 'bg-cyan-500',
    disabled: 'bg-gray-500',
  };
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || colors.disabled}`}
    />
  );
}

function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    gate: 'bg-amber-500/20 text-amber-300',
    recurring: 'bg-blue-500/20 text-blue-300',
    monitor: 'bg-purple-500/20 text-purple-300',
    external: 'bg-cyan-500/20 text-cyan-300',
  };
  return (
    <span
      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${styles[type] || 'bg-surface-2 text-muted'}`}
    >
      {type.toUpperCase()}
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

function epochToTimeAgo(epoch: string): string {
  const ts = parseInt(epoch, 10);
  if (!ts || ts === 0) return 'never';
  const diff = Date.now() - ts * 1000;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PulsarsPage() {
  const { data, isLoading } = usePulsars();
  const toggleMut = useTogglePulsar();
  const resetMut = useResetPulsar();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const pulsars = data?.pulsars || [];
  const summary = data?.summary;

  const filtered = typeFilter === 'all' ? pulsars : pulsars.filter((p) => p.type === typeFilter);

  const selectedPulsar = pulsars.find((p) => p.name === selected);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto">
        <Header title="Pulsars" />
        <div className="text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Header title="Pulsars">
        <span className="text-xs text-muted">Scheduled task emitters</span>
      </Header>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg bg-surface-2 p-3 text-center">
            <div className="text-2xl font-bold text-primary">{summary.total}</div>
            <div className="text-xs text-muted">Total</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3 text-center">
            <div className="text-2xl font-bold text-blue-400">{summary.watching}</div>
            <div className="text-xs text-muted">Watching</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3 text-center">
            <div className="text-2xl font-bold text-green-400">{summary.fired}</div>
            <div className="text-xs text-muted">Fired</div>
          </div>
          <div className="rounded-lg bg-surface-2 p-3 text-center">
            <div className="text-2xl font-bold text-amber-400">{summary.byType.gate}</div>
            <div className="text-xs text-muted">Gates</div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        {(['all', 'gate', 'recurring', 'monitor', 'external'] as TypeFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
              typeFilter === f
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-muted hover:text-primary'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Pulsar List */}
      <div className="space-y-1">
        {filtered.map((p) => (
          <div
            key={p.name}
            onClick={() => setSelected(p.name === selected ? null : p.name)}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
              selected === p.name
                ? 'bg-surface-3 ring-1 ring-accent/30'
                : 'bg-surface-2 hover:bg-surface-3'
            }`}
          >
            <StatusDot status={p.status} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-primary truncate">{p.name}</span>
                <TypeBadge type={p.type} />
              </div>
              <div className="text-xs text-muted truncate">{p.description}</div>
            </div>
            <div className="text-xs text-muted text-right whitespace-nowrap">
              <div>{p.scheduleLabel}</div>
              <div>{epochToTimeAgo(p.state.last_run)}</div>
            </div>
            <Toggle
              enabled={p.enabled}
              onToggle={() => toggleMut.mutate({ name: p.name, enabled: !p.enabled })}
              disabled={toggleMut.isPending}
            />
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-sm text-muted text-center py-8">No pulsars match this filter</div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedPulsar && (
        <DetailPanel
          pulsar={selectedPulsar}
          onReset={() => resetMut.mutate(selectedPulsar.name)}
          isResetting={resetMut.isPending}
        />
      )}
    </div>
  );
}

function DetailPanel({
  pulsar,
  onReset,
  isResetting,
}: {
  pulsar: PulsarDefinition;
  onReset: () => void;
  isResetting: boolean;
}) {
  return (
    <div className="rounded-lg bg-surface-2 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-primary">{pulsar.name}</h3>
        <div className="flex items-center gap-2">
          {pulsar.type === 'gate' && pulsar.status === 'fired' && (
            <button
              onClick={onReset}
              disabled={isResetting}
              className="px-3 py-1 text-xs rounded bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 disabled:opacity-50"
            >
              {isResetting ? 'Resetting...' : 'Reset Gate'}
            </button>
          )}
        </div>
      </div>

      <div className="text-sm text-secondary">{pulsar.description}</div>

      <div className="grid grid-cols-2 gap-3">
        <InfoRow label="Type" value={pulsar.type} />
        <InfoRow label="Status" value={pulsar.status} />
        <InfoRow label="Schedule" value={pulsar.scheduleLabel} />
        <InfoRow label="Last Check" value={epochToTimeAgo(pulsar.state.last_run)} />
        {pulsar.state.last_task_id && (
          <InfoRow label="Last Task" value={pulsar.state.last_task_id} />
        )}
        {pulsar.state.last_task_created && (
          <InfoRow
            label="Task Created"
            value={new Date(pulsar.state.last_task_created).toLocaleDateString()}
          />
        )}
        {pulsar.state.gate_met_at && (
          <InfoRow
            label="Gate Met"
            value={new Date(pulsar.state.gate_met_at).toLocaleDateString()}
          />
        )}
      </div>

      {/* External Service Info */}
      {pulsar.externalService && (
        <div className="rounded bg-surface-1 p-3 space-y-2">
          <div className="text-xs font-semibold text-muted uppercase">External Service</div>
          <div className="grid grid-cols-2 gap-2">
            <InfoRow label="Service" value={pulsar.externalService.name} />
            <InfoRow label="Job" value={pulsar.externalService.job} />
            {pulsar.externalService.recipient && (
              <InfoRow label="Recipient" value={pulsar.externalService.recipient} />
            )}
            {pulsar.externalService.sender && (
              <InfoRow label="Sender" value={pulsar.externalService.sender} />
            )}
            {pulsar.externalService.endpoint && (
              <InfoRow label="Endpoint" value={pulsar.externalService.endpoint} />
            )}
            {pulsar.externalService.headless_job && (
              <InfoRow label="Nexus Job" value={pulsar.externalService.headless_job} />
            )}
          </div>
        </div>
      )}

      {/* Task Template Preview */}
      {pulsar.type !== 'external' && (
        <div className="rounded bg-surface-1 p-3 space-y-2">
          <div className="text-xs font-semibold text-muted uppercase">Task Template</div>
          <div className="text-sm text-primary">{pulsar.taskTemplate.title}</div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-muted">
              P{pulsar.taskTemplate.priority}
            </span>
            {pulsar.taskTemplate.labels.map((l) => (
              <span
                key={l}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent-text"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge State */}
      {pulsar.knowledge.knowledgeCarryForward && (
        <div className="rounded bg-surface-1 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted uppercase">Knowledge Store</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
              {pulsar.knowledge.runCount} run{pulsar.knowledge.runCount !== 1 ? 's' : ''} captured
            </span>
          </div>
          {pulsar.knowledge.runs.length > 0 ? (
            <div className="space-y-2">
              {pulsar.knowledge.runs
                .slice(-5)
                .reverse()
                .map((run) => (
                  <div key={run.task_id} className="rounded bg-surface-2 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-primary font-medium truncate">{run.title}</span>
                      <span className="text-[10px] text-muted whitespace-nowrap ml-2">
                        {run.date.split('T')[0]}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-1 line-clamp-3 whitespace-pre-wrap">
                      {run.summary.length > 300 ? run.summary.slice(0, 300) + '...' : run.summary}
                    </div>
                    <div className="text-[10px] text-muted mt-1">{run.task_id}</div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-xs text-muted">
              No knowledge captured yet. Findings will appear after the first task completes.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase">{label}</div>
      <div className="text-sm text-primary">{value}</div>
    </div>
  );
}
