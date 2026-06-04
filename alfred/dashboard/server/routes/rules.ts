import type { FastifyInstance } from 'fastify'
import {
  getAllRules,
  getRuleById,
  getRulesByDomain,
  getRulesDomainSummary,
  toggleRule,
  getRulesForPersona,
  getCorrections,
  getCorrectionStats,
  getRuleSuggestions,
  generateSuggestions,
} from '../services/rules.js'
import {
  addCorrection,
  updateRuleSuggestionStatus,
} from '../services/dashboard-db.js'

export async function rulesRoutes(app: FastifyInstance) {
  // List all rules
  app.get('/api/rules', async (request) => {
    const { domain } = request.query as { domain?: string }
    const rules = domain ? getRulesByDomain(domain) : getAllRules()
    const summary = getRulesDomainSummary()
    return { rules, summary }
  })

  // Get a specific rule
  app.get('/api/rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rule = getRuleById(id)
    if (!rule) return reply.status(404).send({ error: 'Rule not found' })
    return rule
  })

  // Toggle rule enabled/disabled
  app.patch('/api/rules/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { enabled } = request.body as { enabled: boolean }
    const ok = toggleRule(id, enabled)
    if (!ok) return reply.status(404).send({ error: 'Rule not found or could not update' })
    return { id, enabled }
  })

  // Get rules for a specific persona
  app.get('/api/rules/persona/:name', async (request) => {
    const { name } = request.params as { name: string }
    return getRulesForPersona(name)
  })

  // --- Corrections ---

  // List corrections
  app.get('/api/corrections', async (request) => {
    const { limit, domain } = request.query as { limit?: string; domain?: string }
    const corrections = getCorrections(parseInt(limit || '50'), domain)
    const stats = getCorrectionStats()
    return { corrections, stats }
  })

  // Log a correction
  app.post('/api/corrections', async (request) => {
    const body = request.body as {
      rule_id?: string
      domain: string
      action_taken: string
      correction: string
      context?: string
      persona?: string
      job?: string
    }
    return addCorrection({
      rule_id: body.rule_id ?? null,
      domain: body.domain,
      action_taken: body.action_taken,
      correction: body.correction,
      context: body.context ?? null,
      persona: body.persona ?? null,
      job: body.job ?? null,
    })
  })

  // --- Suggestions ---

  // List suggestions
  app.get('/api/rules/suggestions', async (request) => {
    const { status } = request.query as { status?: string }
    return getRuleSuggestions(status || 'pending')
  })

  // Generate new suggestions from corrections
  app.post('/api/rules/suggestions/generate', async () => {
    return generateSuggestions()
  })

  // Accept or reject a suggestion
  app.patch('/api/rules/suggestions/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = request.body as { status: string }
    if (!['accepted', 'rejected', 'pending'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' })
    }
    updateRuleSuggestionStatus(parseInt(id), status)
    return { id: parseInt(id), status }
  })
}
