import { verifyHmac } from '../services/hmac.js'
import { broadcast } from '../ws/bridge.js'

// Public webhook receiver — no /api prefix, registered at root
export default async function hookRoutes(fastify) {
  fastify.post('/hook/:token', {
    config: {
      rawBody: true,
      rateLimit: { max: 120, timeWindow: '1 minute' },
    },
    bodyLimit: 1_048_576, // 1 MB max per webhook
  }, async (request, reply) => {
    const { token } = request.params

    const [endpoint] = await fastify.sql`
      SELECT id, hmac_secret, hmac_header, active
      FROM endpoints WHERE token = ${token}
    `

    if (!endpoint || !endpoint.active) {
      return reply.code(404).send({ error: 'Endpoint not found' })
    }

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
        ${fastify.sql.json(request.headers)},
        ${bodyText},
        ${bodyParsed ? fastify.sql.json(bodyParsed) : null},
        ${request.ip},
        ${sizeBytes}
      )
      RETURNING id, endpoint_id, method, source_ip, size_bytes, received_at
    `

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
}
