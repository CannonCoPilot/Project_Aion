import type { FastifyInstance } from 'fastify'

const PAI_BACKEND_URL = process.env.PAI_BACKEND_URL || 'http://host.docker.internal:4000'

async function proxyPai(url: string): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url)
    const body = await res.json()
    return { status: res.status, body }
  } catch {
    return { status: 503, body: { error: 'PAI backend unreachable' } }
  }
}

export async function paiProxyRoutes(app: FastifyInstance) {
  app.get('/api/pai/health', async (_req, reply) => {
    const { status, body } = await proxyPai(`${PAI_BACKEND_URL}/health`)
    return reply.status(status).send(body)
  })

  app.get('/api/pai/stats', async (_req, reply) => {
    const { status, body } = await proxyPai(`${PAI_BACKEND_URL}/stats`)
    return reply.status(status).send(body)
  })

  app.get<{ Querystring: { limit?: string; since?: string } }>(
    '/api/pai/events/recent',
    async (req, reply) => {
      const params = new URLSearchParams()
      if (req.query.limit) params.set('limit', req.query.limit)
      if (req.query.since) params.set('since', req.query.since)
      const qs = params.toString()
      const url = `${PAI_BACKEND_URL}/events/recent${qs ? '?' + qs : ''}`
      const { status, body } = await proxyPai(url)
      return reply.status(status).send(body)
    }
  )

  app.get('/api/pai/patterns', async (_req, reply) => {
    const { status, body } = await proxyPai(`${PAI_BACKEND_URL}/api/patterns`)
    return reply.status(status).send(body)
  })

  app.get('/api/pai/infra-status', async (_req, reply) => {
    const { status, body } = await proxyPai(`${PAI_BACKEND_URL}/api/infra-status`)
    return reply.status(status).send(body)
  })

  app.get<{ Params: { sessionId: string } }>(
    '/api/pai/events/session/:sessionId',
    async (req, reply) => {
      const { status, body } = await proxyPai(
        `${PAI_BACKEND_URL}/events/session/${encodeURIComponent(req.params.sessionId)}`
      )
      return reply.status(status).send(body)
    }
  )
}
