import type { FastifyInstance } from 'fastify'
import { listPersonas, getPersonaDetail, updatePersonaPrompt } from '../services/personas.js'

const SAFE_NAME = /^[a-z0-9_-]+$/

export async function personaRoutes(app: FastifyInstance) {
  // List all personas with summaries
  app.get('/api/personas', async () => {
    return { personas: listPersonas() }
  })

  // Get persona detail (config, permissions, prompt)
  app.get('/api/personas/:name', async (request, reply) => {
    const { name } = request.params as { name: string }
    if (!SAFE_NAME.test(name)) {
      return reply.status(400).send({ error: 'Invalid persona name' })
    }
    const detail = getPersonaDetail(name)
    if (!detail) {
      return reply.status(404).send({ error: `Persona '${name}' not found` })
    }
    return { persona: detail }
  })

  // Update persona prompt
  app.put('/api/personas/:name/prompt', async (request, reply) => {
    const { name } = request.params as { name: string }
    if (!SAFE_NAME.test(name)) {
      return reply.status(400).send({ error: 'Invalid persona name' })
    }
    const body = request.body as { prompt: string }
    if (!body.prompt) {
      return reply.status(400).send({ error: 'Prompt content required' })
    }
    try {
      updatePersonaPrompt(name, body.prompt)
      return { message: `Prompt updated for persona '${name}'` }
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message })
    }
  })
}
