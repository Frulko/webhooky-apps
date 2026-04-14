import { createConnectToken } from '../ws/connect-tokens.js'

/**
 * POST /api/ws-token
 * Issues a short-lived (30s) one-time connect token for WebSocket authentication.
 * Replaces passing the API key as a URL query parameter.
 */
export default async function wsTokenRoutes(fastify) {
  fastify.post('/ws-token', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['endpointToken', 'apiKey'],
        properties: {
          endpointToken: { type: 'string' },
          apiKey: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { endpointToken, apiKey } = request.body

    // Verify the client API key belongs to the authenticated user
    const [client] = await fastify.sql`
      SELECT c.id
      FROM clients c
      WHERE c.api_key = ${apiKey}
        AND c.user_id = ${request.user.sub}
        AND c.active = true
    `

    if (!client) {
      return reply.code(403).send({ error: 'Invalid API key' })
    }

    // Verify the endpoint belongs to that client
    const [endpoint] = await fastify.sql`
      SELECT e.id
      FROM endpoints e
      WHERE e.token = ${endpointToken}
        AND e.client_id = ${client.id}
        AND e.active = true
    `

    if (!endpoint) {
      return reply.code(404).send({ error: 'Endpoint not found' })
    }

    const connectToken = createConnectToken(endpoint.id, client.id)
    return { connectToken }
  })
}
