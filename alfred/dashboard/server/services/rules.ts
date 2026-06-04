import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import {
  getCorrections,
  getCorrectionStats,
  addRuleSuggestion,
  getRuleSuggestions,
  type RuleSuggestion,
} from './dashboard-db.js'

const workspace = process.env.WORKSPACE_DIR || process.cwd();

const home = process.env.WORKSPACE_DIR || process.cwd()
const RULES_DIR = process.env.RULES_DIR || resolve(workspace, '.claude/jobs/rules')

export interface Rule {
  id: string
  title: string
  domain: string
  severity: 'critical' | 'warning' | 'info'
  scope: string
  condition: string
  action: string
  examples?: string[]
  source: string
  created: string
  updated?: string
  enabled: boolean
}

export interface RuleFile {
  filename: string
  domain: string
  rules: Rule[]
}

function yamlVal(line: string): string {
  const idx = line.indexOf(':')
  if (idx === -1) return ''
  let val = line.slice(idx + 1).trim()
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  return val
}

function parseRulesYaml(content: string): Rule[] {
  const rules: Rule[] = []
  let current: Partial<Rule> | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trimEnd()
    if (!trimmed || trimmed.trimStart().startsWith('#')) continue

    // New rule entry (list item with id)
    const ruleStart = trimmed.match(/^\s+-\s+id:\s*(.+)/)
    if (ruleStart) {
      if (current?.id) rules.push(current as Rule)
      current = {
        id: ruleStart[1].trim(),
        title: '',
        domain: '',
        severity: 'info',
        scope: 'global',
        condition: '',
        action: '',
        source: 'manual',
        created: '',
        enabled: true,
      }
      continue
    }

    if (!current) continue

    const stripped = trimmed.trim()
    const val = yamlVal(stripped)

    if (stripped.startsWith('title:')) current.title = val
    else if (stripped.startsWith('domain:')) current.domain = val
    else if (stripped.startsWith('severity:')) current.severity = val as Rule['severity']
    else if (stripped.startsWith('scope:')) current.scope = val
    else if (stripped.startsWith('condition:')) current.condition = val
    else if (stripped.startsWith('action:')) current.action = val
    else if (stripped.startsWith('source:')) current.source = val
    else if (stripped.startsWith('created:')) current.created = val
    else if (stripped.startsWith('updated:')) current.updated = val
    else if (stripped.startsWith('enabled:')) current.enabled = val !== 'false'
  }

  if (current?.id) rules.push(current as Rule)
  return rules
}

export function loadAllRules(): RuleFile[] {
  if (!existsSync(RULES_DIR)) return []

  const files = readdirSync(RULES_DIR).filter(f => f.endsWith('.yaml') && f !== 'schema.yaml')
  return files.map(f => {
    const content = readFileSync(resolve(RULES_DIR, f), 'utf-8')
    const rules = parseRulesYaml(content)
    const domain = basename(f, '.yaml')
    return { filename: f, domain, rules }
  })
}

export function getAllRules(): Rule[] {
  return loadAllRules().flatMap(f => f.rules)
}

export function getRuleById(id: string): Rule | undefined {
  return getAllRules().find(r => r.id === id)
}

export function getRulesByDomain(domain: string): Rule[] {
  return getAllRules().filter(r => r.domain === domain)
}

export function toggleRule(id: string, enabled: boolean): boolean {
  if (!/^[a-z0-9_-]+$/.test(id)) return false

  const files = loadAllRules()
  for (const file of files) {
    const rule = file.rules.find(r => r.id === id)
    if (rule) {
      const filePath = resolve(RULES_DIR, file.filename)
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      let inTargetRule = false
      let modified = false

      const result = lines.map(line => {
        // Detect rule start
        const ruleStart = line.match(/^\s+-\s+id:\s*(.+)/)
        if (ruleStart) {
          inTargetRule = ruleStart[1].trim() === id
        }
        // Update enabled field within the target rule
        if (inTargetRule && line.match(/^\s+enabled:\s/)) {
          modified = true
          return line.replace(/enabled:\s*(true|false)/, `enabled: ${enabled}`)
        }
        return line
      })

      if (modified) {
        writeFileSync(filePath, result.join('\n'))
        return true
      }
    }
  }
  return false
}

export function getRulesDomainSummary(): { domain: string; total: number; enabled: number; critical: number }[] {
  const rules = getAllRules()
  const domains = new Map<string, { total: number; enabled: number; critical: number }>()

  for (const r of rules) {
    const d = domains.get(r.domain) || { total: 0, enabled: 0, critical: 0 }
    d.total++
    if (r.enabled) d.enabled++
    if (r.severity === 'critical') d.critical++
    domains.set(r.domain, d)
  }

  return Array.from(domains.entries()).map(([domain, stats]) => ({ domain, ...stats }))
}

// --- Suggestion Engine ---

export function generateSuggestions(): RuleSuggestion[] {
  const corrections = getCorrections(100)
  if (corrections.length < 3) return []

  // Group corrections by domain
  const byDomain = new Map<string, typeof corrections>()
  for (const c of corrections) {
    const group = byDomain.get(c.domain) || []
    group.push(c)
    byDomain.set(c.domain, group)
  }

  const suggestions: RuleSuggestion[] = []
  const existingRules = getAllRules()
  const existingSuggestions = getRuleSuggestions('all')

  for (const [domain, domainCorrections] of byDomain) {
    // Need at least 3 corrections in same domain to suggest a rule
    if (domainCorrections.length < 3) continue

    // Find common patterns in corrections
    const actionCounts = new Map<string, number>()
    for (const c of domainCorrections) {
      const key = c.correction.toLowerCase().slice(0, 50)
      actionCounts.set(key, (actionCounts.get(key) || 0) + 1)
    }

    for (const [pattern, count] of actionCounts) {
      if (count < 2) continue

      // Check if a rule already covers this
      const alreadyCovered = existingRules.some(r =>
        r.domain === domain && r.action.toLowerCase().includes(pattern.slice(0, 20))
      )
      if (alreadyCovered) continue

      // Check if suggestion already exists
      const alreadySuggested = existingSuggestions.some(s =>
        s.domain === domain && s.action_text.toLowerCase().includes(pattern.slice(0, 20))
      )
      if (alreadySuggested) continue

      const representative = domainCorrections.find(c => c.correction.toLowerCase().startsWith(pattern))
      if (!representative) continue

      const suggestion = addRuleSuggestion({
        title: `Auto: ${representative.correction.slice(0, 60)}`,
        domain,
        condition_text: representative.action_taken,
        action_text: representative.correction,
        based_on_corrections: JSON.stringify(domainCorrections.slice(0, 5).map(c => c.id)),
        confidence: Math.min(0.9, 0.3 + count * 0.15),
      })
      suggestions.push(suggestion)
    }
  }

  return suggestions
}

export function getRulesForPersona(personaName: string): Rule[] {
  return getAllRules().filter(r =>
    r.enabled && (r.scope === 'global' || r.scope === `persona:${personaName}`)
  )
}

export { getCorrections, getCorrectionStats, getRuleSuggestions }
