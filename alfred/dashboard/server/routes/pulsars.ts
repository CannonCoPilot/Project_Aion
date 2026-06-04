/**
 * pulsars.ts — API routes for Pulsar management
 */

import type { FastifyInstance } from 'fastify';
import { getAllPulsars, togglePulsar, resetPulsarGate } from '../services/pulsars.js';

export async function pulsarsRoutes(app: FastifyInstance) {
  // List all pulsars with state and summary
  app.get('/api/pulsars', async () => {
    return getAllPulsars();
  });

  // Toggle a pulsar enabled/disabled
  app.patch('/api/pulsars/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const body = request.body as { enabled?: boolean };

    if (body.enabled !== undefined) {
      try {
        const found = togglePulsar(name, body.enabled);
        if (!found) {
          return reply.status(404).send({ error: `Pulsar '${name}' not found` });
        }
        return { ok: true, name, enabled: body.enabled };
      } catch (err) {
        return reply.status(500).send({ error: `Failed to toggle pulsar: ${err}` });
      }
    }

    return reply.status(400).send({ error: 'No valid fields to update' });
  });

  // Reset a gate pulsar (allow it to fire again)
  app.post('/api/pulsars/:name/reset', async (request) => {
    const { name } = request.params as { name: string };
    resetPulsarGate(name);
    return { ok: true, name, action: 'reset' };
  });

  // Run a pulsar — not available from inside Docker container
  // Use CLI: pulsar-runner.sh --run <name>
  app.post('/api/pulsars/:name/run', async (_request, reply) => {
    return reply.status(501).send({
      error:
        'Run not available from dashboard (container cannot execute host scripts). Use CLI: pulsar-runner.sh --run <name>',
    });
  });
}
