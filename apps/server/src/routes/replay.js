import { broadcast, sendToSocket, getConnections } from '../ws/bridge.js'

export default async function replayRoutes(fastify) {
  const preHandler = [fastify.authenticate]

  // POST /webhooks/:id/replay
  fastify.post('/webhooks/:id/replay', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        required: ['target'],
        properties: {
          target: { type: 'string', enum: ['ws', 'url'] },
          url: { type: 'string', format: 'uri' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const { target, url } = request.body
    const userId = request.user.sub

    const [webhook] = await fastify.sql`
      SELECT w.*, e.id as endpoint_id
      FROM webhooks w
      JOIN endpoints e ON e.id = w.endpoint_id
      JOIN clients c ON c.id = e.client_id
      WHERE w.id = ${id} AND c.user_id = ${userId}
    `
    if (!webhook) return reply.code(404).send({ error: 'Webhook not found' })

    if (target === 'ws') {
      const forwarded = broadcast(webhook.endpointId, {
        type: 'replay',
        webhook: {
          id: webhook.id,
          method: webhook.method,
          headers: webhook.headers,
          body: webhook.bodyParsed ?? webhook.body,
          receivedAt: webhook.receivedAt,
        },
      })

      const [replay] = await fastify.sql`
        INSERT INTO replays (webhook_id, target_type, status, response_code)
        VALUES (${id}, 'ws', ${forwarded > 0 ? 'success' : 'failure'}, ${forwarded > 0 ? 200 : null})
        RETURNING id, status
      `

      return { replayId: replay.id, forwarded, status: replay.status }
    }

    if (target === 'url') {
      if (!url) return reply.code(400).send({ error: 'url is required for target=url' })

      let status = 'failure'
      let responseCode = null
      let errorMsg = null

      try {
        const headers = {
          'content-type': webhook.headers['content-type'] || 'application/json',
          'x-webhook-replay': 'true',
          'x-original-id': webhook.id,
        }

        const res = await fetch(url, {
          method: webhook.method || 'POST',
          headers,
          body: webhook.body,
          signal: AbortSignal.timeout(10000),
        })

        responseCode = res.status
        status = res.ok ? 'success' : 'failure'
      } catch (err) {
        errorMsg = err.message
      }

      const [replay] = await fastify.sql`
        INSERT INTO replays (webhook_id, target_type, target_url, status, response_code, error_msg)
        VALUES (${id}, 'url', ${url}, ${status}, ${responseCode}, ${errorMsg})
        RETURNING id, status, response_code
      `

      return { replayId: replay.id, status: replay.status, responseCode: replay.responseCode, errorMsg }
    }
  })

  // GET /webhooks/:id/replays — replay history
  fastify.get('/webhooks/:id/replays', { preHandler }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.sub

    const [webhook] = await fastify.sql`
      SELECT w.id FROM webhooks w
      JOIN endpoints e ON e.id = w.endpoint_id
      JOIN clients c ON c.id = e.client_id
      WHERE w.id = ${id} AND c.user_id = ${userId}
    `
    if (!webhook) return reply.code(404).send({ error: 'Webhook not found' })

    return fastify.sql`
      SELECT id, target_type, target_url, status, response_code, error_msg, created_at
      FROM replays WHERE webhook_id = ${id}
      ORDER BY created_at DESC
    `
  })
}
