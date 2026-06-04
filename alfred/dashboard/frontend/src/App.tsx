import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSettings } from './api/settings';
import ToastProvider from './components/notifications/ToastProvider';
import AppShell from './components/layout/AppShell';
import OverviewPage from './pages/OverviewPage';
import DashboardPage from './pages/DashboardPage';
import TriagePage from './pages/TriagePage';
import TaskDetailPage from './pages/TaskDetailPage';
import ReferencePage from './pages/ReferencePage';
import KanbanPage from './pages/KanbanPage';
import HealthPage from './pages/HealthPage';
import SettingsPage from './pages/SettingsPage';
import PersonasPage from './pages/PersonasPage';
import ProjectsPage from './pages/ProjectsPage';
import RulesPage from './pages/RulesPage';
import ProjectsListPage from './pages/ProjectsListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import DigestPage from './pages/DigestPage';
import PipelinePage from './pages/PipelinePage';
import TokenCompressionPage from './pages/TokenCompressionPage';
import ObservabilityPage from './pages/ObservabilityPage';
// DecisionsPage import intentionally removed — /decisions now redirects to /reo
// (DecisionsRedirect below). Page file kept in tree for one release cycle as
// fallback per re-cleave plan §5.2 keep-one-cycle decision; scheduled for
// deletion at REO Phase 5.5 PRE-SHIP AUDIT.
import ReoPage from './pages/ReoPage';
import ReviewPage from './pages/ReviewPage';
import NexusOpsPage from './pages/NexusOpsPage';
import NotificationsPage from './pages/NotificationsPage';
import ReportPage from './pages/ReportPage';
import FindingsPage from './pages/FindingsPage';
import PatternsPage from './pages/PatternsPage';
import RecurringJobsPage from './pages/RecurringJobsPage';
import DocumentGuardPage from './pages/DocumentGuardPage';
import BudgetPage from './pages/BudgetPage';
import UsagePage from './pages/UsagePage';
import CortexPage from './pages/CortexPage';
import PulsarsPage from './pages/PulsarsPage';
import AccountPage from './pages/AccountPage';
import ProjectCreatorPage from './pages/ProjectCreatorPage';
import JarvisMemoryPage from './pages/JarvisMemoryPage';
import TestCockpitPage from './pages/TestCockpitPage';
import { CompanyProvider } from './hooks/useCompany';

// Preserves search params across the /decisions → /reo redirect. Bare
// <Navigate to="/reo" /> strips search in react-router-dom v7. The wrapper
// keeps deep-link shapes ?actor=, ?decision_type=, ?outcome=, ?thread_id=
// alive; ReoPage reads them via readInitialFilters() on mount.
function DecisionsRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: '/reo', search: location.search }} replace />;
}

export default function App() {
  // Sync settings (archive threshold, etc.) from server to localStorage on mount
  useSettings();

  return (
    <ToastProvider>
      <CompanyProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/tasks" element={<DashboardPage />} />
            <Route path="/board" element={<KanbanPage />} />
            <Route path="/triage" element={<TriagePage />} />
            <Route path="/queue" element={<Navigate to="/tasks?board=blocked" replace />} />
            <Route path="/ready" element={<Navigate to="/tasks?board=ready" replace />} />
            <Route path="/approvals" element={<Navigate to="/tasks?board=approvals" replace />} />
            <Route
              path="/research"
              element={
                <Navigate
                  to="/tasks?label=review%3Aresearch%2Cwaiting%3Adavid&status=all"
                  replace
                />
              }
            />
            <Route path="/digest" element={<DigestPage />} />
            <Route path="/pipeline" element={<PipelinePage />} />
            <Route path="/token-compression" element={<TokenCompressionPage />} />
            <Route path="/reviews" element={<ReviewPage />} />
            <Route path="/observability" element={<ObservabilityPage />} />
            <Route path="/decisions" element={<DecisionsRedirect />} />
            <Route path="/reo" element={<ReoPage />} />
            <Route path="/nexus-ops" element={<NexusOpsPage />} />
            <Route path="/jobs" element={<RecurringJobsPage />} />
            <Route path="/activity" element={<Navigate to="/nexus-ops" replace />} />
            <Route path="/health" element={<HealthPage />} />
            <Route path="/schedule" element={<Navigate to="/nexus-ops?tab=schedule" replace />} />
            <Route path="/timeline" element={<Navigate to="/nexus-ops?tab=schedule" replace />} />
            <Route path="/personas" element={<PersonasPage />} />
            <Route path="/personas/:name" element={<PersonasPage />} />
            <Route path="/jarvis-memory" element={<JarvisMemoryPage />} />
            <Route path="/cross-project" element={<ProjectsPage />} />
            <Route path="/automation" element={<RulesPage />} />
            <Route path="/rules" element={<Navigate to="/automation" replace />} />
            <Route path="/projects" element={<ProjectsListPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/orchestrations" element={<Navigate to="/projects" replace />} />
            <Route path="/orchestrations/:file" element={<Navigate to="/projects" replace />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/findings" element={<FindingsPage />} />
            <Route path="/patterns" element={<PatternsPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="/cortex" element={<CortexPage />} />
            <Route path="/pulsars" element={<PulsarsPage />} />
            <Route path="/create" element={<ProjectCreatorPage />} />
            <Route path="/document-guard" element={<DocumentGuardPage />} />
            <Route path="/test-cockpit" element={<TestCockpitPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/documentation" element={<ReferencePage />} />
            <Route path="/labels" element={<Navigate to="/documentation" replace />} />
            <Route path="/reference" element={<Navigate to="/documentation" replace />} />
            <Route path="/docs" element={<Navigate to="/documentation" replace />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
          </Routes>
        </AppShell>
      </CompanyProvider>
    </ToastProvider>
  );
}
