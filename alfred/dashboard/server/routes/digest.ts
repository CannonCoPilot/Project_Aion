import type { FastifyInstance } from 'fastify'
import { getTasks, getEvents } from '../services/pulse-client.js'
import type { Task, TaskEvent } from '../types.js'

// --- Types ---

interface DigestEntry {
  task: {
    id: string
    title: string
    priority: number
    status: string
    labels: string[]
    external_ref?: string
  }
  closedAt: string | null
  closeReason: string | null
  actor: string
  events: {
    type: string
    comment?: string
    timestamp: string
  }[]
  project: string | null
  domain: string | null
  pipelineStages: string[]
  executionResult?: string | null
}

interface DigestSummary {
  dateRange: { from: string; to: string }
  totalCompleted: number
  totalCreated: number
  totalInProgress: number
  byProject: Record<string, number>
  byDomain: Record<string, number>
  byActor: Record<string, number>
  entries: DigestEntry[]
}

// --- Helpers ---

function labelValue(labels: string[] | undefined, prefix: string): string | null {
  if (!labels) return null
  const label = labels.find(l => l.startsWith(prefix + ':'))
  return label ? label.slice(prefix.length + 1) : null
}

function getPipelineStages(events: TaskEvent[]): string[] {
  const stages: string[] = []
  const stageLabels = ['pipeline:approved', 'stage:evaluate', 'stage:route', 'stage:review', 'stage:queue', 'stage:execute']
  for (const e of events) {
    if (e.event_type === 'label_added' && e.comment) {
      for (const sl of stageLabels) {
        if (e.comment.includes(sl) && !stages.includes(sl)) {
          stages.push(sl)
        }
      }
    }
  }
  return stages
}

async function buildDigest(from: string, to: string, filters: {
  project?: string
  domain?: string
  actor?: string
  status?: string
}): Promise<DigestSummary> {
  const fromDate = new Date(from)
  const toDate = new Date(to)
  // Set toDate to end of day
  toDate.setHours(23, 59, 59, 999)

  const allTasks = await getTasks()
  const allEvents = await getEvents()

  // Index events by task
  const eventsByTask = new Map<string, TaskEvent[]>()
  for (const e of allEvents) {
    const list = eventsByTask.get(e.issue_id) || []
    list.push(e)
    eventsByTask.set(e.issue_id, list)
  }

  // Find tasks with activity in the date range
  const closedInRange = allTasks.filter(t => {
    if (!t.closed_at) return false
    const closedDate = new Date(t.closed_at)
    return closedDate >= fromDate && closedDate <= toDate
  })

  const createdInRange = allTasks.filter(t => {
    const created = new Date(t.created_at)
    return created >= fromDate && created <= toDate
  })

  const inProgressInRange = allTasks.filter(t => t.status === 'in_progress')

  // Determine which tasks to show based on status filter
  let targetTasks: Task[]
  if (filters.status === 'created') {
    targetTasks = createdInRange
  } else if (filters.status === 'in_progress') {
    targetTasks = inProgressInRange
  } else {
    // Default: show completed tasks
    targetTasks = closedInRange
  }

  // Apply filters
  if (filters.project) {
    targetTasks = targetTasks.filter(t => (t.labels || []).some(l => l === `project:${filters.project}`))
  }
  if (filters.domain) {
    targetTasks = targetTasks.filter(t => (t.labels || []).some(l => l === `domain:${filters.domain}`))
  }
  if (filters.actor) {
    targetTasks = targetTasks.filter(t => {
      const taskEvents = eventsByTask.get(t.id) || []
      return taskEvents.some(e => e.actor === filters.actor)
    })
  }

  // Build entries
  const entries: DigestEntry[] = targetTasks
    .sort((a, b) => {
      // Sort by closed_at desc, then created_at desc
      const aDate = a.closed_at || a.created_at
      const bDate = b.closed_at || b.created_at
      return new Date(bDate).getTime() - new Date(aDate).getTime()
    })
    .map(task => {
      const taskEvents = eventsByTask.get(task.id) || []
      const rangeEvents = taskEvents.filter(e => {
        const d = new Date(e.created_at)
        return d >= fromDate && d <= toDate
      })

      // Determine primary actor (who closed it, or who worked on it most)
      const closedBy = taskEvents.find(e =>
        e.event_type === 'status_changed' && e.new_value === 'closed'
      )?.actor || task.owner || 'unknown'

      return {
        task: {
          id: task.id,
          title: task.title,
          priority: task.priority,
          status: task.status,
          labels: task.labels || [],
          external_ref: task.external_ref,
        },
        closedAt: task.closed_at || null,
        closeReason: task.close_reason || null,
        actor: closedBy,
        events: rangeEvents.slice(-10).map(e => ({
          type: e.event_type,
          comment: e.comment,
          timestamp: e.created_at,
        })),
        project: labelValue(task.labels || [], 'project'),
        domain: labelValue(task.labels || [], 'domain'),
        pipelineStages: getPipelineStages(taskEvents),
        executionResult: task.close_reason || null,
      }
    })

  // Build summaries
  const byProject: Record<string, number> = {}
  const byDomain: Record<string, number> = {}
  const byActor: Record<string, number> = {}

  for (const entry of entries) {
    if (entry.project) byProject[entry.project] = (byProject[entry.project] || 0) + 1
    if (entry.domain) byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1
    byActor[entry.actor] = (byActor[entry.actor] || 0) + 1
  }

  return {
    dateRange: { from, to },
    totalCompleted: closedInRange.length,
    totalCreated: createdInRange.length,
    totalInProgress: inProgressInRange.length,
    byProject,
    byDomain,
    byActor,
    entries,
  }
}

// --- Routes ---

export async function digestRoutes(app: FastifyInstance) {
  app.get('/api/digest', async (request) => {
    const query = request.query as Record<string, string>

    // Default: today
    const today = new Date().toISOString().slice(0, 10)
    const from = query.from || today
    const to = query.to || today

    return buildDigest(from, to, {
      project: query.project,
      domain: query.domain,
      actor: query.actor,
      status: query.status,
    })
  })
}
