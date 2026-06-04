import type { FastifyInstance } from 'fastify';
import { computeStageMetrics, getTaskStageHistory } from '../services/stage-metrics.js';

export async function stageAnalyticsRoutes(app: FastifyInstance) {
  // Aggregate stage metrics — avg time, throughput, bottleneck
  // Query param: days=7 (default) — time window for throughput calculation (1–90)
  app.get('/api/analytics/stages', async (request) => {
    const { days } = request.query as { days?: string };
    const daysNum = days ? Math.max(1, Math.min(90, parseInt(days, 10) || 7)) : 7;
    return await computeStageMetrics(daysNum);
  });

  // Per-task stage history — timeline of stage transitions
  app.get('/api/analytics/stages/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const history = await getTaskStageHistory(taskId);
    if (!history) return reply.status(404).send({ error: 'Task not found' });
    return history;
  });
}
