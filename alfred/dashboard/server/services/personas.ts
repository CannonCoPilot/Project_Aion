import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const workspace = process.env.WORKSPACE_DIR || process.cwd();

const home = process.env.WORKSPACE_DIR || process.cwd()
const PERSONAS_DIR = process.env.PERSONAS_DIR || resolve(workspace, '.claude/jobs/personas')

export interface PersonaConfig {
  persona: string
  engine: { default: string; model: string; fallback: string | null }
  limits: { max_turns: number; max_budget_usd: number; timeout_minutes: number }
  output: { format: string; save_to: string }
  session: { persist: boolean }
}

export interface PersonaPermissions {
  persona: string
  tier: string
  allowed_tools: string[]
  denied_tools: string[]
  allowed_bash: string[]
  pre_approved: string[]
}

export interface PersonaSummary {
  name: string
  engine: string
  model: string
  tier: string
  maxBudget: number
  maxTurns: number
  toolCount: number
  deniedCount: number
  promptPreview: string
}

export interface PersonaDetail {
  name: string
  config: PersonaConfig
  permissions: PersonaPermissions
  prompt: string
}

function parseYaml(content: string): Record<string, unknown> {
  // Simple YAML parser for flat/nested persona configs
  // Handles the specific structure of persona YAML files
  const result: Record<string, unknown> = {}
  const lines = content.split('\n')
  let currentSection: string | null = null
  let currentList: string[] | null = null
  let currentListKey: string | null = null

  for (const line of lines) {
    const trimmed = line.trimEnd()
    if (!trimmed || trimmed.trimStart().startsWith('#')) continue

    // List item
    if (trimmed.match(/^\s+- /)) {
      const value = trimmed.replace(/^\s+- /, '').replace(/^"(.*)"$/, '$1')
      if (currentList) {
        currentList.push(value)
      }
      continue
    }

    // Save any pending list
    if (currentList && currentListKey) {
      if (currentSection && currentListKey !== currentSection) {
        // Nested list inside a section (e.g., engine.models)
        const section = result[currentSection] as Record<string, unknown> ?? {}
        section[currentListKey] = currentList
        result[currentSection] = section
      } else {
        // Top-level list (e.g., allowed_tools)
        result[currentListKey] = currentList
      }
      currentList = null
      currentListKey = null
    }

    // Top-level key
    const topMatch = trimmed.match(/^(\w[\w_-]*):(.*)$/)
    if (topMatch) {
      const [, key, val] = topMatch
      const trimVal = val.trim()
      if (trimVal === '' || trimVal === '{}') {
        // Could be a section header OR start of a top-level list
        // Peek ahead: if next non-comment line starts with "  - ", it's a list
        currentSection = key
        currentList = []
        currentListKey = key
        if (!result[key]) result[key] = {}
      } else {
        currentSection = null
        result[key] = parseValue(trimVal)
      }
      continue
    }

    // Nested key
    const nestedMatch = trimmed.match(/^\s+(\w[\w_-]*):(.*)$/)
    if (nestedMatch && currentSection) {
      const [, key, val] = nestedMatch
      const trimVal = val.trim()
      if (trimVal === '') {
        // Start of a list
        currentList = []
        currentListKey = key
      } else {
        const section = result[currentSection] as Record<string, unknown> ?? {}
        section[key] = parseValue(trimVal)
        result[currentSection] = section
      }
    }
  }

  // Save any final pending list
  if (currentList && currentListKey) {
    if (currentSection && currentListKey !== currentSection) {
      const section = result[currentSection] as Record<string, unknown> ?? {}
      section[currentListKey] = currentList
      result[currentSection] = section
    } else {
      result[currentListKey] = currentList
    }
  }

  return result
}

function parseValue(s: string): unknown {
  // Strip inline YAML comments — anything after `#` preceded by whitespace.
  // Safe for quoted strings (preserves embedded `#` inside `"..."`).
  if (!s.startsWith('"')) {
    const m = s.match(/^([^#]*?)\s+#.*$/)
    if (m) s = m[1].trimEnd()
  }
  if (s === 'null' || s === '~') return null
  if (s === 'true') return true
  if (s === 'false') return false
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1)
  const n = Number(s)
  if (!isNaN(n) && s !== '') return n
  return s
}

function readPersonaFile(name: string, file: string): string {
  const path = join(PERSONAS_DIR, name, file)
  if (!existsSync(path)) return ''
  return readFileSync(path, 'utf-8')
}

export function listPersonas(): PersonaSummary[] {
  if (!existsSync(PERSONAS_DIR)) return []

  const dirs = readdirSync(PERSONAS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort()

  return dirs.map(name => {
    const configRaw = readPersonaFile(name, 'config.yaml')
    const permRaw = readPersonaFile(name, 'permissions.yaml')
    const prompt = readPersonaFile(name, 'prompt.md')

    const config = parseYaml(configRaw)
    const perm = parseYaml(permRaw)

    const engine = config.engine as Record<string, unknown> ?? {}
    const limits = config.limits as Record<string, unknown> ?? {}
    const allowedTools = (perm.allowed_tools as string[]) ?? []
    const deniedTools = (perm.denied_tools as string[]) ?? []

    // Extract first non-header, non-empty line from prompt as preview
    const promptLines = prompt.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
    const preview = promptLines[0]?.trim().slice(0, 120) ?? ''

    return {
      name,
      engine: (engine.default as string) ?? 'unknown',
      model: (engine.model as string) ?? 'unknown',
      tier: (perm.tier as string) ?? 'unknown',
      maxBudget: (limits.max_budget_usd as number) ?? 0,
      maxTurns: (limits.max_turns as number) ?? 0,
      toolCount: allowedTools.length,
      deniedCount: deniedTools.length,
      promptPreview: preview,
    }
  })
}

export function getPersonaDetail(name: string): PersonaDetail | null {
  const dir = join(PERSONAS_DIR, name)
  if (!existsSync(dir) || name.startsWith('_')) return null

  const configRaw = readPersonaFile(name, 'config.yaml')
  const permRaw = readPersonaFile(name, 'permissions.yaml')
  const prompt = readPersonaFile(name, 'prompt.md')

  const configParsed = parseYaml(configRaw)
  const permParsed = parseYaml(permRaw)

  const engineRaw = configParsed.engine as Record<string, unknown> ?? {}
  const limitsRaw = configParsed.limits as Record<string, unknown> ?? {}
  const outputRaw = configParsed.output as Record<string, unknown> ?? {}
  const sessionRaw = configParsed.session as Record<string, unknown> ?? {}

  const config: PersonaConfig = {
    persona: (configParsed.persona as string) ?? name,
    engine: {
      default: (engineRaw.default as string) ?? 'claude-code',
      model: (engineRaw.model as string) ?? 'sonnet',
      fallback: (engineRaw.fallback as string) ?? null,
    },
    limits: {
      max_turns: (limitsRaw.max_turns as number) ?? 10,
      max_budget_usd: (limitsRaw.max_budget_usd as number) ?? 2,
      timeout_minutes: (limitsRaw.timeout_minutes as number) ?? 10,
    },
    output: {
      format: (outputRaw.format as string) ?? 'json',
      save_to: (outputRaw.save_to as string) ?? '',
    },
    session: {
      persist: (sessionRaw.persist as boolean) ?? false,
    },
  }

  const permissions: PersonaPermissions = {
    persona: (permParsed.persona as string) ?? name,
    tier: (permParsed.tier as string) ?? 'unknown',
    allowed_tools: (permParsed.allowed_tools as string[]) ?? [],
    denied_tools: (permParsed.denied_tools as string[]) ?? [],
    allowed_bash: (permParsed.allowed_bash as string[]) ?? [],
    pre_approved: (permParsed.pre_approved as string[]) ?? [],
  }

  return { name, config, permissions, prompt }
}

export function updatePersonaPrompt(name: string, prompt: string): void {
  const path = join(PERSONAS_DIR, name, 'prompt.md')
  if (!existsSync(path)) throw new Error(`Persona ${name} not found`)
  writeFileSync(path, prompt, 'utf-8')
}
