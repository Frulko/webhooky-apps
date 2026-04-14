import { register, unregister } from '../ws/bridge.js'

export default async function wsRoutes(fastify) {
  // WS /ws/:token?key=<api_key>
  fastify.get('/ws/:token', { websocket: true }, async (socket, request) => {
    const { token } = request.params
    const apiKey = request.query.key

    // Authenticate via api_key
    const [client] = await fastify.sql`
      SELECT c.id, c.user_id, c.active
      FROM clients c
      WHERE c.api_key = ${apiKey} AND c.active = true
    `

    if (!client) {
      socket.send(JSON.stringify({ type: 'error', message: 'Unauthorized' }))
      socket.close(1008, 'Unauthorized')
      return
    }

    // Find endpoint
    const [endpoint] = await fastify.sql`
      SELECT e.id, e.active
      FROM endpoints e
      JOIN clients c ON c.id = e.client_id
      WHERE e.token = ${token} AND c.id = ${client.id} AND e.active = true
    `

    if (!endpoint) {
      socket.send(JSON.stringify({ type: 'error', message: 'Endpoint not found' }))
      socket.close(1008, 'Endpoint not found')
      return
    }

    // Create session
    const [session] = await fastify.sql`
      INSERT INTO ws_sessions (endpoint_id, client_id, ip)
      VALUES (${endpoint.id}, ${client.id}, ${request.ip})
      RETURNING id
    `

    register(endpoint.id, socket)

    socket.send(JSON.stringify({
      type: 'connected',
      sessionId: session.id,
      endpointId: endpoint.id,
    }))

    fastify.log.info({ sessionId: session.id, endpointId: endpoint.id }, 'WS client connected')

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        // Heartbeat
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
        }
      } catch {
        // ignore malformed messages
      }
    })

    socket.on('close', async () => {
      unregister(endpoint.id, socket)
      await fastify.sql`
        UPDATE ws_sessions SET disconnected_at = NOW() WHERE id = ${session.id}
      `
      fastify.log.info({ sessionId: session.id }, 'WS client disconnected')
    })
  })

  // GET /connections — list active WS sessions (authenticated)
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
}
