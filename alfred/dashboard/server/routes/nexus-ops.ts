import type { FastifyInstance } from 'fastify';
import type {
  TimelineQuery,
  TimelineResponse,
  EventSource,
  EventCategory,
} from '../services/event-correlator.js';
import { getTimeline, getTaskJourney, getJobDetail } from '../services/event-correlator.js';
import { buildGraph } from '../services/graph-builder.js';
import { getAnalytics } from '../services/analytics.js';
import {
  evaluateAlerts,
  getAlertRules,
  updateAlertRule,
  acknowledgeAlert,
} from '../services/alert-engine.js';
import type { AlertRule } from '../services/alert-engine.js';
import { detectCascade } from '../services/cascade-detector.js';
import { buildPipelineDAG } from '../services/pipeline-dag-builder.js';

export async function nexusOpsRoutes(app: FastifyInstance) {
  app.get('/api/nexus-ops/timeline', async (request) => {
    const query = request.query as Record<string, string>;

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const timelineQuery: TimelineQuery = {
      from: query.from || dayAgo.toISOString(),
      to: query.to || now.toISOString(),
      task_id: query.task_id || undefined,
      job: query.job || undefined,
      persona: query.persona || undefined,
      project: query.project || undefined,
      source: (query.source as EventSource) || undefined,
      category: (query.category as EventCategory) || undefined,
      limit: parseInt(query.limit || '500', 10),
      offset: parseInt(query.offset || '0', 10),
    };

    try {
      const result: TimelineResponse = await getTimeline(timelineQuery);
      return result;
    } catch (err) {
      app.log.error({ err }, 'Failed to fetch nexus-ops timeline');
      return { error: 'Failed to fetch timeline' };
    }
  });

  app.get('/api/nexus-ops/task-journey/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };

    try {
      const result = await getTaskJourney(taskId);
      if (!result) {
        reply.code(404);
        return { error: `Task ${taskId} not found` };
      }
      return result;
    } catch (err) {
      app.log.error({ err }, 'Failed to fetch task journey');
      return { error: 'Failed to fetch task journey' };
    }
  });

  app.get('/api/nexus-ops/job-detail/:jobName', async (request) => {
    const { jobName } = request.params as { jobName: string };
    const query = request.query as Record<string, string>;

    try {
      const result = getJobDetail(jobName, query.from || undefined, query.to || undefined);
      return result;
    } catch (err) {
      app.log.error({ err }, 'Failed to fetch job detail');
      return { error: 'Failed to fetch job detail' };
    }
  });

  app.get('/api/nexus-ops/analytics', async (request) => {
    const query = request.query as Record<string, string>;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const from = query.from || weekAgo.toISOString();
    const to = query.to || now.toISOString();

    try {
      const result = getAnalytics(from, to);
      return result;
    } catch (err) {
      app.log.error({ err }, 'Failed to compute nexus-ops analytics');
      return { error: 'Failed to compute analytics' };
    }
  });

  app.get('/api/nexus-ops/graph', async (request) => {
    const query = request.query as Record<string, string>;

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const filters: { project?: string; job?: string; persona?: string } = {};
    if (query.project) filters.project = query.project;
    if (query.job) filters.job = query.job;
    if (query.persona) filters.persona = query.persona;

    try {
      const result = await buildGraph(
        query.from || dayAgo.toISOString(),
        query.to || now.toISOString(),
        Object.keys(filters).length > 0 ? filters : undefined,
      );
      return result;
    } catch (err) {
      app.log.error({ err }, 'Failed to build nexus-ops graph');
      return { error: 'Failed to build graph' };
    }
  });

  // --- Pipeline DAG ---

  app.get('/api/nexus-ops/pipeline-dag', async () => {
    try {
      const result = await buildPipelineDAG();
      return result;
    } catch (err) {
      app.log.error({ err }, 'Failed to build pipeline DAG');
      return { error: 'Failed to build pipeline DAG' };
    }
  });

  // --- Cascade Detection ---

  app.get('/api/nexus-ops/cascade', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const { nodeId, from, to } = query;

    if (!nodeId) {
      reply.code(400);
      return { error: 'nodeId is required (e.g., job:task-executor)' };
    }

    try {
      const result = await detectCascade(nodeId, from, to);
      if (!result) {
        reply.code(404);
        return { error: `Node ${nodeId} not found in graph` };
      }
      return result;
    } catch (err) {
      app.log.error({ err }, 'Failed to detect cascade impact');
      return { error: 'Failed to detect cascade impact' };
    }
  });

  // --- Alerts ---

  app.get('/api/nexus-ops/alerts', async () => {
    try {
      const alerts = await evaluateAlerts();
      const rules = getAlertRules();
      return { alerts, rules };
    } catch (err) {
      app.log.error({ err }, 'Failed to evaluate alerts');
      return { alerts: [], rules: [] };
    }
  });

  app.put('/api/nexus-ops/alerts/rules/:ruleId', async (request, reply) => {
    const { ruleId } = request.params as { ruleId: string };
    const body = request.body as Partial<AlertRule>;

    try {
      const updated = updateAlertRule(ruleId, body);
      return updated;
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found')) {
        reply.code(404);
        return { error: message };
      }
      app.log.error({ err }, 'Failed to update alert rule');
      reply.code(500);
      return { error: 'Failed to update alert rule' };
    }
  });

  app.post('/api/nexus-ops/alerts/:alertId/acknowledge', async (request) => {
    const { alertId } = request.params as { alertId: string };

    try {
      acknowledgeAlert(alertId);
      return { ok: true };
    } catch (err) {
      app.log.error({ err }, 'Failed to acknowledge alert');
      return { error: 'Failed to acknowledge alert' };
    }
  });
}
