import { useState, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Header } from '../components/layout/Header';
import { useTimeline, useAlerts } from '../api/nexus-ops';
import { useNexusOpsWebSocket } from '../hooks/useNexusOpsWebSocket.js';
import { StatsBar } from '../components/nexus-ops/StatsBar';
import { TimelineFilters, type FilterState } from '../components/nexus-ops/TimelineFilters';
import { UnifiedTimeline } from '../components/nexus-ops/UnifiedTimeline';
import { EntitySidebar, type EntityType } from '../components/nexus-ops/EntitySidebar';
import { DetailDrawer } from '../components/nexus-ops/DetailDrawer';
import { TaskJourneyPanel } from '../components/nexus-ops/TaskJourneyPanel';
import { JobDetailPanel } from '../components/nexus-ops/JobDetailPanel';
import { GraphView } from '../components/nexus-ops/GraphView';
import { PipelineFlowView } from '../components/nexus-ops/PipelineFlowView';
import { AnalyticsView } from '../components/nexus-ops/AnalyticsView';
import { AlertsBanner } from '../components/nexus-ops/AlertsBanner';
import { AlertConfigModal } from '../components/nexus-ops/AlertConfigModal';
import { ExportMenu } from '../components/nexus-ops/ExportMenu';
import { KeyboardHelp } from '../components/nexus-ops/KeyboardHelp';
import { useNexusOpsKeyboard } from '../hooks/useNexusOpsKeyboard';

const TimelinePage = lazy(() => import('./TimelinePage'));

type ViewTab = 'timeline' | 'graph' | 'analytics' | 'schedule';

const DEFAULT_LIMIT = 100;

export default function NexusOpsPage() {
  useNexusOpsWebSocket();

  // Parse deep-link params once on mount using a lazy ref.
  // useRef persists across re-renders but resets on remount.
  const deepLinkRef = useRef<{
    taskId: string | null;
    job: string | null;
    source: FilterState['source'] | null;
    category: FilterState['category'] | null;
    tab: string | null;
  } | null>(null);
  if (deepLinkRef.current === null) {
    const params = new URLSearchParams(window.location.search);
    deepLinkRef.current = {
      taskId: params.get('task_id') || null,
      job: params.get('job') || null,
      source: (params.get('source') || null) as FilterState['source'] | null,
      category: (params.get('category') || null) as FilterState['category'] | null,
      tab: params.get('tab') || null,
    };
    // Clean URL without triggering React Router re-render
    if (
      deepLinkRef.current.taskId ||
      deepLinkRef.current.job ||
      deepLinkRef.current.source ||
      deepLinkRef.current.category ||
      deepLinkRef.current.tab
    ) {
      window.history.replaceState(null, '', '/nexus-ops');
    }
  }
  const dl = deepLinkRef.current;

  const [activeTab, setActiveTab] = useState<ViewTab>(
    dl.tab === 'schedule' ? 'schedule' : 'timeline',
  );
  const [filters, setFilters] = useState<FilterState>(() => ({
    timeRangeHours: 24,
    ...(dl.source ? { source: dl.source } : {}),
    ...(dl.category ? { category: dl.category } : {}),
    ...(dl.taskId ? { task_id: dl.taskId } : {}),
    ...(dl.job ? { job: dl.job } : {}),
  }));
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(dl.taskId);
  const [selectedJob, setSelectedJob] = useState<string | null>(dl.taskId ? null : dl.job);
  const [selectedEntityType, setSelectedEntityType] = useState<EntityType | null>(
    dl.taskId ? 'task' : dl.job ? 'job' : null,
  );
  const [alertConfigOpen, setAlertConfigOpen] = useState(false);
  const [graphMode, setGraphMode] = useState<'pipeline' | 'topology'>('pipeline');
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  const { data: alertsData } = useAlerts();

  const drawerOpen = (selectedTaskId !== null || selectedJob !== null) && activeTab !== 'timeline';

  const closeDrawer = useCallback(() => {
    setSelectedTaskId(null);
    setSelectedJob(null);
    setSelectedEntityType(null);
  }, []);

  const handleEntitySelect = useCallback((id: string, type: EntityType) => {
    setSelectedEntityType(type);
    if (type === 'task') {
      setSelectedJob(null);
      setSelectedTaskId(id);
    } else {
      setSelectedTaskId(null);
      setSelectedJob(id);
    }
  }, []);

  useNexusOpsKeyboard({
    onTabChange: setActiveTab,
    onTimeRange: (hours) => {
      setFilters((f) => ({ ...f, timeRangeHours: hours }));
      setLimit(DEFAULT_LIMIT);
    },
    onEscape: () => {
      if (showKeyboardHelp) {
        setShowKeyboardHelp(false);
        return;
      }
      if (drawerOpen) {
        closeDrawer();
        return;
      }
      if (alertConfigOpen) {
        setAlertConfigOpen(false);
        return;
      }
    },
    onToggleHelp: () => setShowKeyboardHelp((prev) => !prev),
  });

  const handleTaskClick = useCallback((taskId: string) => {
    setSelectedJob(null);
    setSelectedTaskId(taskId);
  }, []);

  const handleJobClick = useCallback((job: string) => {
    setSelectedTaskId(null);
    setSelectedJob(job);
  }, []);

  const handleGraphNodeClick = useCallback((nodeId: string, nodeType: string) => {
    if (nodeType === 'task') {
      setSelectedJob(null);
      setSelectedTaskId(nodeId);
    } else if (nodeType === 'job') {
      setSelectedTaskId(null);
      setSelectedJob(nodeId);
    }
  }, []);

  const timeRange = useMemo(() => {
    const to = new Date().toISOString();
    const from = new Date(Date.now() - filters.timeRangeHours * 3600_000).toISOString();
    return { from, to };
  }, [filters.timeRangeHours]);

  const { data, isLoading, isError } = useTimeline({
    from: timeRange.from,
    to: timeRange.to,
    source: filters.source,
    category: filters.category,
    task_id: filters.task_id,
    job: filters.job,
    persona: filters.persona,
    limit,
  });

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const taskStatuses = data?.taskStatuses ?? {};
  const hasMore = events.length < total;

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <Header title="Nexus-Ops">
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">Connected Operations View</span>
          <ExportMenu events={events} />
          <button
            onClick={() => setShowKeyboardHelp((prev) => !prev)}
            className="text-faint hover:text-tertiary transition-colors"
            title="Keyboard Shortcuts (?)"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
          <button
            onClick={() => setAlertConfigOpen(true)}
            className="text-faint hover:text-tertiary transition-colors"
            title="Alert Configuration"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </Header>

      {alertsData?.alerts && <AlertsBanner alerts={alertsData.alerts} />}

      {isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Failed to load timeline data. Check that the server is running.
        </div>
      )}

      <TimelineFilters
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setLimit(DEFAULT_LIMIT);
        }}
      />

      <StatsBar stats={data?.stats} />

      {/* View tab switcher — scrollable on small screens */}
      <div className="flex rounded-lg border border-default overflow-x-auto w-full sm:w-fit">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`px-4 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'timeline'
              ? 'bg-accent/20 text-accent-text'
              : 'text-muted hover:text-secondary hover:bg-surface-2'
          }`}
        >
          Timeline
        </button>
        <button
          onClick={() => setActiveTab('graph')}
          className={`px-4 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'graph'
              ? 'bg-accent/20 text-accent-text'
              : 'text-muted hover:text-secondary hover:bg-surface-2'
          }`}
        >
          Graph
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'analytics'
              ? 'bg-accent/20 text-accent-text'
              : 'text-muted hover:text-secondary hover:bg-surface-2'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-4 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'schedule'
              ? 'bg-accent/20 text-accent-text'
              : 'text-muted hover:text-secondary hover:bg-surface-2'
          }`}
        >
          Schedule
        </button>
      </div>

      {activeTab === 'timeline' ? (
        <div
          className="flex rounded-lg border border-default bg-surface-base overflow-hidden"
          style={{ height: 'calc(100vh - 340px)', minHeight: 300 }}
        >
          {/* Entity sidebar */}
          <EntitySidebar
            events={events}
            taskStatuses={taskStatuses}
            selectedId={selectedTaskId ?? selectedJob}
            selectedType={selectedEntityType}
            onSelect={handleEntitySelect}
          />

          {/* Main detail panel */}
          <div className="flex-1 overflow-y-auto">
            {selectedTaskId ? (
              <TaskJourneyPanel
                taskId={selectedTaskId}
                onJobClick={(job) => handleEntitySelect(job, 'job')}
                onClose={closeDrawer}
              />
            ) : selectedJob ? (
              <JobDetailPanel
                jobName={selectedJob}
                onTaskClick={(taskId) => handleEntitySelect(taskId, 'task')}
                onClose={closeDrawer}
              />
            ) : (
              /* Default: show event feed when nothing selected */
              <div className="p-4">
                <UnifiedTimeline
                  events={events}
                  total={total}
                  isLoading={isLoading}
                  hasMore={hasMore}
                  onLoadMore={() => setLimit((l) => l + DEFAULT_LIMIT)}
                  onTaskClick={(taskId) => handleEntitySelect(taskId, 'task')}
                  onJobClick={(job) => handleEntitySelect(job, 'job')}
                />
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'graph' ? (
        <div>
          <div className="flex rounded border border-border/30 w-fit mb-3">
            <button
              onClick={() => setGraphMode('pipeline')}
              className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                graphMode === 'pipeline'
                  ? 'bg-accent/15 text-accent-text'
                  : 'text-faint hover:text-secondary'
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setGraphMode('topology')}
              className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                graphMode === 'topology'
                  ? 'bg-accent/15 text-accent-text'
                  : 'text-faint hover:text-secondary'
              }`}
            >
              Topology
            </button>
          </div>
          {graphMode === 'pipeline' ? (
            <PipelineFlowView onNodeClick={handleGraphNodeClick} />
          ) : (
            <GraphView
              from={timeRange.from}
              to={timeRange.to}
              filters={{ project: filters.task_id, job: filters.job, persona: filters.persona }}
              onNodeClick={handleGraphNodeClick}
              activeAlerts={alertsData?.alerts?.filter((a) => !a.acknowledged)}
            />
          )}
        </div>
      ) : activeTab === 'analytics' ? (
        <AnalyticsView from={timeRange.from} to={timeRange.to} />
      ) : activeTab === 'schedule' ? (
        <Suspense fallback={<div className="text-faint py-8 text-center">Loading schedule...</div>}>
          <TimelinePage />
        </Suspense>
      ) : null}

      <DetailDrawer open={drawerOpen} onClose={closeDrawer}>
        {selectedTaskId && (
          <TaskJourneyPanel
            taskId={selectedTaskId}
            onJobClick={handleJobClick}
            onClose={closeDrawer}
          />
        )}
        {selectedJob && (
          <JobDetailPanel
            jobName={selectedJob}
            onTaskClick={handleTaskClick}
            onClose={closeDrawer}
          />
        )}
      </DetailDrawer>

      <AlertConfigModal
        rules={alertsData?.rules ?? []}
        open={alertConfigOpen}
        onClose={() => setAlertConfigOpen(false)}
      />

      {showKeyboardHelp && <KeyboardHelp onClose={() => setShowKeyboardHelp(false)} />}
    </div>
  );
}
