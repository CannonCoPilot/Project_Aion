import type { FastifyInstance } from 'fastify';
import { getPendingApprovals } from '../services/nexus-db.js';

export async function approvalRoutes(app: FastifyInstance) {
  app.get('/api/approvals', async () => {
    try {
      const approvals = await getPendingApprovals();
      return { approvals };
    } catch (err) {
      app.log.error({ err }, 'Failed to read pending approvals');
      return { approvals: [] };
    }
  });
}
