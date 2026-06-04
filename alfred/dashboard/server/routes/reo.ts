/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * REO routes — proxy to Pulse READ API for the decision filing-system page.
 *
 * Per plans/aifred-pro-dev-reo-page.md: dashboard does not touch
 * pulse.{decision_events,cost_events,audit_log} directly. All reads go
 * through Pulse HTTP. This file is the boundary-correct proxy layer; the
 * underlying SQL lives in pulse/app.py:get_observability_timeline +
 * get_persona_aggregates + get_decision_by_id.
 */

import type { FastifyInstance } from 'fastify';

const PULSE_URL = process.env.PULSE_API_URL || 'http://pulse:8700/api/v1';
const PULSE_SERVICE_TOKEN = process.env.PULSE_DASHBOARD_TOKEN || '';

function authHeaders(): Record<string, string> {
  return PULSE_SERVICE_TOKEN ? { 'X-Service-Token': PULSE_SERVICE_TOKEN } : {};
}

async function pulseGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${PULSE_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pulse GET ${path}: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function reoRoutes(app: FastifyInstance) {
  // GET /api/reo/timeline?since_hours=24&actor=persona:reviewer,reviewer
  //                       &decision_type=review_outcome,task_release
  //                       &outcome=passed,failed
  //                       &task_id=AION-...&thread_id=...&q=foo&limit=200
  // `persona` retained as backward-compat alias for single-value actor filter.
  app.get<{
    Querystring: {
      since_hours?: string;
      persona?: string;
      actor?: string;
      decision_type?: string;
      outcome?: string;
      task_id?: string;
      thread_id?: string;
      q?: string;
      limit?: string;
    };
  }>('/api/reo/timeline', async (req, reply) => {
    const params = new URLSearchParams();
    const passthrough: (keyof typeof req.query)[] = [
      'since_hours',
      'persona',
      'actor',
      'decision_type',
      'outcome',
      'task_id',
      'thread_id',
      'q',
      'limit',
    ];
    for (const key of passthrough) {
      const v = req.query[key];
      if (v !== undefined && v !== '') params.set(key, v);
    }
    const qs = params.toString();
    try {
      const data = await pulseGet(`/observability/timeline${qs ? `?${qs}` : ''}`);
      return reply.send(data);
    } catch (err) {
      app.log.error({ err }, 'reo/timeline failed');
      return reply
        .status(503)
        .send({ error: 'pulse_unreachable', detail: String(err) });
    }
  });

  // GET /api/reo/persona-aggregates?since_hours=24
  app.get<{ Querystring: { since_hours?: string } }>(
    '/api/reo/persona-aggregates',
    async (req, reply) => {
      const qs = req.query.since_hours
        ? `?since_hours=${encodeURIComponent(req.query.since_hours)}`
        : '';
      try {
        const data = await pulseGet(`/observability/persona-aggregates${qs}`);
        return reply.send(data);
      } catch (err) {
        app.log.error({ err }, 'reo/persona-aggregates failed');
        return reply
          .status(503)
          .send({ error: 'pulse_unreachable', detail: String(err) });
      }
    }
  );

  // GET /api/reo/decisions/:event_id
  app.get<{ Params: { event_id: string } }>(
    '/api/reo/decisions/:event_id',
    async (req, reply) => {
      const id = parseInt(req.params.event_id, 10);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.status(400).send({ error: 'invalid_event_id' });
      }
      try {
        const data = await pulseGet(`/observability/decisions/${id}`);
        return reply.send(data);
      } catch (err) {
        const msg = String(err);
        if (msg.includes('404')) {
          return reply.status(404).send({ error: 'not_found', event_id: id });
        }
        app.log.error({ err }, 'reo/decisions/:event_id failed');
        return reply
          .status(503)
          .send({ error: 'pulse_unreachable', detail: msg });
      }
    }
  );
}
