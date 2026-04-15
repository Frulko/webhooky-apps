// Authenticated connections list — registered under /api prefix
export default async function connectionsRoutes(fastify) {
  fastify.get('/connections', { preHandler: [fastify.authenticate] }, async (request) => {
    const userId = request.user.sub
    return fastify.sql`
      SELECT ws.id, ws.endpoint_id, ws.client_id, ws.ip, ws.connected_at,
             e.name as endpoint_name, e.token as endpoint_token,
             c.name as client_name
      FROM ws_sessions ws
      JOIN endpoints e ON e.id = ws.endpoint_id
      JOIN clients c ON c.id = ws.client_id
      WHERE c.user_id = ${userId}
        AND ws.disconnected_at IS NULL
      ORDER BY ws.connected_at DESC
    `
  })

  fastify.delete('/connections/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user.sub
    const { id } = request.params

    const [session] = await fastify.sql`
      SELECT ws.id FROM ws_sessions ws
      JOIN endpoints e ON e.id = ws.endpoint_id
      JOIN clients c ON c.id = ws.client_id
      WHERE ws.id = ${id} AND c.user_id = ${userId}
    `

    if (!session) return reply.code(404).send({ error: 'Not found' })

    await fastify.sql`
      UPDATE ws_sessions SET disconnected_at = NOW() WHERE id = ${id}
    `

    return { ok: true }
  })
}
