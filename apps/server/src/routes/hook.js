import { verifyHmac } from '../services/hmac.js'
import { broadcast } from '../ws/bridge.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

// Public webhook receiver — no /api prefix, registered at root
export default async function hookRoutes(fastify) {
  fastify.route({
    method: METHODS,
    url: '/hook/:token',
    config: {
      rawBody: true,
      rateLimit: { max: 120, timeWindow: '1 minute' },
    },
    bodyLimit: 1_048_576, // 1 MB
    handler: async (request, reply) => {
      const { token } = request.params

      const [endpoint] = await fastify.sql`
        SELECT id, hmac_secret, hmac_header, active
        FROM endpoints WHERE token = ${token}
      `

      if (!endpoint || !endpoint.active) {
        return reply.code(404).send({ error: 'Not found' })
      }

      // ── Body normalisation ──────────────────────────────────────────────
      const bodyRaw = request.body

      let bodyText = ''
      let bodyParsed = null

      if (bodyRaw === undefined || bodyRaw === null) {
        bodyText = ''
      } else if (typeof bodyRaw === 'string') {
        bodyText = bodyRaw
        try { bodyParsed = JSON.parse(bodyRaw) } catch {}
      } else if (Buffer.isBuffer(bodyRaw)) {
        bodyText = bodyRaw.toString('utf8')
        try { bodyParsed = JSON.parse(bodyText) } catch {}
      } else if (typeof bodyRaw === 'object') {
        bodyText = JSON.stringify(bodyRaw)
        bodyParsed = bodyRaw
      } else {
        bodyText = String(bodyRaw)
      }

      // ── HMAC verification ───────────────────────────────────────────────
      if (endpoint.hmacSecret) {
        const sigHeader = request.headers[endpoint.hmacHeader?.toLowerCase()]
        const raw = request.rawBody ?? Buffer.from(bodyText)
        if (!verifyHmac(endpoint.hmacSecret, raw, sigHeader)) {
          return reply.code(401).send({ error: 'Invalid signature' })
        }
      }

      const sizeBytes = Buffer.byteLength(bodyText, 'utf8')
      const queryParams = request.query ?? {}

      // ── Persist ─────────────────────────────────────────────────────────
      const [webhook] = await fastify.sql`
        INSERT INTO webhooks
          (endpoint_id, method, headers, query_params, body, body_parsed, source_ip, size_bytes)
        VALUES (
          ${endpoint.id},
          ${request.method},
          ${fastify.sql.json(request.headers)},
          ${fastify.sql.json(queryParams)},
          ${bodyText || null},
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
          query_params: queryParams,
          body: bodyParsed ?? bodyText ?? null,
        },
      })

      fastify.log.info({ webhookId: webhook.id, method: request.method, forwarded }, 'Webhook received')

      if (request.method === 'HEAD') {
        return reply.code(200).send()
      }

      return reply.code(200).send({ received: true, id: webhook.id, forwarded })
    },
  })
}
