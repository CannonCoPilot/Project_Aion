import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useStats, type Task } from '../../api/tasks';
import { useCompany } from '../../hooks/useCompany';
import { useApprovals } from '../../api/nexus';
import { classifyTask } from '../../lib/board';

interface Preset {
  key: string;
  label: string;
  params: Record<string, string>;
  color: string;
  badgeKey?: string;
  /** If true, params are computed dynamically (date-based) */
  dynamic?: boolean;
}

function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

const STATIC_PRESETS: Preset[] = [
  {
    key: 'action',
    label: 'Action Needed',
    params: { board: 'blocked' },
    color: 'bg-red-500/20 text-red-400',
    badgeKey: 'blocked',
  },
  {
    key: 'ready',
    label: 'Ready',
    params: { board: 'ready' },
    color: 'bg-amber-500/20 text-amber-400',
    badgeKey: 'ready',
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    params: { status: 'in_progress' },
    color: 'bg-accent/20 text-accent-text',
    badgeKey: 'inProgress',
  },
  {
    key: 'my_tasks',
    label: 'My Tasks',
    params: { assignee: 'david', status: 'open,in_progress' },
    color: 'bg-emerald-500/20 text-emerald-400',
  },
  {
    key: 'watching',
    label: 'Watching',
    params: { label: 'waiting:trigger' },
    color: 'bg-cyan-500/20 text-cyan-400',
  },
  {
    key: 'parked',
    label: 'Parked',
    params: { status: 'deferred' },
    color: 'bg-violet-500/20 text-violet-400',
    badgeKey: 'parked',
  },
  {
    key: 'research',
    label: 'Research Queue',
    params: { label: 'review:research', status: 'open' },
    color: 'bg-indigo-500/20 text-indigo-400',
    badgeKey: 'researchQueue',
  },
  {
    key: 'research_action',
    label: '\u00A0\u00A0Action Required',
    params: { label: 'review:research,waiting:david', status: 'open' },
    color: 'bg-amber-500/20 text-amber-400',
    badgeKey: 'researchActionRequired',
  },
  {
    key: 'research_fyi',
    label: '\u00A0\u00A0FYI',
    params: { label: 'review:research', status: 'open' },
    color: 'bg-purple-500/20 text-purple-400',
    badgeKey: 'researchFyi',
  },
];

const DYNAMIC_PRESETS: Omit<Preset, 'params'>[] = [
  {
    key: 'recent',
    label: 'Recent (7d)',
    color: 'bg-sky-500/20 text-sky-400',
    dynamic: true,
  },
  {
    key: 'stale',
    label: 'Stale (30d+)',
    color: 'bg-orange-500/20 text-orange-400',
    dynamic: true,
  },
  {
    key: 'completed',
    label: 'Completed',
    color: 'bg-green-500/20 text-green-400',
    dynamic: true,
  },
];

function buildDynamicParams(key: string): Record<string, string> {
  switch (key) {
    case 'recent':
      return { updatedAfter: daysAgoISO(7), status: 'all' };
    case 'stale':
      return { staleDays: '30' };
    case 'completed':
      return { status: 'closed', closedAfter: daysAgoISO(14), sort: 'updated_at', order: 'desc' };
    default:
      return {};
  }
}

function getAllPresets(): Preset[] {
  return [
    ...STATIC_PRESETS,
    ...DYNAMIC_PRESETS.map((p) => ({
      ...p,
      params: buildDynamicParams(p.key),
    })),
  ];
}

interface FilterPresetsProps {
  filteredTasks?: Task[];
}

// All param keys that presets can set — used to clear previous preset before applying new one
const ALL_PRESET_KEYS = [
  'board',
  'status',
  'assignee',
  'label',
  'updatedAfter',
  'updatedBefore',
  'createdAfter',
  'createdBefore',
  'closedAfter',
  'staleDays',
  'sort',
  'order',
];

export function FilterPresets({ filteredTasks }: FilterPresetsProps) {
  const [params, setParams] = useSearchParams();
  const { company, isFiltered } = useCompany();
  const { data: stats } = useStats(isFiltered ? company : undefined);
  const { data: approvals } = useApprovals();
  const approvalCount = approvals?.length ?? 0;

  const PRESETS = useMemo(() => getAllPresets(), []);

  // When filters are active, compute badge counts from the filtered task list
  const localCounts = useMemo(() => {
    if (!filteredTasks) return null;
    const counts = {
      blocked: 0,
      ready: 0,
      inProgress: 0,
      parked: 0,
      researchQueue: 0,
      researchActionRequired: 0,
      researchFyi: 0,
    };
    for (const t of filteredTasks) {
      const col = classifyTask(t);
      if (col === 'blocked') counts.blocked++;
      else if (col === 'ready') counts.ready++;
      else if (col === 'in_progress') counts.inProgress++;
      else if (col === 'deferred') counts.parked++;
      const lbls = t.labels ?? [];
      if (lbls.includes('review:research') && t.status !== 'closed') {
        counts.researchQueue++;
        if (lbls.includes('waiting:david')) counts.researchActionRequired++;
        else counts.researchFyi++;
      }
    }
    counts.blocked += approvalCount;
    return counts;
  }, [filteredTasks, approvalCount]);

  const badgeCounts: Record<string, number> = localCounts ?? {
    blocked: (stats?.blocked ?? 0) + approvalCount,
    ready: stats?.ready ?? 0,
    inProgress: stats?.inProgress ?? 0,
    parked: stats?.parked ?? 0,
    researchQueue: stats?.researchQueue ?? 0,
    researchActionRequired: stats?.researchActionRequired ?? 0,
    researchFyi: stats?.researchFyi ?? 0,
  };

  // Determine which preset is active based on current URL params
  const activePreset = PRESETS.find((p) => {
    return Object.entries(p.params).every(([k, v]) => params.get(k) === v);
  })?.key;

  const setPreset = (preset: Preset) => {
    if (activePreset === preset.key) {
      // Toggle off — clear preset params but keep other filters
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const k of Object.keys(preset.params)) {
          next.delete(k);
        }
        return next;
      });
    } else {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        // Clear all possible preset params to avoid stale combinations
        for (const k of ALL_PRESET_KEYS) {
          next.delete(k);
        }
        // Apply new preset
        for (const [k, v] of Object.entries(preset.params)) {
          next.set(k, v);
        }
        return next;
      });
    }
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {PRESETS.map((preset) => {
        const isActive = activePreset === preset.key;
        const badge = preset.badgeKey ? badgeCounts[preset.badgeKey] : undefined;
        return (
          <button
            key={preset.key}
            onClick={() => setPreset(preset)}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              isActive ? preset.color : 'bg-surface-2 text-muted hover:text-secondary'
            }`}
          >
            {preset.label}
            {badge != null && badge > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold min-w-[1.25rem] text-center ${
                  isActive ? 'bg-white/10' : 'bg-surface-3 text-muted'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
