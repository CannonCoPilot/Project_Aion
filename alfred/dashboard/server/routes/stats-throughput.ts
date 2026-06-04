import type { FastifyInstance } from 'fastify';
import { getTasks } from '../services/pulse-client.js';

interface DailyThroughput {
  date: string;
  created: number;
  closed: number;
}

export async function statsThroughputRoutes(app: FastifyInstance) {
  app.get('/api/stats/throughput', async (request): Promise<{ daily: DailyThroughput[] }> => {
    const { days = '30' } = request.query as { days?: string };
    const numDays = Math.min(parseInt(days, 10) || 30, 365);

    const tasks = await getTasks();

    // Build date range
    const now = new Date();
    const buckets = new Map<string, { created: number; closed: number }>();
    for (let i = 0; i < numDays; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { created: 0, closed: 0 });
    }

    // Bucket tasks by created_at and closed_at dates
    for (const task of tasks) {
      if (task.created_at) {
        const key = task.created_at.slice(0, 10);
        const b = buckets.get(key);
        if (b) b.created++;
      }
      if (task.closed_at) {
        const key = task.closed_at.slice(0, 10);
        const b = buckets.get(key);
        if (b) b.closed++;
      }
    }

    // Sort oldest first
    const daily = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    return { daily };
  });
}
