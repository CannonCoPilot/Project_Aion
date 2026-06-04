import type { FastifyInstance } from 'fastify';
import { getAllSettings, updateSettings } from '../services/dashboard-db.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    return getAllSettings();
  });

  app.patch('/api/settings', async (request) => {
    const body = request.body as {
      archive_days?: number;
      work_aggregator_interval_minutes?: number;
    };
    return updateSettings(body);
  });
}
