import type { FastifyInstance } from 'fastify';
import {
  getWorkEvents,
  getWorkEventsSummary,
  getWorkEventsChartData,
  type WorkEventFilters,
} from '../services/work-events-db.js';
import { config } from '../config.js';

function localEndOfDay(): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: config.timezone });
  return `${today}T23:59:59`;
}

function extractCrossFilters(q: Record<string, string>): WorkEventFilters {
  return {
    agent: q.agent || undefined,
    actor: q.actor || undefined,
    actor_type: q.actor_type || undefined,
    action: q.action || undefined,
    domain: q.domain || undefined,
    project: q.project || undefined,
    value_rating: q.value_rating || undefined,
    search: q.search || undefined,
  };
}

export async function reportRoutes(app: FastifyInstance) {
  // Paginated event list with filters
  app.get('/api/reports/events', async (request) => {
    const q = request.query as Record<string, string>;
    const filters: WorkEventFilters = {
      ...extractCrossFilters(q),
      from: q.from,
      to: q.to,
      limit: q.limit ? parseInt(q.limit, 10) : 100,
      offset: q.offset ? parseInt(q.offset, 10) : 0,
      sort: q.sort || 'timestamp_desc',
    };
    return getWorkEvents(filters);
  });

  // KPI aggregates for a date range (with optional cross-filters)
  app.get('/api/reports/summary', async (request) => {
    const q = request.query as Record<string, string>;
    const from = q.from || '2026-01-01';
    const to = q.to || localEndOfDay();
    return getWorkEventsSummary(from, to, extractCrossFilters(q));
  });

  // Chart data grouped by a dimension (with optional cross-filters)
  app.get('/api/reports/charts', async (request) => {
    const q = request.query as Record<string, string>;
    const from = q.from || '2026-01-01';
    const to = q.to || localEndOfDay();
    const groupBy = q.group_by || 'domain';
    return getWorkEventsChartData(from, to, groupBy, extractCrossFilters(q));
  });
}
