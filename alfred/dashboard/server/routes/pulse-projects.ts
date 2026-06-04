import type { FastifyInstance } from 'fastify';
import {
  getProjects,
  getProject,
  getProjectTasks,
  advanceProject,
  advanceAllProjects,
  executeProject,
  approveGate,
} from '../services/pulse-client.js';

export async function pulseProjectRoutes(app: FastifyInstance) {
  // List all Pulse projects
  app.get('/api/pulse/projects', async (request) => {
    const { status } = request.query as { status?: string };
    return getProjects(status);
  });

  // Get single project
  app.get('/api/pulse/projects/:projectId', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return getProject(projectId);
  });

  // Get project tasks
  app.get('/api/pulse/projects/:projectId/tasks', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const { status, phase_id } = request.query as { status?: string; phase_id?: string };
    return getProjectTasks(projectId, { status, phase_id });
  });

  // Execute project
  app.post('/api/pulse/projects/:projectId/execute', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return executeProject(projectId);
  });

  // Advance single project
  app.post('/api/pulse/projects/:projectId/advance', async (request) => {
    const { projectId } = request.params as { projectId: string };
    return advanceProject(projectId);
  });

  // Advance all projects
  app.post('/api/pulse/projects/advance-all', async () => {
    return advanceAllProjects();
  });

  // Approve gate
  app.post('/api/pulse/projects/:projectId/tasks/:taskId/approve-gate', async (request) => {
    const { projectId, taskId } = request.params as { projectId: string; taskId: string };
    const body = request.body as { actor?: string } | undefined;
    return approveGate(projectId, taskId, body?.actor);
  });
}
