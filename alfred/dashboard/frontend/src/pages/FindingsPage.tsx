import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useFindings, type FindingItem, type FindingSection } from '../api/findings'
import { Header } from '../components/layout/Header'

type TabKey = 'overview' | 'health' | 'upgrades' | 'pipeline' | 'aurora' | 'task-reviewer' | 'evaluator' | 'research'

const TABS: { key: TabKey; label: string; source?: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'health', label: 'Health', source: 'health' },
  { key: 'upgrades', label: 'Upgrades', source: 'upgrades' },
  { key: 'pipeline', label: 'Pipeline', source: 'pipeline' },
  { key: 'aurora', label: 'Aurora', source: 'aurora' },
  { key: 'task-reviewer', label: 'Task Reviewer', source: 'task-reviewer' },
  { key: 'evaluator', label: 'Evaluator', source: 'evaluator' },
  { key: 'research', label: 'Research', source: 'research' },
]

function formatTimeAgo(ts: string | null): string {
  if (!ts) return 'never'
  const diffMs = Date.now() - new Date(ts).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  return `${diffDays}d ago`
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400'
    case 'warning': return 'text-amber-400'
    default: return 'text-blue-400'
  }
}

function severityBg(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/10 border-red-500/20'
    case 'warning': return 'bg-amber-500/10 border-amber-500/20'
    default: return 'bg-blue-500/10 border-blue-500/20'
  }
}

function statusBadge(status: string): string {
  switch (status) {
    case 'watching': return 'bg-surface-2 text-muted border-default'
    case 'deferred': return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case 'ready': case 'actionable': return 'bg-green-500/10 text-green-400 border-green-500/20'
    case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20'
    case 'applied': case 'completed': return 'bg-surface-base text-faint border-default/50'
    default: return 'bg-surface-2 text-muted border-default'
  }
}

function SeverityIcon({ severity }: { severity: string }) {
  const icon = severity === 'critical' ? '\u26A0' : severity === 'warning' ? '\u25B2' : '\u2139'
  return <span className={`text-sm ${severityColor(severity)}`}>{icon}</span>
}

function SummaryCards({ summary }: { summary: { total_findings: number; by_severity: { critical: number; warning: number; info: number }; last_updated: string } }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
        <p className="text-2xl font-bold text-secondary">{summary.total_findings}</p>
        <p className="text-xs text-faint mt-0.5">Total Findings</p>
      </div>
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
        <p className="text-2xl font-bold text-red-400">{summary.by_severity.critical}</p>
        <p className="text-xs text-faint mt-0.5">Critical</p>
      </div>
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
        <p className="text-2xl font-bold text-amber-400">{summary.by_severity.warning}</p>
        <p className="text-xs text-faint mt-0.5">Warnings</p>
      </div>
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
        <p className="text-2xl font-bold text-blue-400">{summary.by_severity.info}</p>
        <p className="text-xs text-faint mt-0.5">Info</p>
      </div>
    </div>
  )
}

function FindingCard({ item }: { item: FindingItem }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${severityBg(item.severity)}`}>
      <div className="flex items-start gap-2">
        <SeverityIcon severity={item.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-secondary">{item.title}</span>
            {item.status && (
              <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${statusBadge(item.status)}`}>
                {item.status}
              </span>
            )}
            {item.occurrences && item.occurrences > 1 && (
              <span className="text-xs text-faint">{item.occurrences}x</span>
            )}
          </div>
          {item.detail && (
            <p className="text-sm text-muted mt-1 whitespace-pre-wrap line-clamp-3">{item.detail}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {item.first_seen && (
              <span className="text-xs text-disabled">First seen: {formatTimeAgo(item.first_seen)}</span>
            )}
            {item.last_checked && (
              <span className="text-xs text-disabled">Checked: {formatTimeAgo(item.last_checked)}</span>
            )}
            {item.related_task && (
              <Link to={`/tasks/${item.related_task}`} className="text-xs text-accent-text hover:text-accent-hover transition-colors">
                {item.related_task} {'\u2192'}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionView({ section }: { section: FindingSection }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-secondary">{section.title}</h3>
        <span className="text-xs text-disabled">
          Last run: {formatTimeAgo(section.last_run)}
        </span>
      </div>
      {section.items.length === 0 ? (
        <div className="text-center py-6 text-faint text-sm">No findings from this source</div>
      ) : (
        <div className="space-y-2">
          {section.items.map(item => (
            <FindingCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function OverviewTab({ sections }: { sections: FindingSection[] }) {
  const allItems = sections.flatMap(s => s.items.map(i => ({ ...i, _source: s.title })))
  const critical = allItems.filter(i => i.severity === 'critical')
  const warnings = allItems.filter(i => i.severity === 'warning')
  const info = allItems.filter(i => i.severity === 'info')

  return (
    <div className="space-y-6">
      {/* Section health indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {sections.map(s => (
          <div key={s.source} className="rounded-lg border border-default bg-surface-1 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-secondary">{s.title}</span>
              <span className="text-xs text-disabled">{s.items.length}</span>
            </div>
            <p className="text-xs text-disabled mt-0.5">{formatTimeAgo(s.last_run)}</p>
          </div>
        ))}
      </div>

      {/* Critical items */}
      {critical.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-400">Critical ({critical.length})</h3>
          {critical.map(item => <FindingCard key={item.id} item={item} />)}
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-amber-400">Warnings ({warnings.length})</h3>
          {warnings.map(item => <FindingCard key={item.id} item={item} />)}
        </div>
      )}

      {/* Info items — show top 10 to keep overview concise */}
      {info.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-blue-400">Recent Activity ({info.length})</h3>
          {info.slice(0, 10).map(item => <FindingCard key={item.id} item={item} />)}
          {info.length > 10 && (
            <p className="text-xs text-disabled text-center py-2">
              + {info.length - 10} more — use tabs above to explore by source
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function FindingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [days, setDays] = useState(7)
  const { data, isLoading, isError } = useFindings(days)

  const sections = data?.sections ?? []
  const summary = data?.summary

  const activeSection = activeTab !== 'overview'
    ? sections.find(s => s.source === activeTab)
    : null

  return (
    <div className="space-y-4">
      <Header title="Nexus Findings" />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-faint">
          Aggregated job outputs from autonomous Nexus operations. Refreshes every 30s.
        </p>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="rounded bg-surface-2 border border-default px-2 py-1 text-sm text-secondary"
        >
          <option value={1}>Last 24h</option>
          <option value={3}>Last 3 days</option>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
        </select>
      </div>

      {/* Summary cards */}
      {summary && <SummaryCards summary={summary} />}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-default pb-1 overflow-x-auto">
        {TABS.map(tab => {
          const section = sections.find(s => s.source === tab.source)
          const count = tab.key === 'overview' ? (summary?.total_findings ?? 0) : (section?.items.length ?? 0)
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 rounded-t px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-surface-2 text-secondary'
                  : 'text-faint hover:text-tertiary hover:bg-surface-1 active:text-tertiary active:bg-surface-1'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs ${activeTab === tab.key ? 'text-muted' : 'text-disabled'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Loading / Error */}
      {isLoading && <div className="text-faint py-8 text-center">Loading findings...</div>}
      {isError && <div className="text-red-400 py-8 text-center">Failed to load findings.</div>}

      {/* Content */}
      {!isLoading && !isError && activeTab === 'overview' && (
        <OverviewTab sections={sections} />
      )}

      {!isLoading && !isError && activeTab !== 'overview' && activeSection && (
        <SectionView section={activeSection} />
      )}

      {!isLoading && !isError && activeTab !== 'overview' && !activeSection && (
        <div className="text-center py-12">
          <p className="text-faint">No data available for this source</p>
        </div>
      )}
    </div>
  )
}
