// Authenticated webhook management routes — registered under /api prefix
export default async function webhookRoutes(fastify) {
  // GET /webhooks — list webhooks
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

    return fastify.sql`
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
