import type { FastifyInstance } from 'fastify';
import { getWorkspaceSummaries, getTasks } from '../services/pulse-client.js';

const workspace = process.env.WORKSPACE_DIR || process.cwd();

export async function projectRoutes(app: FastifyInstance) {
  // List registered workspaces with summaries
  app.get('/api/workspaces', async () => {
    return { workspaces: await getWorkspaceSummaries() };
  });

  // Get aggregated tasks across all workspaces
  app.get('/api/workspaces/tasks', async (request) => {
    const query = request.query as { workspace?: string; status?: string };
    let tasks = await getTasks();

    if (query.workspace) {
      tasks = tasks.filter((t) => t.workspace === query.workspace);
    }
    if (query.status) {
      const statuses = query.status.split(',');
      tasks = tasks.filter((t) => statuses.includes(t.status));
    }

    return {
      tasks: tasks.map((t) => ({
        ...t,
        _workspace: t.workspace || process.env.DEFAULT_WORKSPACE || 'MyProject',
      })),
      total: tasks.length,
    };
  });
}
