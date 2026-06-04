import type { FastifyInstance } from 'fastify'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const LOKI_URL = process.env.LOKI_URL || 'http://host.docker.internal:3100'
const EXECUTIONS_DIR = process.env.EXECUTIONS_DIR || resolve(
  process.env.HOME!,
  'AIProjects/.claude/logs/headless/executions'
)

interface LokiQueryResult {
  status: string
  data: {
    resultType: string
    result: Array<{
      stream: Record<string, string>
      values: Array<[string, string]>
    }>
  }
}

export interface NexusLogEntry {
  timestamp: number
  level: string
  component: string
  job: string
  msg: string
  status?: string
}


async function queryLoki(logql: string, limit = 200, sinceMs = 3600000): Promise<LokiQueryResult | null> {
  try {
    const endNs = Date.now() * 1_000_000
    const startNs = (Date.now() - sinceMs) * 1_000_000
    const query = encodeURIComponent(logql)
    const url = `${LOKI_URL}/loki/api/v1/query_range?query=${query}&start=${startNs}&end=${endNs}&limit=${limit}&direction=backward`
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json() as LokiQueryResult
  } catch {
    return null
  }
}

interface LokiMetricResult {
  status: string
  data: {
    resultType: string
    result: Array<{
      metric: Record<string, string>
      value: [number, string]
    }>
  }
}

/** Use Loki instant query for count_over_time / aggregations — returns label→count pairs */
async function queryLokiMetric(logql: string): Promise<LokiMetricResult | null> {
  try {
    const query = encodeURIComponent(logql)
    const time = (Date.now() / 1000).toFixed(0)
    const url = `${LOKI_URL}/loki/api/v1/query?query=${query}&time=${time}`
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json() as LokiMetricResult
  } catch {
    return null
  }
}

function parseLokiToEntries(result: LokiQueryResult): NexusLogEntry[] {
  const entries: NexusLogEntry[] = []
  for (const streamResult of result.data.result) {
    const labels = streamResult.stream
    for (const [tsNs, line] of streamResult.values) {
      try {
        const parsed = JSON.parse(line)
        entries.push({
          timestamp: Math.floor(parseInt(tsNs) / 1_000_000),
          level: parsed.level || labels.level || 'info',
          component: parsed.component || labels.component || 'unknown',
          job: parsed.job || labels.nexus_job || 'unknown',
          msg: parsed.msg || line,
          status: parsed.status || labels.status || undefined,
        })
      } catch {
        // Non-JSON line, use stream labels
        entries.push({
          timestamp: Math.floor(parseInt(tsNs) / 1_000_000),
          level: labels.level || 'info',
          component: labels.component || 'unknown',
          job: labels.nexus_job || 'unknown',
          msg: line,
        })
      }
    }
  }
  return entries.sort((a, b) => b.timestamp - a.timestamp)
}



export async function nexusLogRoutes(app: FastifyInstance) {
  // Health check — is Loki reachable?
  app.get('/api/nexus-logs/health', async (_req, reply) => {
    try {
      const res = await fetch(`${LOKI_URL}/ready`)
      if (res.ok) return reply.send({ status: 'ok' })
      return reply.status(503).send({ status: 'unhealthy' })
    } catch {
      return reply.status(503).send({ status: 'unreachable' })
    }
  })

  // Recent logs with optional filters
  app.get<{
    Querystring: {
      limit?: string
      since?: string
      level?: string
      component?: string
      job?: string
    }
  }>('/api/nexus-logs/recent', async (req, reply) => {
    const limit = parseInt(req.query.limit || '200', 10)
    const sinceMs = parseInt(req.query.since || '3600000', 10)

    // Build LogQL query with filters
    const matchers = ['job="nexus"']
    if (req.query.level) matchers.push(`level="${req.query.level}"`)
    if (req.query.component) matchers.push(`component="${req.query.component}"`)
    if (req.query.job) matchers.push(`nexus_job="${req.query.job}"`)

    const logql = `{${matchers.join(',')}}`
    const result = await queryLoki(logql, limit, sinceMs)
    if (!result) return reply.status(503).send({ error: 'Loki unreachable' })

    const entries = parseLokiToEntries(result)
    return reply.send(entries)
  })

  // Stats summary — uses metric queries for accurate counts
  app.get<{ Querystring: { since?: string } }>(
    '/api/nexus-logs/stats',
    async (req, reply) => {
      const sinceMs = parseInt(req.query.since || '86400000', 10)
      const range = `${Math.floor(sinceMs / 1000)}s`

      // Run metric queries in parallel for accurate counts
      const [totalResult, byLevelResult, byComponentResult, byJobResult, logsResult] = await Promise.all([
        queryLokiMetric(`count_over_time({job="nexus"}[${range}])`),
        queryLokiMetric(`sum by (level) (count_over_time({job="nexus"}[${range}]))`),
        queryLokiMetric(`sum by (component) (count_over_time({job="nexus"}[${range}]))`),
        queryLokiMetric(`sum by (nexus_job) (count_over_time({job="nexus"}[${range}]))`),
        // Still need log entries for recentJobs status — but only a small sample
        queryLoki('{job="nexus",component="executor"}', 200, sinceMs),
      ])

      if (!totalResult) return reply.status(503).send({ error: 'Loki unreachable' })

      // Parse metric results
      const totalLogs = totalResult.data.result.reduce(
        (sum, r) => sum + parseInt(r.value[1], 10), 0
      )

      const byLevel: Record<string, number> = {}
      for (const r of byLevelResult?.data.result ?? []) {
        byLevel[r.metric.level?.toLowerCase() || 'unknown'] = parseInt(r.value[1], 10)
      }

      const byComponent: Record<string, number> = {}
      for (const r of byComponentResult?.data.result ?? []) {
        byComponent[r.metric.component || 'unknown'] = parseInt(r.value[1], 10)
      }

      const byJob: Record<string, number> = {}
      for (const r of byJobResult?.data.result ?? []) {
        byJob[r.metric.nexus_job || 'unknown'] = parseInt(r.value[1], 10)
      }

      // Extract recentJobs from executor log entries
      const entries = logsResult ? parseLokiToEntries(logsResult) : []
      const jobLastSeen: Record<string, { ts: number; status?: string }> = {}
      for (const e of entries) {
        if (!jobLastSeen[e.job] || e.timestamp > jobLastSeen[e.job].ts) {
          jobLastSeen[e.job] = { ts: e.timestamp, status: e.status }
        }
      }
      const recentJobs = Object.entries(jobLastSeen)
        .map(([job, { ts, status }]) => ({ job, lastSeen: ts, status }))
        .sort((a, b) => b.lastSeen - a.lastSeen)

      return reply.send({
        totalLogs,
        byLevel,
        byComponent,
        byJob,
        errorCount: byLevel['error'] || 0,
        warnCount: byLevel['warn'] || 0,
        recentJobs,
      })
    }
  )

  // Errors and warnings only (quick view)
  app.get<{ Querystring: { since?: string; limit?: string } }>(
    '/api/nexus-logs/issues',
    async (req, reply) => {
      const limit = parseInt(req.query.limit || '50', 10)
      const sinceMs = parseInt(req.query.since || '86400000', 10)
      const logql = '{job="nexus",level=~"warn|error"}'
      const result = await queryLoki(logql, limit, sinceMs)
      if (!result) return reply.status(503).send({ error: 'Loki unreachable' })

      const entries = parseLokiToEntries(result)
      return reply.send(entries)
    }
  )

  // Recent execution summaries with task IDs extracted from result text
  app.get<{ Querystring: { limit?: string } }>(
    '/api/nexus-logs/executions',
    async (req, reply) => {
      const limit = parseInt(req.query.limit || '20', 10)
      try {
        const files = await readdir(EXECUTIONS_DIR)
        const jsonFiles = files
          .filter(f => f.endsWith('.json') && !f.startsWith('latest-'))
          .sort((a, b) => {
            // Extract YYYYMMDD-HHMMSS from filenames for chronological sort
            const dateA = a.match(/(\d{8}-\d{6})\.json$/)?.[1] || ''
            const dateB = b.match(/(\d{8}-\d{6})\.json$/)?.[1] || ''
            return dateB.localeCompare(dateA)
          })
          .slice(0, limit)

        const taskIdPattern = /AIProjects-\w{3,4}/g
        const executions = []

        for (const file of jsonFiles) {
          try {
            const raw = await readFile(resolve(EXECUTIONS_DIR, file), 'utf-8')
            const data = JSON.parse(raw)
            const result = data.result || ''
            const taskIds = [...new Set(result.match(taskIdPattern) || [])]

            // Extract job name and timestamp from filename: job-name-YYYYMMDD-HHMMSS.json
            const match = file.match(/^(.+)-(\d{8})-(\d{6})\.json$/)
            const jobName = match?.[1] || file
            const dateStr = match?.[2] || ''
            const timeStr = match?.[3] || ''

            executions.push({
              file,
              job: jobName,
              date: dateStr,
              time: timeStr,
              taskIds,
              isError: data.is_error || false,
              durationMs: data.duration_ms || 0,
              cost: data.total_cost_usd || 0,
              numTurns: data.num_turns || 0,
              resultPreview: result.slice(0, 300),
            })
          } catch {
            // Skip unreadable files
          }
        }

        return reply.send(executions)
      } catch {
        return reply.status(500).send({ error: 'Cannot read executions directory' })
      }
    }
  )
}
