import { verifyHmac } from '../services/hmac.js'
import { broadcast } from '../ws/bridge.js'

export default async function webhookRoutes(fastify) {
  // POST /hook/:token — public webhook receiver
  fastify.post('/hook/:token', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const { token } = request.params

    const [endpoint] = await fastify.sql`
      SELECT id, hmac_secret, hmac_header, active
      FROM endpoints WHERE token = ${token}
    `

    if (!endpoint || !endpoint.active) {
      return reply.code(404).send({ error: 'Endpoint not found' })
    }

    // HMAC verification
    if (endpoint.hmacSecret) {
      const sigHeader = request.headers[endpoint.hmacHeader?.toLowerCase()]
      const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body))
      const valid = verifyHmac(endpoint.hmacSecret, rawBody, sigHeader)
      if (!valid) {
        return reply.code(401).send({ error: 'Invalid signature' })
      }
    }

    const bodyRaw = request.body
    const bodyText = typeof bodyRaw === 'string' ? bodyRaw : JSON.stringify(bodyRaw)
    const bodyParsed = typeof bodyRaw === 'object' ? bodyRaw : null
    const sizeBytes = Buffer.byteLength(bodyText, 'utf8')

    const [webhook] = await fastify.sql`
      INSERT INTO webhooks (endpoint_id, method, headers, body, body_parsed, source_ip, size_bytes)
      VALUES (
        ${endpoint.id},
        ${request.method},
        ${JSON.stringify(request.headers)},
        ${bodyText},
        ${bodyParsed ? JSON.stringify(bodyParsed) : null},
        ${request.ip},
        ${sizeBytes}
      )
      RETURNING id, endpoint_id, method, source_ip, size_bytes, received_at
    `

    // Forward to connected WebSocket clients
    const forwarded = broadcast(endpoint.id, {
      type: 'webhook',
      webhook: {
        ...webhook,
        headers: request.headers,
        body: bodyParsed ?? bodyText,
      },
    })

    fastify.log.info({ webhookId: webhook.id, forwarded }, 'Webhook received')

    return reply.code(200).send({ received: true, id: webhook.id, forwarded })
  })

  // GET /webhooks — list webhooks (authenticated)
  fastify.get('/webhooks', {
    preHandler: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          endpointId: { type: 'string' },
          clientId: { type: 'string' },
          limit: { type: 'integer', default: 50, maximum: 200 },
          offset: { type: 'integer', default: 0 },
        },
      },
    },
  }, async (request) => {
    const { endpointId, clientId, limit = 50, offset = 0 } = request.query
    const userId = request.user.sub

    const rows = await fastify.sql`
      SELECT w.id, w.endpoint_id, w.method, w.source_ip, w.size_bytes, w.received_at,
             e.name as endpoint_name, e.token as endpoint_token,
             c.name as client_name
      FROM webhooks w
      JOIN endpoints e ON e.id = w.endpoint_id
      JOIN clients c ON c.id = e.client_id
      WHERE c.user_id = ${userId}
        ${endpointId ? fastify.sql`AND w.endpoint_id = ${endpointId}` : fastify.sql``}
        ${clientId ? fastify.sql`AND c.id = ${clientId}` : fastify.sql``}
      ORDER BY w.received_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    return rows
  })

  // GET /webhooks/:id — full detail
  fastify.get('/webhooks/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.sub

    const [webhook] = await fastify.sql`
      SELECT w.*, e.name as endpoint_name, e.token as endpoint_token, c.name as client_name
      FROM webhooks w
      JOIN endpoints e ON e.id = w.endpoint_id
      JOIN clients c ON c.id = e.client_id
      WHERE w.id = ${id} AND c.user_id = ${userId}
    `
    if (!webhook) return reply.code(404).send({ error: 'Webhook not found' })
    return webhook
  })
}
