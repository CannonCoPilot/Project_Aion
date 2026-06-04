import { useState } from 'react';
import { Header } from '../components/layout/Header';
import {
  usePatterns,
  usePatternStats,
  useFeedbackSummary,
  useTogglePattern,
  useToggleNegativeRule,
  type PatternEntry,
  type NegativeRule,
  type PatternStats,
} from '../api/patterns';

const ACTION_COLORS: Record<string, string> = {
  execute: 'text-green-400',
  propose: 'text-cyan-400',
  escalate: 'text-red-400',
  close: 'text-gray-400',
  defer: 'text-amber-400',
};

const CONFIDENCE_BADGES: Record<string, string> = {
  high: 'bg-green-500/20 text-green-300',
  medium: 'bg-amber-500/20 text-amber-300',
  low: 'bg-red-500/20 text-red-300',
};

const RISK_BADGES: Record<string, string> = {
  safe: 'bg-green-500/20 text-green-300',
  moderate: 'bg-amber-500/20 text-amber-300',
  destructive: 'bg-red-500/20 text-red-300',
};

function Badge({ label, colorClass }: { label: string; colorClass: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>{label}</span>;
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-4 text-center">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-sm text-secondary">{label}</div>
      {sub && <div className="text-xs text-tertiary mt-1">{sub}</div>}
    </div>
  );
}

function PatternRow({
  pattern,
  stats,
  onToggle,
  expanded,
  onExpand,
}: {
  pattern: PatternEntry;
  stats?: PatternStats;
  onToggle: (enabled: boolean) => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  return (
    <div
      className={`bg-surface-2 rounded-lg border transition-colors ${
        pattern.enabled ? 'border-border' : 'border-border/50 opacity-60'
      }`}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-surface-3/50"
        onClick={onExpand}
      >
        <button
          className={`w-10 h-5 rounded-full relative transition-colors ${
            pattern.enabled ? 'bg-green-500' : 'bg-gray-600'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(!pattern.enabled);
          }}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              pattern.enabled ? 'left-5' : 'left-0.5'
            }`}
          />
        </button>

        <span className={`font-mono text-sm ${ACTION_COLORS[pattern.action] || 'text-gray-400'}`}>
          {pattern.action}
        </span>

        <span className="font-medium text-sm flex-1 truncate">{pattern.description}</span>

        <Badge
          label={pattern.confidence}
          colorClass={CONFIDENCE_BADGES[pattern.confidence] || ''}
        />
        <Badge label={pattern.risk} colorClass={RISK_BADGES[pattern.risk] || ''} />

        {stats && (
          <span className="text-xs text-tertiary tabular-nums w-16 text-right">
            {stats.hit_count} hits
          </span>
        )}

        <span className="text-xs text-tertiary">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-3">
          <div className="text-xs text-tertiary font-mono">
            {pattern.persona}/{pattern.name}
          </div>

          {pattern.conditions.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-secondary mb-1">Conditions:</div>
              <ul className="text-sm text-secondary space-y-0.5">
                {pattern.conditions.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-tertiary">-</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pattern.note && (
            <div>
              <div className="text-xs font-semibold text-secondary mb-1">Note:</div>
              <div className="text-sm text-secondary bg-surface-3 rounded p-2">{pattern.note}</div>
            </div>
          )}

          {pattern.source && <div className="text-xs text-tertiary">Source: {pattern.source}</div>}

          {stats?.last_fired && (
            <div className="text-xs text-tertiary">
              Last fired: {new Date(stats.last_fired).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NegativeRuleRow({
  rule,
  onToggle,
}: {
  rule: NegativeRule;
  onToggle: (enabled: boolean) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 p-3 bg-surface-2 rounded-lg border transition-colors ${
        rule.enabled ? 'border-red-500/30' : 'border-border/50 opacity-60'
      }`}
    >
      <button
        className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${
          rule.enabled ? 'bg-red-500' : 'bg-gray-600'
        }`}
        onClick={() => onToggle(!rule.enabled)}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            rule.enabled ? 'left-5' : 'left-0.5'
          }`}
        />
      </button>
      <span className="text-sm text-secondary">{rule.rule}</span>
    </div>
  );
}

type FilterAction = 'all' | 'execute' | 'propose' | 'escalate' | 'close' | 'defer';

export default function PatternsPage() {
  const { data, isLoading } = usePatterns();
  const { data: statsData } = usePatternStats();
  const { data: feedbackData } = useFeedbackSummary();
  const togglePattern = useTogglePattern();
  const toggleNegative = useToggleNegativeRule();

  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<FilterAction>('all');
  const [showDisabled, setShowDisabled] = useState(true);

  if (isLoading) {
    return (
      <>
        <Header title="Learned Patterns" />
        <div className="p-6 text-secondary">Loading patterns...</div>
      </>
    );
  }

  const patterns = data?.patterns || [];
  const negativeRules = data?.negative_rules || [];
  const statsMap = new Map((statsData?.stats || []).map((s) => [s.pattern_name, s]));

  const filteredPatterns = patterns.filter((p) => {
    if (filterAction !== 'all' && p.action !== filterAction) return false;
    if (!showDisabled && !p.enabled) return false;
    return true;
  });

  const enabledCount = patterns.filter((p) => p.enabled).length;
  const disabledCount = patterns.filter((p) => !p.enabled).length;
  const totalHits = Array.from(statsMap.values()).reduce((sum, s) => sum + s.hit_count, 0);

  const actionCounts = patterns.reduce(
    (acc, p) => {
      acc[p.action] = (acc[p.action] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <>
      <Header title="Learned Patterns" />

      <div className="p-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Active Patterns" value={enabledCount} />
          <StatCard label="Disabled" value={disabledCount} />
          <StatCard label="Negative Rules" value={negativeRules.length} />
          <StatCard label="Total Hits (30d)" value={totalHits} />
          <StatCard
            label="Feedback"
            value={`${feedbackData?.total_agreed || 0}/${feedbackData?.total_wrong || 0}/${feedbackData?.total_adjusted || 0}`}
            sub="agreed/wrong/adjust"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-tertiary mr-1">Action:</span>
          {(['all', 'execute', 'propose', 'escalate', 'close', 'defer'] as FilterAction[]).map(
            (action) => (
              <button
                key={action}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterAction === action
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-2 text-secondary hover:bg-surface-3'
                }`}
                onClick={() => setFilterAction(action)}
              >
                {action}
                {action !== 'all' && actionCounts[action]
                  ? ` (${actionCounts[action]})`
                  : action === 'all'
                    ? ` (${patterns.length})`
                    : ''}
              </button>
            ),
          )}

          <div className="ml-auto">
            <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={showDisabled}
                onChange={(e) => setShowDisabled(e.target.checked)}
                className="rounded"
              />
              Show disabled
            </label>
          </div>
        </div>

        {/* Patterns list */}
        <div>
          <h2 className="text-lg font-semibold mb-3">
            Decision Patterns ({filteredPatterns.length})
          </h2>
          <div className="space-y-2">
            {filteredPatterns.map((p) => (
              <PatternRow
                key={`${p.persona}/${p.name}`}
                pattern={p}
                stats={statsMap.get(p.name)}
                onToggle={(enabled) =>
                  togglePattern.mutate({ persona: p.persona, name: p.name, enabled })
                }
                expanded={expandedPattern === `${p.persona}/${p.name}`}
                onExpand={() =>
                  setExpandedPattern(
                    expandedPattern === `${p.persona}/${p.name}` ? null : `${p.persona}/${p.name}`,
                  )
                }
              />
            ))}
            {filteredPatterns.length === 0 && (
              <div className="text-center text-secondary py-8">
                No patterns match the current filter.
              </div>
            )}
          </div>
        </div>

        {/* Negative rules */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Negative Rules ({negativeRules.length})</h2>
          <p className="text-xs text-tertiary mb-3">
            Rules that prevent specific behaviors. Disabling a rule allows the previously blocked
            behavior.
          </p>
          <div className="space-y-2">
            {negativeRules.map((r) => (
              <NegativeRuleRow
                key={`${r.persona}/${r.index}`}
                rule={r}
                onToggle={(enabled) =>
                  toggleNegative.mutate({ persona: r.persona, index: r.index, enabled })
                }
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
