import type { FastifyInstance } from 'fastify'
import { getJobTimeline, parseRegistry, formatSchedule } from '../services/registry.js'
import { getJobStates, getRecentEvents } from '../services/nexus-db.js'

export async function timelineRoutes(app: FastifyInstance) {
  // Get job timeline (schedule + last/next runs)
  app.get('/api/timeline', async () => {
    // Get last run times from nexus.db job_state
    const jobStates = getJobStates()
    const lastRuns: Record<string, string> = {}
    for (const js of jobStates) {
      if (js.last_run) {
        // last_run may be unix timestamp or ISO string
        const ts = typeof js.last_run === 'number'
          ? new Date((js.last_run as number) * 1000).toISOString()
          : (js.last_run ? new Date(js.last_run).toISOString() : '')
        if (ts) lastRuns[js.job] = ts
      }
    }

    const timeline = getJobTimeline(lastRuns)

    // Add schedule display string
    const jobs = timeline.jobs.map(j => ({
      ...j,
      scheduleDisplay: formatSchedule(j.schedule),
    }))

    return { jobs }
  })

  // Get job registry summary
  app.get('/api/timeline/registry', async () => {
    const { jobs } = parseRegistry()
    return {
      jobs: jobs.map(j => ({
        name: j.name,
        description: j.description,
        persona: j.persona,
        schedule: formatSchedule(j.schedule),
        enabled: j.enabled,
        engine: j.engine,
        maxBudget: j.maxBudget,
      })),
      total: jobs.length,
      enabled: jobs.filter(j => j.enabled).length,
    }
  })

  // Get execution history for a specific job
  app.get('/api/timeline/history/:job', async (request) => {
    const { job } = request.params as { job: string }
    const events = getRecentEvents(100)
    const jobEvents = events
      .filter(e => e.job === job)
      .map(e => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        cost: e.cost,
        duration: e.duration,
        status: e.status,
        summary: e.summary,
      }))

    return { job, events: jobEvents }
  })
}
