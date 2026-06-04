import type { FastifyInstance } from 'fastify'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { getTaskById } from '../services/pulse-client.js'

const OBSIDIAN_VAULT = '/mnt/synology_nas/Obsidian/Master'
const VAULT_NAME = 'Master'

export interface ObsidianBacklink {
  title: string
  path: string     // vault-relative path
  snippet: string  // surrounding context around the match
  obsidianUrl: string
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractSnippet(content: string, pattern: RegExp, maxLen = 120): string {
  const match = content.match(pattern)
  if (!match || match.index == null) return ''
  const start = Math.max(0, match.index - 60)
  const end = Math.min(content.length, match.index + match[0].length + 60)
  let snippet = content.slice(start, end).replace(/\n+/g, ' ').trim()
  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'
  return snippet.slice(0, maxLen + 6) // leave room for ellipsis
}

function getTitleFromContent(content: string, fallback: string): string {
  // Try frontmatter title first
  const fmMatch = content.match(/^---[\s\S]*?title:\s*["']?(.+?)["']?\s*(?:\n|$)/m)
  if (fmMatch) return fmMatch[1].trim()
  // Try first H1
  const h1Match = content.match(/^#\s+(.+)/m)
  if (h1Match) return h1Match[1].trim()
  return fallback
}

function* walkMarkdown(dir: string): Generator<string> {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    // Skip hidden dirs (.obsidian, .trash, @eaDir, #recycle)
    if (entry.startsWith('.') || entry.startsWith('@') || entry.startsWith('#')) continue
    const full = join(dir, entry)
    let stat
    try { stat = statSync(full) } catch { continue }
    if (stat.isDirectory()) {
      yield* walkMarkdown(full)
    } else if (entry.endsWith('.md')) {
      yield full
    }
  }
}

function searchVault(terms: string[]): ObsidianBacklink[] {
  const results: ObsidianBacklink[] = []
  const seen = new Set<string>()

  // Build combined regex — match any of the terms
  const patterns = terms.map(t => escapeRegex(t))
  const combined = new RegExp(patterns.join('|'), 'i')

  for (const filePath of walkMarkdown(OBSIDIAN_VAULT)) {
    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }

    if (!combined.test(content)) continue

    const relPath = relative(OBSIDIAN_VAULT, filePath)
    if (seen.has(relPath)) continue
    seen.add(relPath)

    const filename = filePath.split('/').pop()!.replace(/\.md$/, '')
    const title = getTitleFromContent(content, filename)
    const snippet = extractSnippet(content, combined)

    // Build obsidian:// URL — encode the vault-relative path without extension
    const fileParam = relPath.replace(/\.md$/, '')
    const obsidianUrl = `obsidian://open?vault=${encodeURIComponent(VAULT_NAME)}&file=${encodeURIComponent(fileParam)}`

    results.push({ title, path: relPath, snippet, obsidianUrl })

    if (results.length >= 20) break // cap results
  }

  return results
}

export async function obsidianRoutes(app: FastifyInstance) {
  app.get('/api/tasks/:id/obsidian-backlinks', async (request, reply) => {
    const { id } = request.params as { id: string }

    const task = await getTaskById(id)
    if (!task) return reply.status(404).send({ error: 'Task not found' })

    // Search terms: task ID + significant words from title (3+ chars)
    const titleWords = task.title
      .split(/\s+/)
      .filter(w => w.length >= 4)
      .slice(0, 3)

    const terms = [id, ...titleWords].filter(Boolean)

    let backlinks: ObsidianBacklink[] = []
    try {
      backlinks = searchVault(terms)
    } catch (err) {
      // Vault not accessible — return empty gracefully
      app.log.warn({ err }, 'Obsidian vault search failed')
    }

    return { backlinks, total: backlinks.length }
  })
}
