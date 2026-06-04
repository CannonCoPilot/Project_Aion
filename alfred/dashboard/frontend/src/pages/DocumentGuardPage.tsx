import { useState } from 'react';
import { useDocGuardRules, useDocGuardLog, useDocGuardStats } from '../api/document-guard';
import type { DocGuardRule, AuditEntry } from '../api/document-guard';
import { Header } from '../components/layout/Header';

const TIER_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-300', dot: 'bg-red-500' },
  high: { bg: 'bg-amber-500/20', text: 'text-amber-300', dot: 'bg-amber-500' },
  medium: { bg: 'bg-blue-500/20', text: 'text-blue-300', dot: 'bg-blue-500' },
  low: { bg: 'bg-gray-500/20', text: 'text-gray-300', dot: 'bg-gray-500' },
};

const ACTION_STYLES: Record<string, { bg: string; text: string }> = {
  blocked: { bg: 'bg-red-500/20', text: 'text-red-300' },
  warned: { bg: 'bg-amber-500/20', text: 'text-amber-300' },
  override_used: { bg: 'bg-cyan-500/20', text: 'text-cyan-300' },
  logged: { bg: 'bg-gray-500/20', text: 'text-gray-300' },
};

const CHECK_LABELS: Record<string, string> = {
  no_write_allowed: 'No Write',
  credential_scan: 'Credential Scan',
  key_deletion_protection: 'Key Protection',
  section_preservation: 'Section Lock',
  heading_structure: 'Heading Guard',
  frontmatter_preservation: 'Frontmatter Lock',
  shebang_preservation: 'Shebang Guard',
  semantic_relevance: 'Semantic Check',
};

const TIER_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const PROJECT_STYLES: Record<string, { bg: string; text: string }> = {
  Nexus: { bg: 'bg-purple-500/20', text: 'text-purple-300' },
  Pulse: { bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
  Security: { bg: 'bg-red-500/20', text: 'text-red-300' },
  Loom: { bg: 'bg-sky-500/20', text: 'text-sky-300' },
  Core: { bg: 'bg-blue-500/20', text: 'text-blue-300' },
  Other: { bg: 'bg-gray-500/20', text: 'text-gray-300' },
};

function ProjectBadge({ project }: { project?: string }) {
  const p = project || 'Other';
  const s = PROJECT_STYLES[p] ?? PROJECT_STYLES.Other;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      {p}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const s = TIER_STYLES[tier] ?? TIER_STYLES.low;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {tier}
    </span>
  );
}

function CheckPill({ check }: { check: string }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded bg-surface-2 text-xs text-muted">
      {CHECK_LABELS[check] ?? check}
    </span>
  );
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const now = Date.now();
  const diffHr = Math.floor((now - d.getTime()) / 3600000);
  if (diffHr < 24) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RuleRow({ rule }: { rule: DocGuardRule }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    rule.purpose ||
    rule.message ||
    rule.protectedSections?.length ||
    rule.lockedFields?.length ||
    rule.protectedKeys?.length;

  return (
    <>
      <tr
        className={`hover:bg-surface-1/50 transition-colors ${hasDetails ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5">
          <TierBadge tier={rule.tier} />
        </td>
        <td className="px-4 py-2.5">
          <ProjectBadge project={rule.project} />
        </td>
        <td className="px-4 py-2.5 font-medium text-secondary">{rule.name}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-muted">{rule.pattern}</td>
        <td className="px-4 py-2.5">
          <div className="flex flex-wrap gap-1">
            {rule.checks.map((c) => (
              <CheckPill key={c} check={c} />
            ))}
          </div>
        </td>
        <td className="px-4 py-2.5 text-center text-xs text-faint">
          {hasDetails ? (expanded ? '\u25B2' : '\u25BC') : ''}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-surface-1/30">
          <td colSpan={6} className="px-8 py-3 text-xs space-y-1">
            {rule.purpose && (
              <p className="text-muted">
                <span className="text-faint font-medium">Purpose:</span> {rule.purpose}
              </p>
            )}
            {rule.message && (
              <p className="text-muted">
                <span className="text-faint font-medium">Message:</span> {rule.message}
              </p>
            )}
            {rule.protectedSections && rule.protectedSections.length > 0 && (
              <p className="text-muted">
                <span className="text-faint font-medium">Protected sections:</span>{' '}
                {rule.protectedSections.join(', ')}
              </p>
            )}
            {rule.lockedFields && rule.lockedFields.length > 0 && (
              <p className="text-muted">
                <span className="text-faint font-medium">Locked fields:</span>{' '}
                {rule.lockedFields.join(', ')}
              </p>
            )}
            {rule.protectedKeys && rule.protectedKeys.length > 0 && (
              <p className="text-muted">
                <span className="text-faint font-medium">Protected keys:</span>{' '}
                {rule.protectedKeys.join(', ')}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const as = ACTION_STYLES[entry.action] ?? ACTION_STYLES.logged;
  const hasViolations = entry.violations && entry.violations.length > 0;

  return (
    <>
      <tr
        className={`hover:bg-surface-1/50 transition-colors ${hasViolations ? 'cursor-pointer' : ''}`}
        onClick={() => hasViolations && setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">
          {formatTimestamp(entry.timestamp)}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${as.bg} ${as.text}`}
          >
            {entry.action}
          </span>
        </td>
        <td className="px-4 py-2.5">
          <ProjectBadge project={entry.project} />
        </td>
        <td
          className="px-4 py-2.5 font-mono text-xs text-muted truncate max-w-xs"
          title={entry.file}
        >
          {entry.file}
        </td>
        <td className="px-4 py-2.5 text-center text-xs text-faint">
          {hasViolations ? (expanded ? '\u25B2' : '\u25BC') : ''}
        </td>
      </tr>
      {expanded && entry.violations && (
        <tr className="bg-surface-1/30">
          <td colSpan={5} className="px-8 py-3 text-xs space-y-1">
            {entry.violations.map((v, i) => (
              <div key={i} className="text-muted">
                <span className="text-faint font-medium">[{v.check}]</span> {v.message}
              </div>
            ))}
            {entry.rules && entry.rules.length > 0 && (
              <div className="text-faint mt-1">Rules matched: {entry.rules.join(', ')}</div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function DocumentGuardPage() {
  const { data: rulesData, isLoading: rulesLoading } = useDocGuardRules();
  const { data: stats, isLoading: statsLoading } = useDocGuardStats();
  const [logLimit, setLogLimit] = useState(50);
  const [logAction, setLogAction] = useState<string | undefined>(undefined);
  const [logProject, setLogProject] = useState<string | undefined>(undefined);
  const { data: logData, isLoading: logLoading } = useDocGuardLog(logLimit, logAction, logProject);

  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [credOpen, setCredOpen] = useState(false);

  if (rulesLoading || statsLoading) {
    return <div className="text-faint py-8 text-center">Loading Document Guard data...</div>;
  }

  if (!rulesData || !stats) {
    return (
      <div className="text-red-400 py-8 text-center">Failed to load Document Guard config.</div>
    );
  }

  // Filter rules
  let filteredRules = rulesData.rules;
  if (tierFilter) {
    filteredRules = filteredRules.filter((r) => r.tier === tierFilter);
  }
  if (projectFilter) {
    filteredRules = filteredRules.filter((r) => (r.project || 'Other') === projectFilter);
  }
  if (search) {
    const q = search.toLowerCase();
    filteredRules = filteredRules.filter(
      (r) => r.name.toLowerCase().includes(q) || r.pattern.toLowerCase().includes(q),
    );
  }
  filteredRules = [...filteredRules].sort(
    (a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9),
  );

  const tiers = ['critical', 'high', 'medium', 'low'] as const;

  // Derive available projects from rules
  const ruleProjects = [...new Set(rulesData.rules.map((r) => r.project || 'Other'))].sort();

  return (
    <div className="space-y-6">
      <Header title="Document Guard">
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${stats.enabled ? 'text-green-400' : 'text-red-400'}`}
        >
          <span
            className={`w-2 h-2 rounded-full ${stats.enabled ? 'bg-green-500' : 'bg-red-500'}`}
          />
          {stats.enabled ? 'Active' : 'Disabled'}
        </span>
      </Header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Status</div>
          <div className="flex items-baseline gap-3">
            <span
              className={`text-lg font-bold ${stats.enabled ? 'text-green-400' : 'text-red-400'}`}
            >
              {stats.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-xs text-faint mt-2">
            Fail mode: <span className="text-muted font-medium">{stats.failMode}</span>
          </p>
        </div>

        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Rules</div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-primary">{stats.totalRules}</span>
            <span className="text-xs text-faint">total</span>
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            {tiers.map((t) =>
              stats.rulesByTier[t] ? (
                <span key={t} className={TIER_STYLES[t].text}>
                  {stats.rulesByTier[t]} {t}
                </span>
              ) : null,
            )}
          </div>
        </div>

        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Activity (30d)</div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-primary">{stats.logStats.total}</span>
            <span className="text-xs text-faint">events</span>
          </div>
          <div className="flex gap-3 mt-2 text-xs">
            {stats.logStats.blocks > 0 && (
              <span className="text-red-400">{stats.logStats.blocks} blocked</span>
            )}
            {stats.logStats.warnings > 0 && (
              <span className="text-amber-400">{stats.logStats.warnings} warned</span>
            )}
            {stats.logStats.overrides > 0 && (
              <span className="text-cyan-400">{stats.logStats.overrides} overrides</span>
            )}
            {stats.logStats.total === 0 && <span className="text-faint">No events</span>}
          </div>
        </div>

        <div className="rounded-lg border border-default bg-surface-1 p-4">
          <div className="text-xs text-faint uppercase tracking-wider mb-2">Last Event</div>
          <div className="text-lg font-bold text-primary">
            {stats.logStats.lastEvent ? formatTimestamp(stats.logStats.lastEvent) : 'None'}
          </div>
        </div>
      </div>

      {/* Rules table */}
      <div>
        <h3 className="text-sm font-semibold text-tertiary mb-3">Protection Rules</h3>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            onClick={() => setTierFilter(null)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              !tierFilter
                ? 'bg-accent/20 text-accent-text'
                : 'bg-surface-2 text-muted hover:text-secondary'
            }`}
          >
            All ({rulesData.rules.length})
          </button>
          {tiers.map((t) => {
            const count = rulesData.rules.filter((r) => r.tier === t).length;
            if (!count) return null;
            const s = TIER_STYLES[t];
            return (
              <button
                key={t}
                onClick={() => setTierFilter(tierFilter === t ? null : t)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  tierFilter === t
                    ? `${s.bg} ${s.text}`
                    : 'bg-surface-2 text-muted hover:text-secondary'
                }`}
              >
                {t} ({count})
              </button>
            );
          })}

          <span className="w-px h-4 bg-default/50 mx-1" />

          {ruleProjects.map((p) => {
            const count = rulesData.rules.filter((r) => (r.project || 'Other') === p).length;
            const s = PROJECT_STYLES[p] ?? PROJECT_STYLES.Other;
            return (
              <button
                key={p}
                onClick={() => setProjectFilter(projectFilter === p ? null : p)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  projectFilter === p
                    ? `${s.bg} ${s.text}`
                    : 'bg-surface-2 text-muted hover:text-secondary'
                }`}
              >
                {p} ({count})
              </button>
            );
          })}

          <input
            type="text"
            placeholder="Search name or pattern..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ml-auto px-3 py-1 rounded bg-surface-2 border border-default text-sm text-secondary placeholder:text-faint focus:outline-none focus:border-accent/50 w-48"
          />
        </div>

        <div className="rounded-lg border border-default overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium w-24">Tier</th>
                <th className="text-left px-4 py-2.5 font-medium w-20">Project</th>
                <th className="text-left px-4 py-2.5 font-medium">Name</th>
                <th className="text-left px-4 py-2.5 font-medium">Pattern</th>
                <th className="text-left px-4 py-2.5 font-medium">Checks</th>
                <th className="text-center px-4 py-2.5 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default/50">
              {filteredRules.map((rule) => (
                <RuleRow key={rule.name} rule={rule} />
              ))}
              {filteredRules.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-faint">
                    No rules match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credential Patterns */}
      <div>
        <button
          onClick={() => setCredOpen(!credOpen)}
          className="flex items-center gap-2 text-sm font-semibold text-tertiary mb-3 hover:text-secondary transition-colors"
        >
          <span className="text-xs">{credOpen ? '\u25BC' : '\u25B6'}</span>
          Credential Patterns ({rulesData.credentialPatterns.length})
        </button>
        {credOpen && (
          <div className="rounded-lg border border-default bg-surface-1 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {rulesData.credentialPatterns.map((p) => (
                <div key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-secondary font-medium">{p.name}</span>
                  <span className="font-mono text-faint truncate" title={p.pattern}>
                    {p.pattern}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Audit Log */}
      <div>
        <h3 className="text-sm font-semibold text-tertiary mb-3">Audit Log</h3>

        {/* Action + project filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {[undefined, 'blocked', 'warned', 'override_used'].map((a) => (
            <button
              key={a ?? 'all'}
              onClick={() => setLogAction(a)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                logAction === a
                  ? 'bg-accent/20 text-accent-text'
                  : 'bg-surface-2 text-muted hover:text-secondary'
              }`}
            >
              {a ?? 'All'}
            </button>
          ))}

          <span className="w-px h-4 bg-default/50 mx-1" />

          <button
            onClick={() => setLogProject(undefined)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              !logProject
                ? 'bg-accent/20 text-accent-text'
                : 'bg-surface-2 text-muted hover:text-secondary'
            }`}
          >
            All projects
          </button>
          {ruleProjects.map((p) => {
            const s = PROJECT_STYLES[p] ?? PROJECT_STYLES.Other;
            return (
              <button
                key={p}
                onClick={() => setLogProject(logProject === p ? undefined : p)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  logProject === p
                    ? `${s.bg} ${s.text}`
                    : 'bg-surface-2 text-muted hover:text-secondary'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {logLoading ? (
          <div className="text-faint py-4 text-center text-sm">Loading audit log...</div>
        ) : !logData || logData.entries.length === 0 ? (
          <div className="rounded-lg border border-default bg-surface-1 p-8 text-center text-faint text-sm">
            No audit log entries found.
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-default overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-1 text-faint text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium w-36">Time</th>
                    <th className="text-left px-4 py-2.5 font-medium w-28">Action</th>
                    <th className="text-left px-4 py-2.5 font-medium w-20">Project</th>
                    <th className="text-left px-4 py-2.5 font-medium">File</th>
                    <th className="text-center px-4 py-2.5 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default/50">
                  {logData.entries.map((entry, i) => (
                    <AuditRow key={`${entry.timestamp}-${i}`} entry={entry} />
                  ))}
                </tbody>
              </table>
            </div>
            {logData.entries.length >= logLimit && (
              <button
                onClick={() => setLogLimit((l) => l + 50)}
                className="mt-3 px-4 py-2 rounded bg-surface-2 text-xs text-muted hover:text-secondary transition-colors"
              >
                Load more...
              </button>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-disabled text-center">Auto-refreshes every 30-60s</p>
    </div>
  );
}
