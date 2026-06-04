import type { FastifyInstance } from 'fastify'
import { getEventsByTaskId, getEvents, getTasks } from '../services/pulse-client.js'

const PIPELINE_PATTERNS = [
  'pipeline:', 'auto:', 'capability:', 'risk:',
  'waiting:david', 'needs-input',
]

export async function eventRoutes(app: FastifyInstance) {
  app.get('/api/tasks/:id/events', async (request) => {
    const { id } = request.params as { id: string }
    const events = await getEventsByTaskId(id)
    return { events }
  })

  // Pipeline event timeline — shows pipeline-related events correlated with tasks
  app.get('/api/pipeline/events', async (request) => {
    const { limit = '100' } = request.query as { limit?: string }
    const maxEvents = Math.min(parseInt(limit, 10) || 100, 500)

    const allEvents = await getEvents(maxEvents)
    const allTasks = await getTasks()
    const taskMap = new Map(allTasks.map(t => [t.id, t]))

    // Filter to pipeline-relevant events
    const pipelineEvents = allEvents
      .filter(e => {
        if (e.event_type === 'created') return true
        if (e.event_type === 'closed') return true
        if (e.event_type === 'status_changed') return true
        const comment = e.comment || ''
        return PIPELINE_PATTERNS.some(p => comment.includes(p))
      })
      .slice(-maxEvents)
      .reverse()
      .map(e => {
        const task = taskMap.get(e.issue_id)
        return {
          ...e,
          task_title: task?.title ?? e.issue_id,
          task_status: task?.status ?? 'unknown',
          task_labels: task?.labels ?? [],
        }
      })

    return { events: pipelineEvents }
  })
}
