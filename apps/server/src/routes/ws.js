import { register, unregister } from '../ws/bridge.js'

// WebSocket bridge — registered at root (no /api prefix)
export default async function wsRoutes(fastify) {
  fastify.get('/ws/:token', { websocket: true }, async (socket, request) => {
    const { token } = request.params
    const apiKey = request.query.key

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
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong' }))
        }
      } catch {}
    })

    socket.on('close', async () => {
      unregister(endpoint.id, socket)
      await fastify.sql`
        UPDATE ws_sessions SET disconnected_at = NOW() WHERE id = ${session.id}
      `
      fastify.log.info({ sessionId: session.id }, 'WS client disconnected')
    })
  })
}
