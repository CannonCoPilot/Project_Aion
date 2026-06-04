import type { FastifyInstance } from 'fastify'
import { getRecentEvents } from '../services/nexus-db.js'

export async function activityRoutes(app: FastifyInstance) {
  app.get('/api/activity', async (request) => {
    const query = request.query as Record<string, string>
    const limit = parseInt(query.limit || '20', 10)
    const since = query.since || undefined

    try {
      const events = getRecentEvents(limit + 1, since)
      const hasMore = events.length > limit
      return {
        events: events.slice(0, limit),
        hasMore,
      }
    } catch (err) {
      app.log.error({ err }, 'Failed to read Nexus events')
      return { events: [], hasMore: false }
    }
  })
}
