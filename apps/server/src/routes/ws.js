import { register, unregister } from '../ws/bridge.js'
import { consumeConnectToken } from '../ws/connect-tokens.js'

// WebSocket bridge — registered at root (no /api prefix)
export default async function wsRoutes(fastify) {
  fastify.get('/ws/:token', { websocket: true }, async (socket, request) => {
    const { token } = request.params
    const connectToken = request.query.t

    if (!connectToken) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing connect token' }))
      socket.close(1008, 'Unauthorized')
      return
    }

    const tokenData = consumeConnectToken(connectToken)
    if (!tokenData) {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid or expired connect token' }))
      socket.close(1008, 'Unauthorized')
      return
    }

    // Verify the endpoint token matches what was issued
    const [endpoint] = await fastify.sql`
      SELECT e.id, e.active
      FROM endpoints e
      WHERE e.id = ${tokenData.endpointId}
        AND e.token = ${token}
        AND e.active = true
    `

    if (!endpoint) {
      socket.send(JSON.stringify({ type: 'error', message: 'Endpoint not found or inactive' }))
      socket.close(1008, 'Endpoint not found')
      return
    }

    const [session] = await fastify.sql`
      INSERT INTO ws_sessions (endpoint_id, client_id, ip)
      VALUES (${endpoint.id}, ${tokenData.clientId}, ${request.ip})
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
