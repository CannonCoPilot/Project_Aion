import { useState } from 'react';
import { Header } from '../components/layout/Header';
import { useCompanyCosts, type CompanyCost } from '../api/companies';
import {
  useSessionSpendDollars,
  useSessionTokens,
  useSessionWindow,
} from '../api/usage';
import { useCompany } from '../hooks/useCompany';

// Coverage heuristic: compares proxy-attributed token share vs. account-wide
// utilization (from Anthropic headers). Reference budget is an external
// constant — the back-calculated `estimated_budget` from session-budget-history
// is itself biased by the same coverage gap, so it cannot serve as a denominator.
// 250M tokens ≈ typical Claude Pro 5h allotment. Tune per plan tier.
const REFERENCE_5H_TOKEN_BUDGET = 250_000_000;

function monthStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const from = new Date(y, m - 1, 1).toISOString();
  const to = new Date(y, m, 0, 23, 59, 59).toISOString();
  return { from, to };
}

const TIER_BADGE: Record<string, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-emerald-500/20 text-emerald-400' },
  warning: { label: 'Warning', className: 'bg-amber-500/20 text-amber-400' },
  throttled: { label: 'Throttled', className: 'bg-orange-500/20 text-orange-400' },
  exceeded: { label: 'Exceeded', className: 'bg-red-500/20 text-red-400' },
};

function BudgetBar({ spend, budget }: { spend: number; budget: CompanyCost['budget'] }) {
  const limit = budget.hard_limit_usd || 250;
  const pct = Math.min((spend / limit) * 100, 100);
  const softPct = budget.soft_limit_usd ? (budget.soft_limit_usd / limit) * 100 : 0;
  const throttlePct = budget.throttle_at_usd ? (budget.throttle_at_usd / limit) * 100 : 0;

  // Determine bar color based on thresholds
  let barColor = 'bg-emerald-500';
  if (budget.throttle_at_usd && spend >= budget.throttle_at_usd) barColor = 'bg-orange-500';
  else if (budget.soft_limit_usd && spend >= budget.soft_limit_usd) barColor = 'bg-amber-500';
  if (budget.hard_limit_usd && spend >= budget.hard_limit_usd) barColor = 'bg-red-500';

  return (
    <div className="relative h-3 bg-surface-2 rounded-full overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 ${barColor} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
      {softPct > 0 && (
        <div className="absolute inset-y-0 w-px bg-amber-500/50" style={{ left: `${softPct}%` }} />
      )}
      {throttlePct > 0 && (
        <div
          className="absolute inset-y-0 w-px bg-orange-500/50"
          style={{ left: `${throttlePct}%` }}
        />
      )}
    </div>
  );
}

function CompanyCard({ data, isHighlighted }: { data: CompanyCost; isHighlighted: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const badge = TIER_BADGE[data.tier] ?? TIER_BADGE.ok;
  const limit = data.budget.hard_limit_usd || 0;
  const pct = limit > 0 ? ((data.spend / limit) * 100).toFixed(1) : '0.0';
  const isPlatform = data.slug === 'platform';

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isHighlighted
          ? 'border-accent/50 bg-accent/5'
          : isPlatform
            ? 'border-default/50 bg-surface-1/50'
            : 'border-default bg-surface-1'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-secondary truncate">{data.name}</h3>
        </div>
        <span
          className={`shrink-0 ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <BudgetBar spend={data.spend} budget={data.budget} />

      <div className="flex items-baseline justify-between mt-2">
        <span className="text-sm font-mono text-secondary">
          ${data.spend.toFixed(2)}
          {limit > 0 && <span className="text-muted"> / ${limit.toFixed(2)}</span>}
        </span>
        {limit > 0 && <span className="text-xs text-muted">{pct}%</span>}
      </div>

      {data.jobBreakdown.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-muted hover:text-secondary transition-colors"
        >
          {expanded ? '\u25BC' : '\u25B6'} {data.jobBreakdown.length} jobs
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-1">
          {data.jobBreakdown.slice(0, 5).map((j) => (
            <div key={j.job} className="flex items-center justify-between text-xs">
              <span className="text-muted truncate mr-2">{j.job}</span>
              <span className="text-secondary font-mono shrink-0">
                ${j.cost.toFixed(2)} <span className="text-muted">({j.runs}x)</span>
              </span>
            </div>
          ))}
          {data.jobBreakdown.length > 5 && (
            <div className="text-xs text-disabled">+{data.jobBreakdown.length - 5} more</div>
          )}
        </div>
      )}
    </div>
  );
}

// Burn Rate (dollars) — moved from UsagePage 2026-05-06 since dollar-velocity
// is the budget-page semantic. Token-velocity remains on UsagePage.
function BurnRateDollarsCard() {
  const { data: spend } = useSessionSpendDollars();
  const { data: win } = useSessionWindow();
  if (!spend || spend.total_usd == null || !win || win.status === 'no_proxy_data') {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-2">
          Burn Rate — Current 5h Window
        </h3>
        <div className="text-sm text-faint">⊘ no proxy data</div>
      </div>
    );
  }
  const elapsedSec = 18000 - (win.five_hour?.reset_seconds ?? 18000);
  const ratePerMin = elapsedSec > 0 ? spend.total_usd / (elapsedSec / 60) : 0;
  // Threshold bands: <$0.05/min ok, <$0.15 watch, else critical.
  // Calibrated against the task-executor leak (~$0.027/min for the leak alone;
  // healthy active is $0.05-0.10; sustained $0.15+ warrants investigation).
  const cls =
    ratePerMin < 0.05
      ? 'text-emerald-400'
      : ratePerMin < 0.15
        ? 'text-amber-400'
        : 'text-red-400';
  const proj = spend.projection_to_window_end_usd ?? null;
  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-sm font-semibold text-secondary">
          Burn Rate — Current 5h Window
        </h3>
        <span className="text-xs text-muted">live · proxy-derived</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className={`text-2xl font-semibold font-mono ${cls}`}>
            ${ratePerMin.toFixed(3)}
            <span className="text-base text-muted font-normal ml-1">/min</span>
          </div>
          <div className="text-xs text-muted mt-1">current rate</div>
        </div>
        <div>
          <div className="text-2xl font-semibold font-mono text-secondary">
            ${(ratePerMin * 60).toFixed(2)}
            <span className="text-base text-muted font-normal ml-1">/hr</span>
          </div>
          <div className="text-xs text-muted mt-1">extrapolated</div>
        </div>
        <div>
          <div className="text-2xl font-semibold font-mono text-secondary">
            {proj != null ? `$${proj.toFixed(2)}` : '—'}
          </div>
          <div className="text-xs text-muted mt-1">projected to window end</div>
        </div>
      </div>
    </div>
  );
}

function ApiSpendCard() {
  const { data } = useSessionSpendDollars();
  const { data: window } = useSessionWindow();
  const { data: tokens } = useSessionTokens();

  if (!data || data.status === 'no_proxy_data') {
    return (
      <div className="rounded-lg border border-default bg-surface-1 p-4">
        <h3 className="text-sm font-semibold text-secondary mb-2">
          Proxy-Attributed Cost — Current 5h Window
        </h3>
        <div className="text-sm text-faint">⊘ no proxy data</div>
        <div className="text-xs text-muted mt-2">
          Set <code>ANTHROPIC_BASE_URL=http://localhost:9800</code> to capture API spend.
        </div>
      </div>
    );
  }

  const total = data.total_usd ?? 0;
  const projection = data.projection_to_window_end_usd;
  const topModel = data.by_model?.[0];
  const topAgent = data.by_agent?.[0];

  // Coverage computation: how much of account-wide spend does the proxy see?
  const utilization = window?.five_hour?.utilization ?? null; // 0-1, account-wide truth
  const proxyTokens = tokens?.tokens_spent ?? 0;
  const proxyShareOfBudget = proxyTokens / REFERENCE_5H_TOKEN_BUDGET;
  // Coverage = (proxy's share of ref-budget) / (Anthropic's share of ref-budget)
  // 1.0 = proxy sees everything; <0.5 = proxy missing most account traffic.
  const coverage =
    utilization != null && utilization > 0.01
      ? Math.min(proxyShareOfBudget / utilization, 1.0)
      : null;

  const dotClass =
    coverage == null
      ? 'bg-gray-400'
      : coverage >= 0.9
        ? 'bg-emerald-500'
        : coverage >= 0.5
          ? 'bg-amber-500'
          : 'bg-red-500';
  const dotLabel =
    coverage == null
      ? 'unknown'
      : coverage >= 0.9
        ? 'high coverage'
        : coverage >= 0.5
          ? 'partial coverage'
          : 'low coverage';

  const utilPct = utilization != null ? (utilization * 100).toFixed(1) : null;
  const coveragePct = coverage != null ? Math.round(coverage * 100) : null;

  return (
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold text-secondary flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${dotClass}`}
            title={`Coverage: ${dotLabel}${coveragePct != null ? ` (~${coveragePct}%)` : ''}`}
          />
          Proxy-Attributed Cost — Current 5h Window
        </h3>
        <span className="text-xs text-muted">live · proxy-derived</span>
      </div>
      {utilPct != null && (
        <div className="text-[11px] text-muted mb-3">
          Account-wide utilization: <span className="font-mono text-secondary">{utilPct}%</span>
          {coveragePct != null && (
            <>
              {' '}— proxy captures <span className="font-mono text-secondary">~{coveragePct}%</span>
              {' '}of estimated account traffic
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Spent (proxy)</div>
          <div className="text-2xl font-semibold text-secondary font-mono">
            ${total.toFixed(2)}
          </div>
          <div className="text-xs text-muted mt-1">{data.request_count ?? 0} requests</div>
        </div>
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Projection at Reset</div>
          <div className="text-2xl font-semibold text-secondary font-mono">
            {projection != null ? `$${projection.toFixed(2)}` : '—'}
          </div>
          <div className="text-xs text-muted mt-1">linear extrapolation</div>
        </div>
        <div>
          <div className="text-xs text-muted uppercase tracking-wide mb-1">Top Attribution</div>
          <div className="text-sm text-secondary font-mono">
            {topModel?.model ?? '—'}
          </div>
          <div className="text-xs text-muted mt-1">
            agent: {topAgent?.agent_name ?? '—'}
          </div>
        </div>
      </div>
      <div className="text-[11px] text-faint mt-3 space-y-1">
        <div>
          ⓘ <span className="font-medium">Two distinct quantities</span>: utilization% is
          Anthropic&apos;s account-wide truth (every API call, every client); proxy-attributed
          cost sums only what flowed through <code>localhost:9800</code>. Coverage dot estimates
          the gap against a {(REFERENCE_5H_TOKEN_BUDGET / 1_000_000).toFixed(0)}M-token
          reference budget — heuristic, not measurement.
        </div>
        <div>
          To capture more sources, set <code>ANTHROPIC_BASE_URL=http://localhost:9800</code> for
          AIfred Nexus, additional Jarvis instances, and standalone <code>claude -p</code> sessions.
        </div>
      </div>
    </div>
  );
}

export default function BudgetPage() {
  const now = new Date();
  const [month, setMonth] = useState(monthStr(now));
  const { from, to } = monthRange(month);
  const { data, isLoading } = useCompanyCosts(from, to);
  const { company: activeCompany } = useCompany();

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMonth(monthStr(d));
  };

  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    if (d <= now) setMonth(monthStr(d));
  };

  const [y, m] = month.split('-').map(Number);
  const displayDate = new Date(y, m - 1, 1);
  const isCurrentMonth = monthStr(now) === month;

  const totalSpend = data?.totalSpend ?? 0;
  const globalLimit = data?.orgBudget?.hard_limit_usd ?? 250;
  const globalPct = globalLimit > 0 ? ((totalSpend / globalLimit) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      <Header title="Budget Overview" />

      {/* Live current-window cards (dollar-velocity above, breakdown below) */}
      <BurnRateDollarsCard />

      {/* Wire B — Live API spend (current 5h window) from reverse proxy. */}
      <ApiSpendCard />

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevMonth}
          className="px-2 py-1 rounded text-muted hover:text-secondary hover:bg-surface-2 transition-colors"
        >
          &larr;
        </button>
        <span className="text-sm font-medium text-secondary min-w-[140px] text-center">
          {monthLabel(displayDate)}
        </span>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className={`px-2 py-1 rounded transition-colors ${isCurrentMonth ? 'text-disabled cursor-not-allowed' : 'text-muted hover:text-secondary hover:bg-surface-2'}`}
        >
          &rarr;
        </button>
      </div>

      {isLoading && <div className="text-muted text-sm">Loading cost data...</div>}

      {data && (
        <>
          {/* Global summary */}
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-secondary">Total Tracked Spend</h2>
              <span className="text-xs text-muted">Based on tracked job executions</span>
            </div>
            <BudgetBar
              spend={totalSpend}
              budget={{
                soft_limit_usd: 0,
                throttle_at_usd: 0,
                hard_limit_usd: globalLimit,
                period: 'monthly',
              }}
            />
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-lg font-mono font-semibold text-secondary">
                ${totalSpend.toFixed(2)}
                <span className="text-muted text-sm font-normal"> / ${globalLimit.toFixed(2)}</span>
              </span>
              <span className="text-sm text-muted">{globalPct}%</span>
            </div>
          </div>

          {/* Company cards grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.companies.map((c) => (
              <CompanyCard key={c.slug} data={c} isHighlighted={activeCompany === c.slug} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
