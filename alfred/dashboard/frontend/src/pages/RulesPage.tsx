import { useState } from 'react';
import { Header } from '../components/layout/Header';
import {
  useRules,
  useCorrections,
  useRuleSuggestions,
  useToggleRule,
  useAddCorrection,
  useGenerateSuggestions,
  useUpdateSuggestionStatus,
  type Rule,
  type DomainSummary,
  type Correction,
  type RuleSuggestion,
} from '../api/rules';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  info: 'bg-accent/20 text-accent-text border-accent/30',
};

const DOMAIN_COLORS: Record<string, string> = {
  safety: 'text-red-400',
  quality: 'text-amber-400',
  routing: 'text-accent-text',
  style: 'text-purple-400',
  workflow: 'text-teal-400',
};

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function DomainCard({ d }: { d: DomainSummary }) {
  return (
    <div className="rounded-lg border border-default bg-surface-1/50 p-3">
      <div className={`text-sm font-semibold capitalize ${DOMAIN_COLORS[d.domain] ?? 'text-tertiary'}`}>
        {d.domain}
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-2xl font-bold text-primary">{d.enabled}</span>
        <span className="text-xs text-faint">/ {d.total} rules</span>
        {d.critical > 0 && (
          <span className="text-xs text-red-400">{d.critical} critical</span>
        )}
      </div>
    </div>
  );
}

function RuleRow({ rule, onToggle }: { rule: Rule; onToggle: (id: string, enabled: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-default/50 last:border-0">
      <div
        className="flex items-center gap-3 py-2.5 px-3 hover:bg-surface-1/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <button
          className={`w-8 h-4 rounded-full relative transition-colors ${rule.enabled ? 'bg-accent' : 'bg-surface-3'}`}
          onClick={(e) => { e.stopPropagation(); onToggle(rule.id, !rule.enabled); }}
          title={rule.enabled ? 'Disable' : 'Enable'}
        >
          <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${rule.enabled ? 'left-4' : 'left-0.5'}`} />
        </button>

        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[rule.severity]}`}>
          {rule.severity}
        </span>

        <span className={`text-xs capitalize ${DOMAIN_COLORS[rule.domain] ?? 'text-muted'}`}>
          {rule.domain}
        </span>

        <span className={`text-sm font-medium flex-1 ${rule.enabled ? 'text-secondary' : 'text-faint'}`}>
          {rule.title}
        </span>

        <span className="text-[10px] text-disabled">{rule.scope}</span>
        <span className="text-[10px] text-disabled">{rule.source}</span>
      </div>

      {expanded && (
        <div className="px-3 pb-3 ml-11 space-y-2">
          <div className="text-xs">
            <span className="text-faint">When: </span>
            <span className="text-tertiary">{rule.condition}</span>
          </div>
          <div className="text-xs">
            <span className="text-faint">Then: </span>
            <span className="text-tertiary">{rule.action}</span>
          </div>
          <div className="flex gap-4 text-[10px] text-disabled">
            <span>Created: {rule.created}</span>
            {rule.updated && <span>Updated: {rule.updated}</span>}
            <span>ID: {rule.id}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CorrectionRow({ c }: { c: Correction }) {
  return (
    <div className="flex items-start gap-3 py-2 px-3 text-xs hover:bg-surface-1/30">
      <span className={`mt-0.5 capitalize ${DOMAIN_COLORS[c.domain] ?? 'text-muted'}`}>
        {c.domain}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-tertiary truncate">{c.correction}</div>
        <div className="text-disabled truncate">was: {c.action_taken}</div>
      </div>
      {c.persona && <span className="text-disabled shrink-0">{c.persona}</span>}
      <span className="text-disabled shrink-0">{formatTimeAgo(c.created_at)}</span>
    </div>
  );
}

function SuggestionCard({ s, onUpdate }: { s: RuleSuggestion; onUpdate: (id: number, status: string) => void }) {
  return (
    <div className="rounded-lg border border-default bg-surface-1/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs capitalize ${DOMAIN_COLORS[s.domain] ?? 'text-muted'}`}>{s.domain}</span>
        <span className="text-[10px] text-disabled">{Math.round(s.confidence * 100)}% confidence</span>
      </div>
      <div className="text-sm font-medium text-secondary mb-1">{s.title}</div>
      <div className="text-xs text-faint mb-1">When: {s.condition_text}</div>
      <div className="text-xs text-muted mb-3">Then: {s.action_text}</div>
      <div className="flex gap-2">
        <button
          className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
          onClick={() => onUpdate(s.id, 'accepted')}
        >
          Accept
        </button>
        <button
          className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          onClick={() => onUpdate(s.id, 'rejected')}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

type Tab = 'rules' | 'corrections' | 'suggestions';

export default function RulesPage() {
  const [tab, setTab] = useState<Tab>('rules');
  const [domainFilter, setDomainFilter] = useState<string>('');

  const { data: rulesData, isLoading: rulesLoading } = useRules(domainFilter || undefined);
  const { data: correctionsData, isLoading: correctionsLoading } = useCorrections(domainFilter || undefined);
  const { data: suggestions, isLoading: suggestionsLoading } = useRuleSuggestions();

  const toggleRule = useToggleRule();
  const addCorrection = useAddCorrection();
  const generateSuggestions = useGenerateSuggestions();
  const updateSuggestion = useUpdateSuggestionStatus();

  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [correctionForm, setCorrectionForm] = useState({
    domain: 'quality',
    action_taken: '',
    correction: '',
    persona: '',
    job: '',
  });

  const handleSubmitCorrection = () => {
    if (!correctionForm.action_taken || !correctionForm.correction) return;
    addCorrection.mutate({
      rule_id: null,
      domain: correctionForm.domain,
      action_taken: correctionForm.action_taken,
      correction: correctionForm.correction,
      context: null,
      persona: correctionForm.persona || null,
      job: correctionForm.job || null,
    });
    setCorrectionForm({ domain: 'quality', action_taken: '', correction: '', persona: '', job: '' });
    setShowCorrectionForm(false);
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'rules', label: 'Rules', count: rulesData?.rules.length },
    { key: 'corrections', label: 'Corrections', count: correctionsData?.corrections.length },
    { key: 'suggestions', label: 'Suggestions', count: suggestions?.length },
  ];

  return (
    <div className="space-y-4">
      <Header title="Rules Engine" />

      {/* Domain summary cards */}
      {rulesData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {rulesData.summary.map(d => (
            <DomainCard key={d.domain} d={d} />
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-4 border-b border-default pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`text-sm pb-2 border-b-2 transition-colors ${
              tab === t.key
                ? 'border-accent-border text-accent-text'
                : 'border-transparent text-faint hover:text-tertiary'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1.5 text-xs text-disabled">({t.count})</span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        {/* Domain filter */}
        <select
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value)}
          className="rounded bg-surface-2 border border-subtle px-2 py-1 text-xs text-tertiary focus:border-accent-border focus:outline-none"
        >
          <option value="">All Domains</option>
          <option value="safety">Safety</option>
          <option value="quality">Quality</option>
          <option value="routing">Routing</option>
          <option value="style">Style</option>
          <option value="workflow">Workflow</option>
        </select>
      </div>

      {/* Rules tab */}
      {tab === 'rules' && (
        <div className="rounded-lg border border-default">
          {rulesLoading && <div className="text-faint py-8 text-center">Loading rules...</div>}
          {rulesData?.rules.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onToggle={(id, enabled) => toggleRule.mutate({ id, enabled })}
            />
          ))}
          {rulesData?.rules.length === 0 && (
            <div className="text-disabled py-8 text-center">No rules found</div>
          )}
        </div>
      )}

      {/* Corrections tab */}
      {tab === 'corrections' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-1.5 rounded text-xs bg-accent/20 text-accent-text hover:bg-accent/30 transition-colors"
              onClick={() => setShowCorrectionForm(!showCorrectionForm)}
            >
              {showCorrectionForm ? 'Cancel' : '+ Log Correction'}
            </button>

            {/* Correction stats */}
            {correctionsData?.stats && correctionsData.stats.length > 0 && (
              <div className="flex gap-3 text-xs">
                {correctionsData.stats.map(s => (
                  <span key={s.domain} className={DOMAIN_COLORS[s.domain] ?? 'text-muted'}>
                    {s.domain}: {s.count}
                  </span>
                ))}
              </div>
            )}
          </div>

          {showCorrectionForm && (
            <div className="rounded-lg border border-default bg-surface-1/50 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-faint block mb-1">Domain</label>
                  <select
                    value={correctionForm.domain}
                    onChange={e => setCorrectionForm(p => ({ ...p, domain: e.target.value }))}
                    className="w-full rounded bg-surface-2 border border-subtle px-2 py-1.5 text-sm text-tertiary"
                  >
                    <option value="safety">Safety</option>
                    <option value="quality">Quality</option>
                    <option value="routing">Routing</option>
                    <option value="style">Style</option>
                    <option value="workflow">Workflow</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-faint block mb-1">Persona (optional)</label>
                  <input
                    value={correctionForm.persona}
                    onChange={e => setCorrectionForm(p => ({ ...p, persona: e.target.value }))}
                    className="w-full rounded bg-surface-2 border border-subtle px-2 py-1.5 text-sm text-tertiary"
                    placeholder="e.g. task-investigator"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-faint block mb-1">What was done (incorrectly)</label>
                <input
                  value={correctionForm.action_taken}
                  onChange={e => setCorrectionForm(p => ({ ...p, action_taken: e.target.value }))}
                  className="w-full rounded bg-surface-2 border border-subtle px-2 py-1.5 text-sm text-tertiary"
                  placeholder="e.g. Task was auto-executed despite needing design review"
                />
              </div>
              <div>
                <label className="text-xs text-faint block mb-1">What should have happened</label>
                <input
                  value={correctionForm.correction}
                  onChange={e => setCorrectionForm(p => ({ ...p, correction: e.target.value }))}
                  className="w-full rounded bg-surface-2 border border-subtle px-2 py-1.5 text-sm text-tertiary"
                  placeholder="e.g. Route to waiting:david for design decisions"
                />
              </div>
              <button
                className="px-4 py-1.5 rounded text-sm bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                onClick={handleSubmitCorrection}
                disabled={!correctionForm.action_taken || !correctionForm.correction}
              >
                Save Correction
              </button>
            </div>
          )}

          <div className="rounded-lg border border-default divide-y divide-default/50">
            {correctionsLoading && <div className="text-faint py-8 text-center">Loading corrections...</div>}
            {correctionsData?.corrections.map(c => (
              <CorrectionRow key={c.id} c={c} />
            ))}
            {correctionsData?.corrections.length === 0 && (
              <div className="text-disabled py-8 text-center">No corrections logged yet</div>
            )}
          </div>
        </div>
      )}

      {/* Suggestions tab */}
      {tab === 'suggestions' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              className="px-3 py-1.5 rounded text-xs bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
              onClick={() => generateSuggestions.mutate()}
              disabled={generateSuggestions.isPending}
            >
              {generateSuggestions.isPending ? 'Generating...' : 'Generate Suggestions'}
            </button>
            <span className="text-xs text-disabled">
              Analyzes corrections to suggest new rules (needs 3+ corrections in a domain)
            </span>
          </div>

          {suggestionsLoading && <div className="text-faint py-8 text-center">Loading suggestions...</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions?.map((s: RuleSuggestion) => (
              <SuggestionCard
                key={s.id}
                s={s}
                onUpdate={(id, status) => updateSuggestion.mutate({ id, status })}
              />
            ))}
          </div>

          {suggestions?.length === 0 && (
            <div className="text-disabled py-8 text-center">
              No pending suggestions. Log more corrections to generate suggestions.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
