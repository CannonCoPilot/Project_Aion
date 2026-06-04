import type { FastifyInstance } from 'fastify'
import { readFileSync, statSync, existsSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { execSync } from 'child_process'

const JARVIS_DIR = process.env.JARVIS_PROJECT_DIR || '/Users/nathanielcannon/Claude/Jarvis'
const DOCKER_HOST = process.env.DOCKER_HOST_IP || 'host.docker.internal'
const METRICS_JSONL = join(JARVIS_DIR, '.claude/logs/context-window-metrics.jsonl')
const JSONL_STATS = join(JARVIS_DIR, '.claude/context/.jsonl-compression-stats.json')
const TELEMETRY_DIR = join(JARVIS_DIR, '.claude/logs/telemetry')
const HEALTH_FILE = join(JARVIS_DIR, '.claude/context/.memory-health.json')
const STATE_HOOK = join(JARVIS_DIR, '.claude/context/.jicm-state-hook.json')
const INGEST_META = join(JARVIS_DIR, '.claude/context/.jicm-last-ingest.json')
const COMPRESSION_META = join(JARVIS_DIR, '.claude/context/.jicm-last-compression.json')
const SCRATCHPAD = join(JARVIS_DIR, '.claude/context/.scratchpad.md')
const SESSION_STATE = join(JARVIS_DIR, '.claude/context/session-state.md')
const INSIGHTS_LOG = join(JARVIS_DIR, '.claude/context/insights/insights-log.md')
const CHECKPOINT = join(JARVIS_DIR, '.claude/context/.compressed-context-ready.md')
const WATCHER_LOG = join(JARVIS_DIR, '.claude/logs/jicm-watcher.log')
const WATCHER_PID = join(JARVIS_DIR, '.claude/context/.jicm-watcher.pid')
const ENNOIA_STATUS = join(JARVIS_DIR, '.claude/context/.ennoia-status')
const CONFIG_FILE = join(JARVIS_DIR, '.claude/scripts/jicm-config.sh')

function safeReadJson(path: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function safeReadLines(path: string): number {
  try { return readFileSync(path, 'utf8').split('\n').length } catch { return 0 }
}

function safeReadBytes(path: string): number {
  try { return statSync(path).size } catch { return 0 }
}

function safeMtimeMs(path: string): number {
  try { return statSync(path).mtimeMs } catch { return 0 }
}

function countEntries(path: string, pattern: RegExp): number {
  try {
    const content = readFileSync(path, 'utf8')
    return (content.match(pattern) || []).length
  } catch { return 0 }
}

function processAlive(pidFile: string): { alive: boolean; pid: number | null } {
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
    if (isNaN(pid)) return { alive: false, pid: null }
    try { process.kill(pid, 0); return { alive: true, pid } } catch { return { alive: false, pid } }
  } catch { return { alive: false, pid: null } }
}

function signalFileState(name: string): 'present' | 'absent' {
  return existsSync(join(JARVIS_DIR, `.claude/context/${name}`)) ? 'present' : 'absent'
}

function getWatcherLogTail(n: number): string[] {
  try {
    const content = readFileSync(WATCHER_LOG, 'utf8')
    return content.trim().split('\n').slice(-n)
  } catch { return [] }
}

async function checkConnection(url: string, name: string): Promise<{ status: 'up' | 'down'; latency_ms: number; detail?: string }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    const latency = Date.now() - start
    if (res.ok) {
      const body = await res.text()
      const detail = name === 'qdrant' ? (() => { try { return `${JSON.parse(body).result?.collections?.length || 0} collections` } catch { return '' } })() :
                     name === 'mlx_embed' ? (() => { try { const d = JSON.parse(body); return d.model_name || '' } catch { return '' } })() : ''
      return { status: 'up', latency_ms: latency, detail }
    }
    return { status: 'down', latency_ms: latency, detail: `HTTP ${res.status}` }
  } catch (e) {
    return { status: 'down', latency_ms: Date.now() - start, detail: String(e).substring(0, 60) }
  }
}

function getGitState(): { branch: string; ahead: number; dirty: number } {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: JARVIS_DIR, encoding: 'utf8' }).trim()
    const ahead = parseInt(execSync('git rev-list --count @{u}..HEAD 2>/dev/null || echo 0', { cwd: JARVIS_DIR, encoding: 'utf8' }).trim(), 10) || 0
    const dirty = execSync('git status --porcelain', { cwd: JARVIS_DIR, encoding: 'utf8' }).trim().split('\n').filter(Boolean).length
    return { branch, ahead, dirty }
  } catch { return { branch: '?', ahead: 0, dirty: 0 } }
}

function parseJsonlFile(path: string, maxLines = 10000): Record<string, unknown>[] {
  try {
    return readFileSync(path, 'utf8').trim().split('\n').slice(-maxLines)
      .map(line => { try { return JSON.parse(line) } catch { return null } })
      .filter(Boolean) as Record<string, unknown>[]
  } catch { return [] }
}

export async function jarvisMemoryRoutes(app: FastifyInstance) {
  app.get('/api/jarvis/memory-health', async () => {
    try {
      const health = JSON.parse(readFileSync(HEALTH_FILE, 'utf8'))
      const stat = statSync(HEALTH_FILE)
      return { ...health, file_age_ms: Date.now() - stat.mtimeMs }
    } catch {
      return { error: 'Health file not available', layers: {}, warnings: [] }
    }
  })

  app.get('/api/jarvis/full-state', async () => {
    const now = Date.now()
    const stateHook = safeReadJson(STATE_HOOK) as Record<string, unknown> | null
    const compressionMeta = safeReadJson(COMPRESSION_META) as Record<string, unknown> | null
    const ingestMeta = safeReadJson(INGEST_META) as Record<string, unknown> | null

    // File fullness gauges
    const scratchpadLines = safeReadLines(SCRATCHPAD)
    const insightsEntries = countEntries(INSIGHTS_LOG, /^### /gm)
    const insightsBytes = safeReadBytes(INSIGHTS_LOG)
    const sessionStateAge = safeMtimeMs(SESSION_STATE) ? Math.round((now - safeMtimeMs(SESSION_STATE)) / 60000) : -1
    const checkpointAge = safeMtimeMs(CHECKPOINT) ? Math.round((now - safeMtimeMs(CHECKPOINT)) / 60000) : -1
    const checkpointBytes = safeReadBytes(CHECKPOINT)

    // Aion Quartet process health
    const watcher = processAlive(WATCHER_PID)
    const ennoia = processAlive(join(JARVIS_DIR, '.claude/context/.ennoia-status'))
    const virgil = processAlive(join(JARVIS_DIR, '.claude/context/.virgil-tasks.json'))

    // Signals
    const signals = {
      clear_now: signalFileState('.jicm-clear-now.signal'),
      resume_complete: signalFileState('.jicm-resume-complete.signal'),
      compression_done: signalFileState('.compression-done.signal'),
      compression_in_progress: signalFileState('.compression-in-progress'),
      exit_mode: signalFileState('.jicm-exit-mode.signal'),
      sleep: signalFileState('.jicm-sleep.signal'),
    }

    // Git
    const git = getGitState()

    // Watcher log tail
    const watcherLogTail = getWatcherLogTail(8)

    // Session state focus line (first non-header line)
    let focusLine = ''
    try {
      const ssContent = readFileSync(SESSION_STATE, 'utf8')
      const statusMatch = ssContent.match(/\*\*Status\*\*:\s*(.+)/)
      if (statusMatch) focusLine = statusMatch[1].substring(0, 200)
    } catch {}

    return {
      timestamp: new Date().toISOString(),

      context: {
        tokens: (stateHook?.tokens as number) || 0,
        used_pct: (stateHook?.used_percentage as number) || 0,
        window_size: (stateHook?.context_window_size as number) || 1000000,
        soft_threshold: (stateHook?.soft_threshold_tokens as number) || 250000,
        hard_threshold: (stateHook?.hard_threshold_tokens as number) || 300000,
        burn_rate_tpm: (stateHook?.burn_rate_tpm as number) || 0,
        soft_eta_min: (stateHook?.soft_eta_min as number) || 0,
        hard_eta_min: (stateHook?.hard_eta_min as number) || 0,
        output_tokens_last: (stateHook?.output_tokens_last as number) || 0,
        action: (stateHook?.action as string) || 'UNKNOWN',
      },

      cache: {
        hit_rate: (stateHook?.cache_hit_rate as number) || 0,
        read_tokens: (stateHook?.cache_read_tokens as number) || 0,
        creation_tokens: (stateHook?.cache_creation_tokens as number) || 0,
        creation_5m: (stateHook?.cache_creation_5m_tokens as number) || 0,
        creation_1h: (stateHook?.cache_creation_1h_tokens as number) || 0,
      },

      jicm_cycle: compressionMeta ? {
        last_timestamp: compressionMeta.timestamp,
        method: compressionMeta.method,
        llm_model: compressionMeta.llm_model,
        output_lines: compressionMeta.output_lines,
        output_bytes: compressionMeta.output_bytes,
        duration_seconds: compressionMeta.duration_seconds,
        nlp_ratio: compressionMeta.nlp_compression_ratio,
        user_msg_count: compressionMeta.user_msg_count,
        session_state_stale_min: compressionMeta.session_state_stale_minutes,
      } : null,

      fullness: {
        scratchpad: { lines: scratchpadLines, cap: 120, pct: Math.min(100, Math.round((scratchpadLines / 120) * 100)) },
        insights: { entries: insightsEntries, cap: 200, bytes: insightsBytes, pct: Math.min(100, Math.round((insightsEntries / 200) * 100)) },
        session_state: { bytes: safeReadBytes(SESSION_STATE), age_min: sessionStateAge, fresh_threshold: 60, stale_threshold: 360 },
        active_plan: { bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/.active-plan')), age_min: safeMtimeMs(join(JARVIS_DIR, '.claude/context/.active-plan')) ? Math.round((now - safeMtimeMs(join(JARVIS_DIR, '.claude/context/.active-plan'))) / 60000) : -1 },
        current_plans: { bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/current-plans.md')), age_min: safeMtimeMs(join(JARVIS_DIR, '.claude/context/current-plans.md')) ? Math.round((now - safeMtimeMs(join(JARVIS_DIR, '.claude/context/current-plans.md'))) / 60000) : -1 },
        checkpoint: { age_min: checkpointAge, bytes: checkpointBytes },
        self_corrections: { bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/self-knowledge/self-corrections.md')), lines: safeReadLines(join(JARVIS_DIR, '.claude/context/psyche/self-knowledge/self-corrections.md')) },
        context_window: {
          tokens: (stateHook?.tokens as number) || 0,
          cap: (stateHook?.context_window_size as number) || 1000000,
          pct: (stateHook?.used_percentage as number) || 0,
        },
      },

      force_loaded: {
        total_bytes: [
          safeReadBytes(join(JARVIS_DIR, 'CLAUDE.md')),
          safeReadBytes(join(JARVIS_DIR, 'README.md')),
          safeReadBytes(SESSION_STATE),
          safeReadBytes(SCRATCHPAD),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/.active-plan')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/current-plans.md')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/jarvis-identity.md')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/capability-map.yaml')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/self-knowledge/self-corrections.md')),
        ].reduce((a, b) => a + b, 0),
        files: [
          { name: 'CLAUDE.md', bytes: safeReadBytes(join(JARVIS_DIR, 'CLAUDE.md')) },
          { name: '.active-plan', bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/.active-plan')) },
          { name: 'self-corrections.md', bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/self-knowledge/self-corrections.md')) },
          { name: 'current-plans.md', bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/current-plans.md')) },
          { name: 'capability-map.yaml', bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/capability-map.yaml')) },
          { name: 'session-state.md', bytes: safeReadBytes(SESSION_STATE) },
          { name: '.scratchpad.md', bytes: safeReadBytes(SCRATCHPAD) },
          { name: 'jarvis-identity.md', bytes: safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/jarvis-identity.md')) },
          { name: 'README.md', bytes: safeReadBytes(join(JARVIS_DIR, 'README.md')) },
        ].sort((a, b) => b.bytes - a.bytes),
        estimated_tokens: Math.round([
          safeReadBytes(join(JARVIS_DIR, 'CLAUDE.md')),
          safeReadBytes(join(JARVIS_DIR, 'README.md')),
          safeReadBytes(SESSION_STATE),
          safeReadBytes(SCRATCHPAD),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/.active-plan')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/current-plans.md')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/jarvis-identity.md')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/capability-map.yaml')),
          safeReadBytes(join(JARVIS_DIR, '.claude/context/psyche/self-knowledge/self-corrections.md')),
        ].reduce((a, b) => a + b, 0) / 4),
      },

      archives: {
        scratchpad: (() => { try { return readdirSync(join(JARVIS_DIR, '.claude/context/archive')).filter(f => f.startsWith('scratchpad-') && f.endsWith('.md')).length } catch { return 0 } })(),
        insights: (() => { try { return readdirSync(join(JARVIS_DIR, '.claude/context/archive/insights')).length } catch { return 0 } })(),
        checkpoints: (() => { try { return readdirSync(join(JARVIS_DIR, '.claude/logs/jicm/archive')).filter(f => f.startsWith('compressed-')).length } catch { return 0 } })(),
        session_states: (() => { try { return readdirSync(join(JARVIS_DIR, '.claude/context/archive/session-state')).length } catch { return 0 } })(),
      },

      connections: {
        qdrant: await checkConnection(`http://${process.env.DOCKER_HOST_IP || 'host.docker.internal'}:6333/collections`, 'qdrant'),
        mlx_embed: await checkConnection(`http://${process.env.DOCKER_HOST_IP || 'host.docker.internal'}:8000/health`, 'mlx_embed'),
      },

      ingest: ingestMeta ? {
        last_at: ingestMeta.timestamp,
        chunks: ingestMeta.chunks_ingested,
        dedup_score: ingestMeta.dedup_score,
        dedup_threshold: ingestMeta.dedup_threshold,
        collection: ingestMeta.collection,
      } : null,

      processes: { watcher },
      signals,
      git,
      focus: focusLine,
      watcher_log: watcherLogTail,
    }
  })

  // ── Context Window Timeline ──────────────────────────────────────────
  app.get<{ Querystring: { hours?: string } }>('/api/jarvis/context-timeline', async (req) => {
    const hours = parseInt(req.query.hours || '168', 10)
    const cutoff = Date.now() - hours * 3600_000
    const points: { ts: number; tokens: number; source: string }[] = []
    const events: { ts: number; type: string; label: string; tokens_before?: number; checkpoint_bytes?: number; duration_s?: number }[] = []

    // Source 1: compression events from metrics JSONL
    for (const entry of parseJsonlFile(METRICS_JSONL)) {
      const ts = new Date(entry.timestamp as string).getTime()
      if (ts < cutoff || isNaN(ts)) continue
      const tokens = (entry.tokens as number) || 0
      const trigger = (entry.trigger as string) || 'unknown'
      const ckBytes = (entry.checkpoint_bytes as number) || 0
      const dur = (entry.compression_duration_s as number) || 0

      if (tokens > 0) {
        points.push({ ts, tokens, source: 'compression' })
        // Synthetic post-compression point (checkpoint tokens + baseline force-loaded)
        const postTokens = Math.round(ckBytes / 4) + 22000
        points.push({ ts: ts + 30000, tokens: postTokens, source: 'compression' })
      }
      events.push({ ts, type: trigger === 'meditate-session' ? 'meditate' : 'compression', label: `${trigger} (${dur}s)`, tokens_before: tokens, checkpoint_bytes: ckBytes, duration_s: dur })
    }

    // Source 2: high-frequency token telemetry
    try {
      const telemFiles = readdirSync(TELEMETRY_DIR).filter(f => f.startsWith('context-tokens-')).sort()
      for (const f of telemFiles) {
        for (const entry of parseJsonlFile(join(TELEMETRY_DIR, f), 5000)) {
          const ts = new Date(entry.ts as string).getTime()
          if (ts < cutoff || isNaN(ts)) continue
          const tokens = (entry.tokens as number) || 0
          if (tokens > 0) points.push({ ts, tokens, source: 'telemetry' })
        }
      }
    } catch {}

    // Source 3: memory-health telemetry (sparser, l6_tokens field)
    try {
      const healthFiles = readdirSync(TELEMETRY_DIR).filter(f => f.startsWith('memory-health-')).sort()
      for (const f of healthFiles) {
        for (const entry of parseJsonlFile(join(TELEMETRY_DIR, f))) {
          const ts = new Date(entry.ts as string).getTime()
          if (ts < cutoff || isNaN(ts)) continue
          const tokens = (entry.l6_tokens as number) || 0
          if (tokens > 0) points.push({ ts, tokens, source: 'health' })
        }
      }
    } catch {}

    // Source 4: current real-time point
    const stateHook = safeReadJson(STATE_HOOK)
    if (stateHook) {
      const tokens = (stateHook.tokens as number) || 0
      const tsEpoch = ((stateHook.ts_epoch as number) || 0) * 1000
      if (tokens > 0 && tsEpoch > cutoff) points.push({ ts: tsEpoch, tokens, source: 'realtime' })
    }

    // Watcher events from log (rest, maintain)
    try {
      const logContent = readFileSync(WATCHER_LOG, 'utf8')
      for (const match of logContent.matchAll(/^(\d{4}-\d{2}-\d{2}T[\d:+-]+)\s+(rest|maintain):\s+(.+)$/gm)) {
        const ts = new Date(match[1]).getTime()
        if (ts < cutoff || isNaN(ts)) continue
        if (match[3].includes('start') || match[3].includes('complete')) {
          events.push({ ts, type: match[2], label: match[3] })
        }
      }
    } catch {}

    points.sort((a, b) => a.ts - b.ts)
    events.sort((a, b) => a.ts - b.ts)

    return {
      points,
      events,
      thresholds: { soft: 250000, hard: 300000, window: 1000000 },
    }
  })

  // ── RAG Collections ──────────────────────────────────────────────────
  app.get('/api/jarvis/rag-collections', async () => {
    const collections: { name: string; points_count: number; indexed_count: number; status: string; dimensions: number }[] = []
    let qdrant_up = false

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const res = await fetch(`http://${DOCKER_HOST}:6333/collections`, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) return { collections, total_points: 0, qdrant_up: false }
      qdrant_up = true

      const body = await res.json() as { result: { collections: { name: string }[] } }
      for (const coll of body.result.collections) {
        try {
          const detailCtrl = new AbortController()
          const detailTimeout = setTimeout(() => detailCtrl.abort(), 2000)
          const detailRes = await fetch(`http://${DOCKER_HOST}:6333/collections/${coll.name}`, { signal: detailCtrl.signal })
          clearTimeout(detailTimeout)
          if (detailRes.ok) {
            const detail = await detailRes.json() as { result: { points_count: number; indexed_vectors_count: number; status: string; config: { params: { vectors: { size?: number } | Record<string, { size: number }> } } } }
            const r = detail.result
            const vecConfig = r.config?.params?.vectors
            const dims = typeof vecConfig === 'object' && vecConfig !== null
              ? ('size' in vecConfig ? (vecConfig as { size: number }).size : Object.values(vecConfig)[0]?.size || 0)
              : 0
            collections.push({ name: coll.name, points_count: r.points_count, indexed_count: r.indexed_vectors_count, status: r.status, dimensions: dims })
          }
        } catch {}
      }
    } catch {}

    collections.sort((a, b) => b.points_count - a.points_count)
    return { collections, total_points: collections.reduce((s, c) => s + c.points_count, 0), qdrant_up }
  })

  // ── Compression Effectiveness ────────────────────────────────────────
  app.get('/api/jarvis/compression-effectiveness', async () => {
    const metrics = parseJsonlFile(METRICS_JSONL)
    const compressionEvents = metrics.filter(m => m.trigger === 'jicm-compression' && ((m.tokens as number) || 0) > 0)
    const jsonlStats = safeReadJson(JSONL_STATS)

    let preservationRatio = 0
    if (compressionEvents.length > 0) {
      const ratios = compressionEvents.map(e => {
        const tokens = (e.tokens as number) || 1
        const ckTokens = ((e.checkpoint_bytes as number) || 0) / 4
        return Math.min(1, ckTokens / tokens)
      })
      preservationRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length
    }

    const stage1Reduction = jsonlStats ? ((jsonlStats.reduction_pct as number) || 0) / 100 : 0
    const totalTools = jsonlStats ? ((jsonlStats.tool_results_total as number) || 0) : 0
    const dedupedTools = jsonlStats ? ((jsonlStats.tool_results_deduped as number) || 0) : 0
    const dedupEffectiveness = totalTools > 0 ? dedupedTools / totalTools : 0

    const efficiency = Math.round((0.4 * Math.min(1, preservationRatio) + 0.3 * Math.min(1, stage1Reduction) + 0.3 * Math.min(1, dedupEffectiveness)) * 100)

    const totalTokens = compressionEvents.reduce((s, e) => s + ((e.tokens as number) || 0), 0)
    const totalCkBytes = compressionEvents.reduce((s, e) => s + ((e.checkpoint_bytes as number) || 0), 0)
    const avgDuration = compressionEvents.length > 0
      ? Math.round(compressionEvents.reduce((s, e) => s + ((e.compression_duration_s as number) || 0), 0) / compressionEvents.length)
      : 0

    return {
      efficiency_pct: efficiency,
      components: {
        preservation: Math.round(preservationRatio * 100) / 100,
        stage1_reduction: Math.round(stage1Reduction * 100) / 100,
        dedup: Math.round(dedupEffectiveness * 100) / 100,
      },
      stats: {
        total_compressions: compressionEvents.length,
        avg_duration_s: avgDuration,
        avg_checkpoint_bytes: compressionEvents.length > 0 ? Math.round(totalCkBytes / compressionEvents.length) : 0,
        total_tokens_processed: totalTokens,
        cumulative_tokens_saved: totalTokens - Math.round(totalCkBytes / 4),
      },
    }
  })

  // ── Layer Health History ─────────────────────────────────────────────
  app.get<{ Querystring: { hours?: string } }>('/api/jarvis/layer-health-history', async (req) => {
    const hours = parseInt(req.query.hours || '72', 10)
    const cutoff = Date.now() - hours * 3600_000
    const buckets: { ts: number; layers: Record<string, string> }[] = []

    try {
      const files = readdirSync(TELEMETRY_DIR).filter(f => f.startsWith('memory-health-')).sort()
      for (const f of files) {
        for (const entry of parseJsonlFile(join(TELEMETRY_DIR, f))) {
          const ts = new Date(entry.ts as string).getTime()
          if (ts < cutoff || isNaN(ts)) continue

          const l1 = (entry.l1_insights as number) || 0
          const l2 = (entry.l2_scratchpad as number) || 0
          const l3age = (entry.l3_checkpoint_age as number) || 0
          const l6 = (entry.l6_tokens as number) || 0

          buckets.push({
            ts,
            layers: {
              L1: l1 > 200 ? 'warn' : 'ok',
              L2: l2 > 120 ? 'critical' : l2 > 80 ? 'warn' : 'ok',
              L3: l3age > 120 ? 'warn' : 'ok',
              L4: 'ok',
              L5: 'ok',
              L6: l6 > 300000 ? 'critical' : l6 > 250000 ? 'warn' : 'ok',
            },
          })
        }
      }
    } catch {}

    buckets.sort((a, b) => a.ts - b.ts)
    return { buckets }
  })

  // ── Graphiti Knowledge Graph Overview ────────────────────────────────
  app.get<{ Querystring: { sample?: string } }>('/api/jarvis/graphiti-overview', async (req) => {
    const sampleSize = parseInt(req.query.sample || '30', 10)
    const neo4jUrl = `http://${DOCKER_HOST}:7474/db/neo4j/query/v2`
    const neo4jAuth = 'Basic ' + Buffer.from('neo4j:70stc9h60XCCSiQrdxDR9rQQxtGVlDa2').toString('base64')

    async function cypher(query: string): Promise<Record<string, unknown>[]> {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(neo4jUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': neo4jAuth },
          body: JSON.stringify({ statement: query }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (!res.ok) return []
        const body = await res.json() as { data: { fields: string[]; values: unknown[][] } }
        const rows = body.data?.values || []
        return rows.map(row => {
          return row.length === 1 ? { value: row[0] } : { values: row }
        })
      } catch { return [] }
    }

    const [entitiesR, episodesR, edgesR, communitiesR] = await Promise.all([
      cypher('MATCH (n:Entity) RETURN count(n)'),
      cypher('MATCH (n:Episodic) RETURN count(n)'),
      cypher('MATCH ()-[r:RELATES_TO]->() RETURN count(r)'),
      cypher('MATCH (n:Community) RETURN count(n)'),
    ])

    const stats = {
      entities: (entitiesR[0]?.value as number) || 0,
      episodes: (episodesR[0]?.value as number) || 0,
      edges: (edgesR[0]?.value as number) || 0,
      communities: (communitiesR[0]?.value as number) || 0,
    }

    // Top entities by edge count
    const topRaw = await cypher(`MATCH (n:Entity)-[r:RELATES_TO]-() RETURN n.name, n.summary, count(r) AS edges ORDER BY edges DESC LIMIT 15`)
    const top_entities = topRaw.map(r => {
      const vals = (r.values || []) as [string, string, number]
      return { name: vals[0] || '?', summary: (vals[1] || '').substring(0, 120), edge_count: vals[2] || 0 }
    })

    // Sample subgraph
    const graphRaw = await cypher(`MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) WITH a, r, b ORDER BY r.weight DESC LIMIT ${sampleSize * 2} RETURN collect(DISTINCT {id: elementId(a), name: a.name}) + collect(DISTINCT {id: elementId(b), name: b.name}) AS nodes, collect({source: elementId(a), target: elementId(b), name: r.name}) AS edges`)
    let sample_graph: { nodes: { id: string; name: string }[]; edges: { source: string; target: string; name: string }[] } = { nodes: [], edges: [] }
    if (graphRaw.length > 0) {
      const vals = (graphRaw[0].values || []) as [{ id: string; name: string }[], { source: string; target: string; name: string }[]]
      const nodeMap = new Map<string, string>()
      for (const n of (vals[0] || [])) { if (n.id && !nodeMap.has(n.id)) nodeMap.set(n.id, n.name) }
      sample_graph = {
        nodes: Array.from(nodeMap.entries()).slice(0, sampleSize).map(([id, name]) => ({ id, name })),
        edges: (vals[1] || []).filter(e => nodeMap.has(e.source) && nodeMap.has(e.target)),
      }
    }

    // Recent episodes
    const episodeRaw = await cypher('MATCH (e:Episodic) RETURN e.name, e.created_at ORDER BY e.created_at DESC LIMIT 10')
    const recent_episodes = episodeRaw.map(r => {
      const vals = (r.values || []) as [string, string]
      return { name: vals[0] || '?', created_at: vals[1] || '' }
    })

    return { stats, top_entities, recent_episodes, sample_graph }
  })
}
