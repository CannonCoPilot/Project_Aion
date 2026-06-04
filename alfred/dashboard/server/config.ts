import { resolve } from 'node:path';

// All paths are configurable via environment variables.
// When running in Docker, paths are set by volume mounts in docker-compose.yml.
// When running locally, set WORKSPACE_DIR to your project root.
const workspace = process.env.WORKSPACE_DIR || process.cwd();

export const config = {
  port: parseInt(process.env.PORT || '8600', 10),
  host: process.env.HOST || '0.0.0.0',
  frontendDir: resolve(import.meta.dirname, '../../frontend/dist'),
  nexusDbPath: process.env.NEXUS_DB_PATH || resolve(workspace, '.claude/jobs/state/nexus.db'),
  dispatcherHeartbeatPath:
    process.env.DISPATCHER_HEARTBEAT_PATH ||
    resolve(workspace, '.claude/jobs/state/dispatcher-heartbeat'),
  dispatcherPath:
    process.env.DISPATCHER_PATH || resolve(workspace, '.claude/jobs/dispatcher.sh'),
  wsPollInterval: parseInt(process.env.WS_POLL_INTERVAL || '5000', 10),
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || '',
  dashboardDbPath:
    process.env.DASHBOARD_DB_PATH || resolve(import.meta.dirname, '../data/dashboard.db'),
  taskReviewerResultsDir:
    process.env.TASK_REVIEWER_RESULTS_DIR ||
    resolve(workspace, '.claude/agent-output/results/ai-reviewer'),
  executionLogsDir:
    process.env.EXECUTIONS_DIR ||
    process.env.EXECUTION_LOGS_DIR ||
    resolve(workspace, '.claude/logs/headless/executions'),
  structuredLogsPath:
    process.env.STRUCTURED_LOGS_PATH ||
    resolve(workspace, '.claude/logs/headless/nexus.jsonl'),
  costLedgerPath:
    process.env.COST_LEDGER_PATH || resolve(workspace, '.claude/data/cost-ledger.jsonl'),
  relayMessagesPath:
    process.env.RELAY_MESSAGES_PATH ||
    resolve(workspace, '.claude/jobs/state/messages.jsonl'),
  nexusSettingsPath:
    process.env.NEXUS_SETTINGS_PATH ||
    resolve(workspace, '.claude/jobs/state/nexus-settings.json'),
  projectContextDir:
    process.env.PROJECT_CONTEXT_DIR || resolve(workspace, 'knowledge/projects'),
  documentGuardConfigPath:
    process.env.DOCUMENT_GUARD_CONFIG_PATH ||
    resolve(workspace, '.claude/hooks/document-guard.config.js'),
  documentGuardLogPath:
    process.env.DOCUMENT_GUARD_LOG_PATH ||
    resolve(workspace, '.claude/logs/document-guard.jsonl'),
  companyRegistryPath:
    process.env.COMPANY_REGISTRY_PATH ||
    resolve(workspace, '.claude/context/systems/company-registry.yaml'),
  pulsarsFilePath:
    process.env.PULSARS_FILE_PATH || resolve(workspace, '.claude/jobs/pulsars.yaml'),
  pulsarStatePath:
    process.env.PULSAR_STATE_PATH || resolve(workspace, '.claude/jobs/state/pulsar-state'),
  pulsarKnowledgePath:
    process.env.PULSAR_KNOWLEDGE_PATH ||
    resolve(workspace, '.claude/jobs/state/pulsar-knowledge'),
  pulsarRunnerPath:
    process.env.PULSAR_RUNNER_PATH || resolve(workspace, '.claude/jobs/bin/pulsar-runner.sh'),
  sessionMetricsPath:
    process.env.SESSION_METRICS_PATH || resolve(workspace, 'session-metrics.jsonl'),
  tokenCompressionMetricsPath:
    process.env.TOKEN_COMPRESSION_METRICS_PATH ||
    resolve(workspace, '.claude/metrics/token-compression/session-metrics.jsonl'),
  timezone: process.env.TZ || 'UTC',
  pulseWsUrl: (() => {
    const api = process.env.PULSE_API_URL ||
      (process.env.PULSE_URL ? `${process.env.PULSE_URL.replace(/\/$/, '')}/api/v1` : 'http://pulse:8700/api/v1');
    return api.replace(/^http/, 'ws').replace(/\/api\/v1$/, '') + '/api/v1/socket';
  })(),
};
