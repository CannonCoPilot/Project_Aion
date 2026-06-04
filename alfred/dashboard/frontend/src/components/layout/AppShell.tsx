import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useStats } from '../../api/tasks';
import { useApprovals } from '../../api/nexus';
import { useCompanies } from '../../api/companies';
import { useCompany } from '../../hooks/useCompany';
import { useActiveMode, type ActiveMode } from '../../hooks/useActiveMode';
import ObservabilityBar from './ObservabilityBar';
import NotificationBell from '../notifications/NotificationBell';
import { SessionCountdown } from './SessionCountdown';
import ModeToggle from './ModeToggle';
import { useWebSocketNotifications } from '../../hooks/useWebSocketNotifications';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  badgeKey?: string;
}

interface SubCluster {
  id: string;
  label: string;
  items: NavItem[];
}

const PROD_PINNED_TOP: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '◈' },
];

const PROD_NAV: { projects: SubCluster; config: SubCluster } = {
  projects: {
    id: 'projects',
    label: 'Projects',
    items: [
      { to: '/projects', label: 'Projects', icon: '⦿' },
      { to: '/tasks', label: 'Tasks', icon: '▦', badgeKey: 'actionCount' },
      { to: '/board', label: 'Board', icon: '▚', badgeKey: 'inProgress' },
      { to: '/triage', label: 'Triage', icon: '⇄' },
      { to: '/digest', label: 'Digest', icon: '❖' },
      { to: '/cross-project', label: 'Cross-Project', icon: '⨂' },
      { to: '/create', label: 'Create', icon: '✎' },
    ],
  },
  config: {
    id: 'config',
    label: 'Config',
    items: [
      { to: '/jobs', label: 'Recurring Jobs', icon: '⏰' },
      { to: '/personas', label: 'Personas', icon: '♢' },
      { to: '/automation', label: 'Rules', icon: '↻' },
      { to: '/pulsars', label: 'Pulsars', icon: '✦' },
      { to: '/document-guard', label: 'Doc Guard', icon: '⊛' },
      { to: '/settings', label: 'Settings', icon: '⚙' },
      { to: '/account', label: 'Account', icon: '⚿' },
    ],
  },
};

const OPS_NAV: { review: SubCluster; monitor: SubCluster } = {
  review: {
    id: 'review',
    label: 'Review',
    items: [
      { to: '/reviews', label: 'AI Reviews', icon: '⚑' },
      { to: '/reo', label: 'Decision Archive', icon: '⌶' },
      { to: '/patterns', label: 'Patterns', icon: '⁂' },
      { to: '/cortex', label: 'Cortex', icon: '◉' },
      { to: '/report', label: 'Reports', icon: '☰' },
    ],
  },
  monitor: {
    id: 'monitor',
    label: 'Monitor',
    items: [
      { to: '/health', label: 'Health', icon: '♥' },
      { to: '/jarvis-memory', label: 'Jarvis Memory', icon: '⧖' },
      { to: '/pipeline', label: 'Pipeline', icon: '↠' },
      { to: '/observability', label: 'Observability', icon: '◎' },
      { to: '/nexus-ops', label: 'Nexus Ops', icon: '⬡' },
      { to: '/token-compression', label: 'Compression', icon: '⟑' },
      { to: '/usage', label: 'Usage', icon: '≡' },
      { to: '/findings', label: 'Findings', icon: '⌖' },
      { to: '/test-cockpit', label: 'Test Cockpit', icon: '⊘' },
      { to: '/budget', label: 'Budget', icon: '$' },
    ],
  },
};

const FOOTER_NAV: NavItem[] = [
  { to: '/documentation', label: 'Documentation', icon: 'ℹ' },
];

const PROD_CLUSTERS: SubCluster[] = [PROD_NAV.projects, PROD_NAV.config];
const OPS_CLUSTERS: SubCluster[] = [OPS_NAV.review, OPS_NAV.monitor];

const PATH_TO_MODE: { to: string; mode: ActiveMode }[] = (() => {
  const acc: { to: string; mode: ActiveMode }[] = [];
  PROD_CLUSTERS.forEach((c) => c.items.forEach((i) => acc.push({ to: i.to, mode: 'prod' })));
  OPS_CLUSTERS.forEach((c) => c.items.forEach((i) => acc.push({ to: i.to, mode: 'ops' })));
  return acc.sort((a, b) => b.to.length - a.to.length);
})();

function detectModeForPath(pathname: string): ActiveMode | null {
  if (pathname === '/') return 'prod';
  for (const { to, mode } of PATH_TO_MODE) {
    if (to === '/') continue;
    if (pathname === to || pathname.startsWith(to + '/')) return mode;
  }
  return null;
}

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-text min-w-[1.25rem] text-center">
      {count}
    </span>
  );
}

function NavItemLink({
  item,
  collapsed,
  badgeCounts,
  end,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  badgeCounts: Record<string, number>;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={end}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-accent/10 text-accent-text'
            : 'text-muted hover:text-secondary hover:bg-surface-2'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      <span className="text-base">{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
      {!collapsed && item.badgeKey && <Badge count={badgeCounts[item.badgeKey] ?? 0} />}
    </NavLink>
  );
}

function ClusterSection({
  cluster,
  collapsed,
  badgeCounts,
  open,
  onToggle,
}: {
  cluster: SubCluster;
  collapsed: boolean;
  badgeCounts: Record<string, number>;
  open: boolean;
  onToggle: () => void;
}) {
  const expanded = open || collapsed;
  return (
    <>
      {!collapsed && (
        <button
          onClick={onToggle}
          className="flex items-center gap-2 mt-3 mb-1 px-3 text-xs text-disabled uppercase tracking-wider hover:text-muted transition-colors w-full text-left"
        >
          <span className="text-[10px]">{open ? '▼' : '▶'}</span>
          <span>{cluster.label}</span>
        </button>
      )}
      {collapsed && <div className="mt-2 border-t border-default" />}
      {expanded &&
        cluster.items.map((item) => (
          <NavItemLink
            key={item.to}
            item={item}
            collapsed={collapsed}
            badgeCounts={badgeCounts}
            end={item.to === '/' || item.to === '/tasks'}
          />
        ))}
    </>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [clusterOpen, setClusterOpen] = useState<Record<string, boolean>>({
    projects: true,
    config: true,
    review: true,
    monitor: true,
  });
  const { company, setCompany, isFiltered } = useCompany();
  const { data: companiesData } = useCompanies();
  const { data: stats } = useStats(isFiltered ? company : undefined);
  const { data: approvals } = useApprovals();
  const location = useLocation();
  const companyList = companiesData?.companies ?? [];
  useWebSocketNotifications();
  const approvalCount = approvals?.length ?? 0;

  const { active: activeMode, setActive: setActiveMode } = useActiveMode();

  // Read activeMode via ref so the auto-flip effect fires ONLY on pathname
  // change, never on manual toggle (which would otherwise revert the user click).
  const activeModeRef = useRef(activeMode);
  useEffect(() => {
    activeModeRef.current = activeMode;
  });

  useEffect(() => {
    const detected = detectModeForPath(location.pathname);
    if (detected && detected !== activeModeRef.current) {
      setActiveMode(detected);
    }
  }, [location.pathname, setActiveMode]);

  const badgeCounts: Record<string, number> = {
    ready: stats?.ready ?? 0,
    needsInput: stats?.needsInput ?? 0,
    waitingDavid: stats?.waitingDavid ?? 0,
    inProgress: stats?.inProgress ?? 0,
    actionCount: (stats?.blocked ?? 0) + approvalCount,
    researchQueue: stats?.researchQueue ?? 0,
  };

  const visibleClusters = useMemo(
    () => (activeMode === 'prod' ? PROD_CLUSTERS : OPS_CLUSTERS),
    [activeMode]
  );

  const toggleCluster = (id: string) =>
    setClusterOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-base">
      <ObservabilityBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - desktop */}
        <aside
          className={`hidden md:flex flex-col bg-surface-1 border-r border-default transition-all duration-200 ${
            collapsed ? 'w-14' : 'w-56'
          }`}
        >
          <div className="flex flex-col border-b border-default">
            <div className="flex items-center justify-between p-3">
              {!collapsed && (
                <div className="px-1">
                  <h1 className="text-lg font-bold text-accent-text">Pulse</h1>
                  <p className="text-xs text-faint">Operations Hub</p>
                </div>
              )}
              <div className="flex items-center gap-1">
                {!collapsed && <NotificationBell />}
                <button
                  onClick={() => setCollapsed(!collapsed)}
                  className="p-2 rounded text-faint hover:text-secondary hover:bg-surface-2 active:text-secondary active:bg-surface-2 transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {collapsed ? '»' : '«'}
                </button>
              </div>
            </div>
            {/* Company switcher */}
            {!collapsed && (
              <div className="px-3 pb-2">
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded bg-surface-2 border border-default text-xs text-secondary px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
                  title="Filter by company"
                >
                  <option value="all">All Companies</option>
                  {companyList.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {collapsed && isFiltered && (
              <div
                className="px-2 pb-2 flex justify-center"
                title={`Filtered: ${companyList.find((c) => c.slug === company)?.name ?? company}`}
              >
                <span className="w-2 h-2 rounded-full bg-accent" />
              </div>
            )}
            {/* PROD | OPS toggle */}
            <ModeToggle active={activeMode} onChange={setActiveMode} collapsed={collapsed} />
          </div>
          <nav className="flex-1 p-2 space-y-1 flex flex-col overflow-y-auto">
            {/* Pinned items above clusters (currently: Dashboard in PROD mode) */}
            {activeMode === 'prod' &&
              PROD_PINNED_TOP.map((item) => (
                <NavItemLink
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  badgeCounts={badgeCounts}
                  end={item.to === '/'}
                />
              ))}

            {/* Approval alert — pinned high (just below Dashboard) so it stays in view */}
            {approvalCount > 0 && !collapsed && (
              <NavLink
                to="/tasks?board=approvals"
                className="mx-1 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 hover:bg-red-500/15 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-medium text-red-400">
                  {approvalCount} pending approval{approvalCount !== 1 ? 's' : ''}
                </span>
              </NavLink>
            )}
            {approvalCount > 0 && collapsed && (
              <NavLink
                to="/tasks?board=approvals"
                className="flex justify-center py-1"
                title={`${approvalCount} pending approvals`}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              </NavLink>
            )}

            {visibleClusters.map((cluster) => (
              <ClusterSection
                key={cluster.id}
                cluster={cluster}
                collapsed={collapsed}
                badgeCounts={badgeCounts}
                open={clusterOpen[cluster.id] ?? true}
                onToggle={() => toggleCluster(cluster.id)}
              />
            ))}

            <div className="flex-1" />
            {FOOTER_NAV.map((item) => (
              <NavItemLink
                key={item.to}
                item={item}
                collapsed={collapsed}
                badgeCounts={badgeCounts}
              />
            ))}
            <div className="border-t border-subtle pt-1">
              <SessionCountdown collapsed={collapsed} />
            </div>
          </nav>
        </aside>

        {/* Mobile header */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="md:hidden flex items-center justify-between border-b border-default bg-surface-1 px-4 py-3">
            <h1 className="text-lg font-bold text-accent-text">Pulse</h1>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-muted hover:text-secondary active:text-secondary p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Toggle menu"
              >
                {menuOpen ? '✕' : '☰'}
              </button>
            </div>
          </header>

          {/* Mobile menu - both modes shown flatly with section headers */}
          {menuOpen && (
            <nav className="md:hidden bg-surface-1 border-b border-default p-2 space-y-1">
              {/* Mobile company switcher */}
              <div className="px-1 pb-2 mb-1 border-b border-default">
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded bg-surface-2 border border-default text-sm text-secondary px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent/50"
                >
                  <option value="all">All Companies</option>
                  {companyList.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1 mb-1 px-3 text-xs text-accent-text uppercase tracking-wider font-semibold">
                Prod
              </div>
              {PROD_PINNED_TOP.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `block rounded px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-accent/10 text-accent-text' : 'text-muted'
                    }`
                  }
                >
                  {item.icon} {item.label}
                </NavLink>
              ))}
              {PROD_CLUSTERS.map((cluster) => (
                <div key={cluster.id}>
                  <div className="mt-2 mb-1 px-3 text-[10px] text-disabled uppercase tracking-wider">
                    {cluster.label}
                  </div>
                  {cluster.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/' || item.to === '/tasks'}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `block rounded px-3 py-2 text-sm font-medium ${
                          isActive ? 'bg-accent/10 text-accent-text' : 'text-muted'
                        }`
                      }
                    >
                      {item.icon} {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
              <div className="mt-3 mb-1 px-3 text-xs text-accent-text uppercase tracking-wider font-semibold">
                Ops
              </div>
              {OPS_CLUSTERS.map((cluster) => (
                <div key={cluster.id}>
                  <div className="mt-2 mb-1 px-3 text-[10px] text-disabled uppercase tracking-wider">
                    {cluster.label}
                  </div>
                  {cluster.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `block rounded px-3 py-2 text-sm font-medium ${
                          isActive ? 'bg-accent/10 text-accent-text' : 'text-muted'
                        }`
                      }
                    >
                      {item.icon} {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
              <div className="border-t border-default mt-2 pt-2">
                {FOOTER_NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `block rounded px-3 py-2 text-sm font-medium ${
                        isActive ? 'bg-accent/10 text-accent-text' : 'text-muted'
                      }`
                    }
                  >
                    {item.icon} {item.label}
                  </NavLink>
                ))}
              </div>
            </nav>
          )}

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
