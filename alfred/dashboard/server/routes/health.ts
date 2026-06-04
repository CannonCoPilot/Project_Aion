import type { FastifyInstance } from 'fastify';
import { getHealthStatus } from '../services/nexus-db.js';
import { getTasks } from '../services/pulse-client.js';
import { getWebSocketHealth } from '../services/websocket.js';
import { getNotificationStats } from '../services/push.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    const tasks = await getTasks();
    const openCount = tasks.filter((t) => t.status !== 'closed').length;

    let nexusHealth;
    try {
      nexusHealth = await getHealthStatus();
    } catch (err) {
      nexusHealth = {
        dispatcher: { status: 'unknown', lastHeartbeat: null, heartbeatAge: null },
        jobs: [],
        messageBus: { pendingCount: 0, pendingApprovals: 0, oldestPending: null },
      };
      app.log.warn({ err }, 'Failed to read Nexus health');
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      dispatcher: nexusHealth.dispatcher,
      jobs: nexusHealth.jobs,
      messageBus: nexusHealth.messageBus,
      tasks: {
        taskCount: tasks.length,
        openCount,
      },
      websocket: getWebSocketHealth(),
      notifications: getNotificationStats(),
    };
  });
}
