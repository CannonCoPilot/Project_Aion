import { useState } from 'react';
import { useNexusHealth } from '../../api/nexus-health';

const WINDOW_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1h' },
  { value: 6, label: '6h' },
  { value: 24, label: '24h' },
  { value: 168, label: '7d' },
];

function formatUsd(n: number, digits = 2): string {
  return `$${n.toFixed(digits)}`;
}

function formatPct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '—';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function modelColor(model: string): string {
  if (model === 'sonnet') return 'text-accent-text';
  if (model === 'opus') return 'text-purple-400';
  if (model === 'haiku') return 'text-amber-400';
  if (model.startsWith('gemma') || model.startsWith('qwen') || model.startsWith('llama')) {
    return 'text-green-400';
  }
  return 'text-tertiary';
}

export function NexusHealthCard() {
  const [windowHours, setWindowHours] = useState<number>(6);
  const { data, isLoading, isError } = useNexusHealth(windowHours);

  if (isError) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <p className="text-xs text-faint uppercase tracking-wider">Nexus Model Router</p>
        <p className="text-red-400 text-sm mt-2">Failed to load — cost-ledger unreadable</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <p className="text-xs text-faint uppercase tracking-wider">Nexus Model Router</p>
        <p className="text-disabled text-sm mt-2">Loading…</p>
      </div>
    );
  }

  const { personas, summary, lastRunTs } = data;

  // Model mix string, sorted by count desc
  const mixEntries = Object.entries(summary.modelMix).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-faint uppercase tracking-wider">Nexus Model Router</p>
          <p className="text-[10px] text-disabled mt-0.5">
            {summary.totalRuns} runs ·{' '}
            <span className="font-mono">{formatUsd(summary.totalCost)}</span>
            {summary.totalRuns > 0 && (
              <>
                {' '}
                · avg <span className="font-mono">{formatUsd(summary.avgCostPerJob, 3)}</span>/job
              </>
            )}
            {summary.failedRuns > 0 && (
              <span className="text-red-400"> · {summary.failedRuns} failed</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded border border-subtle bg-surface-2 p-0.5">
            {WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setWindowHours(opt.value)}
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors ${
                  windowHours === opt.value
                    ? 'bg-accent text-white'
                    : 'text-disabled hover:text-secondary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-disabled font-mono">
            last run {formatRelativeTime(lastRunTs)}
          </p>
        </div>
      </div>

      {personas.length === 0 ? (
        <p className="text-disabled text-sm mt-3">
          No runs in the selected window ({windowHours}h).
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-faint uppercase tracking-wider border-b border-subtle">
                <th className="text-left py-1.5 pr-2 font-normal">Persona</th>
                <th className="text-left py-1.5 pr-2 font-normal">Model</th>
                <th
                  className="text-center py-1.5 pr-2 font-normal"
                  title="Persona pin wins when true (router_override flag). Empty = router's choice wins."
                >
                  Pin
                </th>
                <th className="text-right py-1.5 pr-2 font-normal">Runs</th>
                <th className="text-right py-1.5 pr-2 font-normal">Cost</th>
                <th className="text-right py-1.5 pr-2 font-normal">Avg</th>
                <th className="text-right py-1.5 pr-2 font-normal">Dur</th>
                <th className="text-right py-1.5 font-normal">OK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {personas.map((p) => {
                const mixKeys = Object.keys(p.modelsUsed);
                const mixed = mixKeys.length > 1;
                const okColor =
                  p.successRate >= 1
                    ? 'text-green-400'
                    : p.successRate >= 0.9
                      ? 'text-amber-400'
                      : 'text-red-400';
                return (
                  <tr key={p.persona} className="hover:bg-surface-2 transition-colors">
                    <td
                      className="py-1.5 pr-2 text-secondary truncate max-w-[12rem]"
                      title={p.persona}
                    >
                      {p.persona}
                    </td>
                    <td
                      className={`py-1.5 pr-2 font-mono ${modelColor(p.currentModel)}`}
                      title={
                        mixed
                          ? `Most recent: ${p.currentModel}. Window mix: ${mixKeys
                              .map((k) => `${k}×${p.modelsUsed[k]}`)
                              .join(', ')}`
                          : p.currentModel
                      }
                    >
                      {p.currentModel}
                      {mixed && <span className="text-disabled ml-1">*</span>}
                    </td>
                    <td
                      className="py-1.5 pr-2 text-center"
                      title={
                        p.routerOverridden
                          ? 'router_override: true — persona pin is authoritative'
                          : 'router chose this model'
                      }
                    >
                      {p.routerOverridden ? (
                        <span className="text-accent-text">📌</span>
                      ) : (
                        <span className="text-disabled">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-tertiary font-mono">{p.runs}</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-secondary">
                      {formatUsd(p.totalCost)}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-disabled">
                      {formatUsd(p.avgCost, 3)}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-disabled">
                      {formatDuration(p.avgDurationS)}
                    </td>
                    <td className={`py-1.5 text-right font-mono ${okColor}`}>
                      {formatPct(p.successRate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mixEntries.length > 0 && (
        <p className="text-[10px] text-disabled font-mono mt-3">
          mix:{' '}
          {mixEntries.map(([model, count], i) => (
            <span key={model}>
              {i > 0 && <span className="text-ghost"> · </span>}
              <span className={modelColor(model)}>{model}</span>{' '}
              <span className="text-ghost">{count}</span>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
