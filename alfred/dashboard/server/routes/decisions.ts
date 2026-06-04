import type { FastifyInstance } from 'fastify';
import {
  listDecisions,
  getDecisionStats,
  getDecisionsByThread,
  getStoryline,
  listRecentThreads,
  type DecisionFilter,
} from '../services/pulse-events.js';

export async function decisionsRoutes(app: FastifyInstance) {
  // GET /api/decisions — list with filters
  app.get<{
    Querystring: {
      actor?: string;
      decision_type?: string;
      outcome?: string;
      thread_id?: string;
      task_id?: string;
      since?: string;
      until?: string;
      limit?: string;
      offset?: string;
    };
  }>('/api/decisions', async (req, reply) => {
    const q = req.query;
    const filter: DecisionFilter = {
      actor: q.actor,
      decision_type: q.decision_type,
      outcome: q.outcome,
      thread_id: q.thread_id,
      task_id: q.task_id,
      since: q.since,
      until: q.until,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
      offset: q.offset ? parseInt(q.offset, 10) : undefined,
    };
    try {
      const decisions = await listDecisions(filter);
      return reply.send({ decisions });
    } catch (err) {
      app.log.error({ err }, 'listDecisions failed');
      return reply.status(503).send({ error: 'pulse_dev unreachable', detail: String(err) });
    }
  });

  // GET /api/decisions/stats — aggregate counters for stat cards
  app.get<{ Querystring: { hours?: string } }>('/api/decisions/stats', async (req, reply) => {
    const hours = req.query.hours ? parseInt(req.query.hours, 10) : 24;
    try {
      const stats = await getDecisionStats(hours);
      return reply.send(stats);
    } catch (err) {
      app.log.error({ err }, 'getDecisionStats failed');
      return reply.status(503).send({ error: 'pulse_dev unreachable', detail: String(err) });
    }
  });

  // GET /api/decisions/threads — recent threads with decision counts
  app.get<{ Querystring: { limit?: string } }>('/api/decisions/threads', async (req, reply) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    try {
      const threads = await listRecentThreads(limit);
      return reply.send({ threads });
    } catch (err) {
      app.log.error({ err }, 'listRecentThreads failed');
      return reply.status(503).send({ error: 'pulse_dev unreachable', detail: String(err) });
    }
  });

  // GET /api/decisions/thread/:thread_id — all decisions for one thread
  app.get<{ Params: { thread_id: string } }>(
    '/api/decisions/thread/:thread_id',
    async (req, reply) => {
      try {
        const decisions = await getDecisionsByThread(req.params.thread_id);
        return reply.send({ decisions });
      } catch (err) {
        app.log.error({ err }, 'getDecisionsByThread failed');
        return reply.status(503).send({ error: 'pulse_dev unreachable', detail: String(err) });
      }
    }
  );

  // GET /api/storyline/:thread_id — joined audit + cost + decision events
  app.get<{ Params: { thread_id: string } }>(
    '/api/storyline/:thread_id',
    async (req, reply) => {
      try {
        const events = await getStoryline(req.params.thread_id);
        return reply.send({ events });
      } catch (err) {
        app.log.error({ err }, 'getStoryline failed');
        return reply.status(503).send({ error: 'pulse_dev unreachable', detail: String(err) });
      }
    }
  );
}
