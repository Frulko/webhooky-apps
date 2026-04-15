export default async function deliveryRoutes(fastify) {
  const preHandler = [fastify.authenticate]

  // POST /api/webhooks/:id/delivery — called by CLI after forwarding
  fastify.post('/webhooks/:id/delivery', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        properties: {
          sessionId:       { type: 'string' },
          statusCode:      { type: 'integer' },
          responseHeaders: { type: 'object' },
          responseBody:    { type: 'string' },
          durationMs:      { type: 'integer' },
          errorMsg:        { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.sub
    const { sessionId, statusCode, responseHeaders, responseBody, durationMs, errorMsg } = request.body ?? {}

    // Verify caller owns this webhook
    const [wh] = await fastify.sql`
      SELECT w.id FROM webhooks w
      JOIN endpoints e ON e.id = w.endpoint_id
      JOIN clients c ON c.id = e.client_id
      WHERE w.id = ${id} AND c.user_id = ${userId}
    `
    if (!wh) return reply.code(404).send({ error: 'Webhook not found' })

    const [delivery] = await fastify.sql`
      INSERT INTO deliveries
        (webhook_id, session_id, status_code, response_headers, response_body, duration_ms, error_msg)
      VALUES
        (${id}, ${sessionId ?? null}, ${statusCode ?? null}, ${responseHeaders ? fastify.sql.json(responseHeaders) : null},
         ${responseBody ?? null}, ${durationMs ?? null}, ${errorMsg ?? null})
      RETURNING id, forwarded_at
    `

    return { id: delivery.id, forwardedAt: delivery.forwarded_at }
  })

  // GET /api/webhooks/:id/deliveries — list delivery reports for a webhook
  fastify.get('/webhooks/:id/deliveries', { preHandler }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.sub

    const [wh] = await fastify.sql`
      SELECT w.id FROM webhooks w
      JOIN endpoints e ON e.id = w.endpoint_id
      JOIN clients c ON c.id = e.client_id
      WHERE w.id = ${id} AND c.user_id = ${userId}
    `
    if (!wh) return reply.code(404).send({ error: 'Webhook not found' })

    return fastify.sql`
      SELECT
        d.id, d.session_id, d.status_code, d.response_headers, d.response_body,
        d.duration_ms, d.error_msg, d.forwarded_at,
        s.ip AS session_ip, s.connected_at AS session_connected_at
      FROM deliveries d
      LEFT JOIN ws_sessions s ON s.id = d.session_id
      WHERE d.webhook_id = ${id}
      ORDER BY d.forwarded_at DESC
      LIMIT 50
    `
  })
}
