import { useState, useEffect, useCallback } from 'react';
import { Header } from '../components/layout/Header';

interface RunCost {
  burn_weight_pp: number | null;
  burn_start_pct: number | null;
  burn_end_pct: number | null;
  api_calls: number;
  cost_usd: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
}

interface SuiteRun {
  task_id: string;
  completed_at: string | null;
  wall_seconds: number | null;
  task_count: number;
  chain_count: number;
  models: string[];
  engines: string[];
  window_crossed: boolean;
  cost: RunCost | null;
}

interface SuiteMetrics {
  suite_id: string;
  runs: SuiteRun[];
  summary: {
    total_runs: number;
    avg_wall_seconds: number | null;
    avg_cost_usd: number | null;
    avg_burn_weight_pp: number | null;
    total_cost_usd: number | null;
    total_burn_weight_pp: number | null;
  } | null;
}

interface TestValidation {
  last_run: string | null;
  last_result: string | null;
  last_commit?: string | null;
  notes?: string;
}

interface TestSuite {
  id: string;
  name: string;
  file: string | null;
  status: string;
  priority: string;
  task_count: number;
  expected_runtime_min: number;
  description: string;
  components_tested: string[];
  behaviors_tested: string[];
  validation: TestValidation;
  inline_task?: Record<string, unknown>;
  inline_tasks?: Record<string, unknown>[];
}

interface DeprecatedSuite {
  id: string;
  name: string;
  file: string;
  archived_date: string;
  reason: string;
}

interface CatalogData {
  suites: TestSuite[];
  deprecated: DeprecatedSuite[];
}

const API_BASE = '/api/v1';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  planned: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  deprecated: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const RESULT_COLORS: Record<string, string> = {
  pass: 'text-green-400',
  fail: 'text-red-400',
  partial: 'text-amber-400',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0: 'text-red-400',
  P1: 'text-amber-400',
  P2: 'text-blue-400',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded border ${STATUS_COLORS[status] || STATUS_COLORS.planned}`}>
      {status}
    </span>
  );
}

function BurnBadge({ pp, crossed }: { pp: number | null; crossed?: boolean }) {
  if (pp === null) return null;
  const color = pp > 10 ? 'text-red-400 border-red-500/30 bg-red-500/10'
    : pp > 5 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded border ${color}`}
      title={crossed ? 'Burn computed across 5hr window reset (summed segments)' : undefined}>
      {pp > 0 ? '+' : ''}{pp}pp{crossed ? '*' : ''}
    </span>
  );
}

function BurnGauge({ startPct, endPct, crossed, burnPP }: {
  startPct: number | null; endPct: number | null; crossed?: boolean; burnPP?: number | null;
}) {
  if (startPct === null || endPct === null) return null;
  const barColor = endPct > 85 ? 'bg-red-500' : endPct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const deltaColor = endPct > 85 ? 'text-red-400' : endPct > 70 ? 'text-amber-400' : 'text-emerald-400';
  const displayDelta = crossed && burnPP != null ? burnPP : endPct - startPct;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-zinc-500">5hr Window{crossed ? ' (crossed reset)' : ''}</span>
        <span className={deltaColor}>
          {startPct}% → {endPct}%
          {crossed ? ` (actual: +${displayDelta.toFixed(1)}pp*)` : ` (${displayDelta > 0 ? '+' : ''}${displayDelta.toFixed(1)}pp)`}
        </span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
        <div className="absolute inset-y-0 left-0 bg-zinc-700 rounded-full" style={{ width: `${endPct}%` }} />
        <div className={`absolute inset-y-0 left-0 ${barColor} rounded-full opacity-60`} style={{ width: `${startPct}%` }} />
        {crossed && <div className="absolute inset-y-0 left-1/2 w-px bg-blue-400/50" title="Window reset boundary" />}
        {endPct >= 90 && <div className="absolute inset-y-0 right-[10%] w-px bg-red-500/60" />}
      </div>
      <div className="flex justify-between text-[9px] text-zinc-600">
        <span>0%</span>
        {crossed && <span className="text-blue-400/50">reset</span>}
        <span className="text-red-500/50">90% warn</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function formatTimeAgo(ts: string | null): string {
  if (!ts) return 'never';
  let parsed = new Date(ts);
  if (!ts.includes('Z') && !ts.includes('+') && !ts.includes('T')) {
    parsed = new Date(ts + 'Z');
  }
  if (isNaN(parsed.getTime())) return 'invalid';
  const diffMs = Date.now() - parsed.getTime();
  if (diffMs < 0) return 'just now';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffHr < 24) return remMin > 0 ? `${diffHr}h ${remMin}m ago` : `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function MetricsPanel({ suiteId, onClose }: { suiteId: string; onClose: () => void }) {
  const [metrics, setMetrics] = useState<SuiteMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/test-suites/${suiteId}/metrics`)
      .then((r) => r.json())
      .then((d) => { setMetrics(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [suiteId]);

  if (loading) return <div className="text-xs text-zinc-500 py-2 ml-7">Loading metrics...</div>;
  if (!metrics?.summary || metrics.runs.length === 0) {
    return <div className="text-xs text-zinc-500 py-2 ml-7">No telemetry captured yet.</div>;
  }

  const s = metrics.summary;
  const latestRun = metrics.runs[0];
  const latestCost = latestRun?.cost;

  return (
    <div className="mt-3 ml-7 bg-zinc-900/80 border border-zinc-700/40 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Telemetry</h4>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Close</button>
      </div>

      {latestCost && (
        <BurnGauge startPct={latestCost.burn_start_pct} endPct={latestCost.burn_end_pct}
          crossed={latestRun?.window_crossed} burnPP={latestCost.burn_weight_pp} />
      )}

      <div className="grid grid-cols-5 gap-2">
        {[
          { label: 'Runs', value: String(s.total_runs), color: 'text-white' },
          { label: 'Avg Time', value: formatDuration(s.avg_wall_seconds), color: 'text-white' },
          { label: 'Avg Burn', value: s.avg_burn_weight_pp !== null ? `${s.avg_burn_weight_pp}pp` : '—', color: 'text-amber-400' },
          { label: 'Avg Cost', value: s.avg_cost_usd !== null ? `$${s.avg_cost_usd}` : '—', color: 'text-zinc-300' },
          { label: 'Total Burn', value: s.total_burn_weight_pp !== null ? `${s.total_burn_weight_pp}pp` : '—', color: 'text-amber-300' },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <div className={`text-sm font-semibold ${m.color}`}>{m.value}</div>
            <div className="text-[10px] text-zinc-500">{m.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <h5 className="text-[10px] text-zinc-500 uppercase tracking-wider">Run History</h5>
        {metrics.runs.slice(0, 5).map((r) => (
          <div key={r.task_id} className="space-y-0.5 py-1.5 border-b border-zinc-800/50">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-zinc-500 font-mono w-24 shrink-0">{r.task_id.slice(0, 13)}</span>
              <span className="text-zinc-300 w-14 shrink-0">{formatDuration(r.wall_seconds)}</span>
              {r.cost && <BurnBadge pp={r.cost.burn_weight_pp} crossed={r.window_crossed} />}
              <span className="text-zinc-500 text-[10px]">{r.task_count} tasks / {r.chain_count} chains</span>
              <span className="text-zinc-500 truncate">{formatTimeAgo(r.completed_at)}</span>
            </div>
            {r.cost && (
              <div className="flex items-center gap-4 text-[10px] ml-24 pl-3">
                <span className="text-zinc-500">{r.cost.api_calls} calls</span>
                <span className="text-zinc-500">${r.cost.cost_usd}</span>
                <span className="text-zinc-600">
                  cr:{formatTokens(r.cost.cache_read_tokens)} cw:{formatTokens(r.cost.cache_write_tokens)} out:{formatTokens(r.cost.output_tokens)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SuiteCard({ suite, onRun, expanded, onToggle, latestBurn }: {
  suite: TestSuite;
  onRun: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
  latestBurn?: number | null;
}) {
  const v = suite.validation;
  const [showMetrics, setShowMetrics] = useState(false);
  return (
    <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 hover:border-zinc-600/50 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button onClick={onToggle} className="text-zinc-400 hover:text-white transition-colors">
            {expanded ? '▾' : '▸'}
          </button>
          <h3 className="text-sm font-semibold text-white">{suite.name}</h3>
          <StatusBadge status={suite.status} />
          <span className={`text-xs font-mono ${PRIORITY_COLORS[suite.priority] || 'text-zinc-400'}`}>
            {suite.priority}
          </span>
          {latestBurn !== undefined && <BurnBadge pp={latestBurn ?? null} />}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">
            {suite.task_count} task{suite.task_count !== 1 ? 's' : ''} &middot; ~{suite.expected_runtime_min}m
          </span>
          <button
            onClick={() => setShowMetrics(!showMetrics)}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 rounded transition-colors"
          >
            Metrics
          </button>
          {suite.status === 'active' && (
            <button
              onClick={() => onRun(suite.id)}
              className="px-3 py-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
            >
              Run
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-400 ml-7">
        <span>
          Last: <span className={v.last_result ? (RESULT_COLORS[v.last_result] || 'text-zinc-300') : 'text-zinc-500'}>
            {v.last_result || 'never'}
          </span>
        </span>
        <span>{formatTimeAgo(v.last_run)}</span>
      </div>

      {showMetrics && (
        <MetricsPanel suiteId={suite.id} onClose={() => setShowMetrics(false)} />
      )}

      {expanded && (
        <div className="mt-4 ml-7 space-y-3">
          <p className="text-xs text-zinc-400 leading-relaxed">{suite.description}</p>

          <div>
            <h4 className="text-xs font-semibold text-zinc-300 mb-1">Components Tested</h4>
            <div className="flex flex-wrap gap-1">
              {suite.components_tested.map((c) => (
                <span key={c} className="px-2 py-0.5 text-xs bg-zinc-700/50 text-zinc-300 rounded font-mono">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-zinc-300 mb-1">Behaviors Tested</h4>
            <div className="flex flex-wrap gap-1">
              {suite.behaviors_tested.map((b) => (
                <span key={b} className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-300 rounded border border-indigo-500/20">
                  {b}
                </span>
              ))}
            </div>
          </div>

          {v.notes && (
            <p className="text-xs text-zinc-500 italic">{v.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

function CoverageMatrix({ suites }: { suites: TestSuite[] }) {
  const allComponents = Array.from(
    new Set(suites.flatMap((s) => s.components_tested))
  ).sort();
  const activeSuites = suites.filter((s) => s.status === 'active');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-700">
            <th className="text-left py-2 pr-4 text-zinc-400 font-medium sticky left-0 bg-zinc-900">Component</th>
            {activeSuites.map((s) => (
              <th key={s.id} className="px-2 py-2 text-center text-zinc-400 font-medium whitespace-nowrap">
                {s.name.length > 20 ? s.name.slice(0, 18) + '...' : s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allComponents.map((comp) => (
            <tr key={comp} className="border-b border-zinc-800/50">
              <td className="py-1.5 pr-4 font-mono text-zinc-300 sticky left-0 bg-zinc-900">{comp}</td>
              {activeSuites.map((s) => (
                <td key={s.id} className="px-2 py-1.5 text-center">
                  {s.components_tested.includes(comp) ? (
                    <span className="text-green-400">&#9679;</span>
                  ) : (
                    <span className="text-zinc-700">&#9675;</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TestCockpitPage() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSuite, setExpandedSuite] = useState<string | null>(null);
  const [, setRunningId] = useState<string | null>(null);
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [burnMap, setBurnMap] = useState<Record<string, number | null>>({});

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/test-catalog`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCatalog(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  useEffect(() => {
    if (!catalog) return;
    const active = catalog.suites.filter((s) => s.status === 'active');
    Promise.all(
      active.map((s) =>
        fetch(`${API_BASE}/test-suites/${s.id}/metrics`)
          .then((r) => r.json())
          .then((d: SuiteMetrics) => ({
            id: s.id,
            burn: d.runs?.[0]?.cost?.burn_weight_pp ?? null,
          }))
          .catch(() => ({ id: s.id, burn: null }))
      )
    ).then((results) => {
      const map: Record<string, number | null> = {};
      results.forEach((r) => { map[r.id] = r.burn; });
      setBurnMap(map);
    });
  }, [catalog]);

  const handleRun = async (suiteId: string) => {
    setRunningId(suiteId);
    try {
      const res = await fetch(`${API_BASE}/test-suites/${suiteId}/run`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunningId(null);
    }
  };

  if (loading) {
    return (
      <div>
        <Header title="Test Cockpit" />
        <div className="p-6 text-zinc-400">Loading catalog...</div>
      </div>
    );
  }

  const suites = catalog?.suites || [];
  const deprecated = catalog?.deprecated || [];
  const activeSuites = suites.filter((s) => s.status === 'active');
  const plannedSuites = suites.filter((s) => s.status === 'planned');

  const totalTests = suites.length;
  const activeTests = activeSuites.length;
  const passedRecently = suites.filter((s) => s.validation.last_result === 'pass').length;
  const burnValues = Object.values(burnMap).filter((v): v is number => v !== null);
  const totalBurn = burnValues.reduce((a, b) => a + b, 0);

  return (
    <div>
      <Header title="Test Cockpit" />

      <div className="p-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Active Suites', value: `${activeTests}/${totalTests}`, color: 'text-green-400' },
            { label: 'Last Pass', value: String(passedRecently), color: 'text-emerald-400' },
            { label: 'Latest Run Burn', value: burnValues.length > 0 ? `${totalBurn.toFixed(1)}pp` : '—', color: totalBurn > 50 ? 'text-red-400' : totalBurn > 20 ? 'text-amber-400' : 'text-emerald-400' },
            { label: 'Suites w/ Telemetry', value: String(burnValues.length), color: burnValues.length >= activeTests ? 'text-emerald-400' : 'text-amber-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">Active Suites</h2>
          <div className="space-y-2">
            {activeSuites.map((suite) => (
              <SuiteCard
                key={suite.id}
                suite={suite}
                onRun={handleRun}
                expanded={expandedSuite === suite.id}
                onToggle={() => setExpandedSuite(expandedSuite === suite.id ? null : suite.id)}
                latestBurn={burnMap[suite.id]}
              />
            ))}
          </div>
        </section>

        {plannedSuites.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">Planned Suites</h2>
            <div className="space-y-2">
              {plannedSuites.map((suite) => (
                <SuiteCard
                  key={suite.id}
                  suite={suite}
                  onRun={handleRun}
                  expanded={expandedSuite === suite.id}
                  onToggle={() => setExpandedSuite(expandedSuite === suite.id ? null : suite.id)}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">Coverage Matrix</h2>
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
            <CoverageMatrix suites={activeSuites} />
          </div>
        </section>

        {deprecated.length > 0 && (
          <section>
            <button
              onClick={() => setShowDeprecated(!showDeprecated)}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showDeprecated ? '▾' : '▸'} Deprecated / Archived ({deprecated.length})
            </button>
            {showDeprecated && (
              <div className="mt-2 space-y-1">
                {deprecated.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 text-xs text-zinc-500 py-1">
                    <span className="font-mono">{d.name}</span>
                    <span className="text-zinc-600">archived {d.archived_date}</span>
                    <span className="text-zinc-600 italic">{d.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
