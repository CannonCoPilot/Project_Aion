import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { taskRoutes } from './routes/tasks.js';
import { eventRoutes } from './routes/events.js';
import { labelRoutes } from './routes/labels.js';
import { statsRoutes } from './routes/stats.js';
import { statsThroughputRoutes } from './routes/stats-throughput.js';
import { healthRoutes } from './routes/health.js';
import { activityRoutes } from './routes/activity.js';
import { approvalRoutes } from './routes/approvals.js';
import { notificationRoutes } from './routes/notifications.js';
import { projectRoutes } from './routes/projects.js';
import { personaRoutes } from './routes/personas.js';
import { timelineRoutes } from './routes/timeline.js';
import { rulesRoutes } from './routes/rules.js';
import { pulseProjectRoutes } from './routes/pulse-projects.js';
import { pipelineRoutes } from './routes/pipeline.js';
import { pipelineStatusRoutes } from './routes/pipeline-status.js';
import { digestRoutes } from './routes/digest.js';
import { paiProxyRoutes } from './routes/pai-proxy.js';
import { reviewRoutes } from './routes/reviews.js';
import { nexusLogRoutes } from './routes/nexus-logs.js';
import { ollamaRoutes } from './routes/ollama.js';
import { nexusOpsRoutes } from './routes/nexus-ops.js';
import { settingsRoutes } from './routes/settings.js';
import { nexusSettingsRoutes } from './routes/nexus-settings.js';
import { obsidianRoutes } from './routes/obsidian.js';
import { stageAnalyticsRoutes } from './routes/stage-analytics.js';
import { reportRoutes } from './routes/reports.js';
import { findingsRoutes } from './routes/findings.js';
import { patternRoutes } from './routes/patterns.js';
import { recurringJobsRoutes } from './routes/recurring-jobs.js';
import { documentGuardRoutes } from './routes/document-guard.js';
import { companyRoutes } from './routes/companies.js';
import { costRoutes } from './routes/costs.js';
import { nexusHealthRoutes } from './routes/nexus-health.js';
import { cortexRoutes } from './routes/cortex.js';
import { pulsarsRoutes } from './routes/pulsars.js';
import { authRoutes } from './routes/auth.js';
import { usageRoutes } from './routes/usage.js';
import { tokenCompressionRoutes } from './routes/token-compression.js';
import { projectCreatorRoutes } from './routes/project-creator.js';
import { executionStreamRoutes } from './routes/execution-stream.js';
import { decisionsRoutes } from './routes/decisions.js';
import { reoRoutes } from './routes/reo.js';
import { pulseV1ProxyRoutes } from './routes/pulse-v1-proxy.js';
import { jarvisMemoryRoutes } from './routes/jarvis-memory.js';
import { runWorkAggregator } from './scripts/work-aggregator.js';
import { startWebSocket, stopWebSocket } from './services/websocket.js';
import { startPulseWsProxy, stopPulseWsProxy } from './services/pulse-ws-proxy.js';
import { closeDb } from './services/nexus-db.js';
import { closeDashboardDb } from './services/dashboard-db.js';

const app = Fastify({ logger: true });

// API routes
await app.register(taskRoutes);
await app.register(eventRoutes);
await app.register(labelRoutes);
await app.register(statsRoutes);
await app.register(statsThroughputRoutes);
await app.register(healthRoutes);
await app.register(activityRoutes);
await app.register(approvalRoutes);
await app.register(notificationRoutes);
await app.register(projectRoutes);
await app.register(personaRoutes);
await app.register(timelineRoutes);
await app.register(rulesRoutes);
await app.register(pulseProjectRoutes);
await app.register(pipelineRoutes);
await app.register(pipelineStatusRoutes);
await app.register(digestRoutes);
await app.register(paiProxyRoutes);
await app.register(reviewRoutes);
await app.register(nexusLogRoutes);
await app.register(ollamaRoutes);
await app.register(nexusOpsRoutes);
await app.register(settingsRoutes);
await app.register(nexusSettingsRoutes);
await app.register(obsidianRoutes);
await app.register(stageAnalyticsRoutes);
await app.register(reportRoutes);
await app.register(findingsRoutes);
await app.register(patternRoutes);
await app.register(recurringJobsRoutes);
await app.register(documentGuardRoutes);
await app.register(companyRoutes);
await app.register(costRoutes);
await app.register(nexusHealthRoutes);
await app.register(cortexRoutes);
await app.register(pulsarsRoutes);
await app.register(authRoutes);
await app.register(usageRoutes);
await app.register(tokenCompressionRoutes);
await app.register(projectCreatorRoutes);
await app.register(executionStreamRoutes);
await app.register(decisionsRoutes);
await app.register(reoRoutes);
// Phase 1.2: forward /api/v1/* requests to pulse (Phase 1.1 endpoints live there).
// Keeps frontend on a single /api origin while preserving the dashboard ↔ pulse boundary.
await app.register(pulseV1ProxyRoutes);
await app.register(jarvisMemoryRoutes);

// Serve frontend static files in production
if (existsSync(config.frontendDir)) {
  await app.register(fastifyStatic, {
    root: config.frontendDir,
    wildcard: false,
  });

  // SPA fallback — serve index.html for non-API routes
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}

let aggregatorInterval: ReturnType<typeof setInterval> | undefined;

try {
  await app.listen({ port: config.port, host: config.host });

  // Start WebSocket server on the same HTTP server
  const httpServer = app.server;
  startWebSocket(httpServer);
  startPulseWsProxy(httpServer);
  console.log(`Pulse Dashboard running on http://${config.host}:${config.port}`);
  console.log(`WebSocket available at ws://${config.host}:${config.port}/ws`);

  // Run work aggregator on startup + every 5 minutes
  runWorkAggregator().catch((err) => console.error('[work-aggregator] Initial run failed:', err));
  aggregatorInterval = setInterval(
    () => {
      runWorkAggregator().catch((err) =>
        console.error('[work-aggregator] Periodic run failed:', err),
      );
    },
    5 * 60 * 1000,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async () => {
  clearInterval(aggregatorInterval);
  stopWebSocket();
  stopPulseWsProxy();
  closeDb();
  closeDashboardDb();
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
