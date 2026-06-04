/**
 * backfill-stages.ts — One-time script to retroactively populate stage_from/stage_to
 * on existing work_events rows from AI David JSONL source files.
 *
 * Usage: npx tsx server/scripts/backfill-stages.ts
 */

import { resolve } from 'node:path'
import { readdirSync, readFileSync } from 'node:fs'
import { getDashboardDb } from '../services/dashboard-db.js'

const HOME = process.env.WORKSPACE_DIR || process.cwd()
const TASK_REVIEWER_DIR = resolve(HOME, '.claude/agent-output/results/task-reviewer')

function extractStageLabel(labels: unknown): string | null {
  if (!Array.isArray(labels)) return null
  const found = labels.find((l: unknown) => typeof l === 'string' && l.startsWith('stage:'))
  return found ? (found as string).replace('stage:', '') : null
}

function safeJsonParse(line: string): unknown | null {
  try { return JSON.parse(line) } catch { return null }
}

function main() {
  const db = getDashboardDb()

  // Ensure columns exist
  try { db.prepare('ALTER TABLE work_events ADD COLUMN stage_from TEXT').run() } catch { /* exists */ }
  try { db.prepare('ALTER TABLE work_events ADD COLUMN stage_to TEXT').run() } catch { /* exists */ }

  const updateStmt = db.prepare(
    'UPDATE work_events SET stage_from = ?, stage_to = ? WHERE source_key = ? AND (stage_from IS NULL AND stage_to IS NULL)'
  )

  const files = readdirSync(TASK_REVIEWER_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .sort()

  let updated = 0
  let notFound = 0
  let noStage = 0

  const runBatch = db.transaction((records: { sourceKey: string; stageFrom: string | null; stageTo: string | null }[]) => {
    for (const rec of records) {
      const result = updateStmt.run(rec.stageFrom, rec.stageTo, rec.sourceKey)
      if (result.changes > 0) updated++
      else notFound++
    }
  })

  for (const file of files) {
    const content = readFileSync(resolve(TASK_REVIEWER_DIR, file), 'utf-8')
    const batch: { sourceKey: string; stageFrom: string | null; stageTo: string | null }[] = []

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const raw = safeJsonParse(trimmed) as Record<string, unknown> | null
      if (!raw) continue
      if (raw.action === 'skip' || raw.task_id === 'FEEDBACK') continue

      const stageFrom = extractStageLabel(raw.labels_removed)
      const stageTo = extractStageLabel(raw.labels_added)

      if (!stageFrom && !stageTo) {
        noStage++
        continue
      }

      const timestamp = (raw.timestamp as string) ?? ''
      const taskId = (raw.task_id as string) ?? null
      const sourceKey = `task-reviewer:${timestamp}:${taskId}:${raw.action}`

      batch.push({ sourceKey, stageFrom, stageTo })
    }

    if (batch.length > 0) {
      runBatch(batch)
    }
  }

  console.log(`[backfill-stages] Done — updated: ${updated}, not found in DB: ${notFound}, no stage data: ${noStage}`)
}

main()
