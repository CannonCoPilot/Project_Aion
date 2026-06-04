import type { FastifyInstance } from 'fastify';
import { getNexusHealth } from '../services/nexus-health.js';

export async function nexusHealthRoutes(app: FastifyInstance) {
  app.get('/api/nexus-health/models', async (request) => {
    const query = request.query as { hours?: string };
    const hours = Math.max(1, Math.min(168, parseInt(query.hours ?? '24', 10) || 24));
    return getNexusHealth(hours);
  });
}
