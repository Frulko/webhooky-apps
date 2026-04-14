import { nanoid } from 'nanoid'

export default async function endpointsRoutes(fastify) {
  const preHandler = [fastify.authenticate]

  async function assertClientOwnership(fastify, clientId, userId) {
    const [client] = await fastify.sql`
      SELECT id FROM clients WHERE id = ${clientId} AND user_id = ${userId}
    `
    return !!client
  }

  // GET /clients/:clientId/endpoints
  fastify.get('/clients/:clientId/endpoints', { preHandler }, async (request, reply) => {
    const { clientId } = request.params
    const userId = request.user.sub
    const owned = await assertClientOwnership(fastify, clientId, userId)
    if (!owned && request.user.role !== 'admin') {
      return reply.code(404).send({ error: 'Client not found' })
    }

    return fastify.sql`
      SELECT id, client_id, name, token, hmac_header,
             CASE WHEN hmac_secret IS NOT NULL THEN true ELSE false END as has_hmac,
             active, created_at
      FROM endpoints WHERE client_id = ${clientId}
      ORDER BY created_at DESC
    `
  })

  // GET /clients/:clientId/endpoints/:id
  fastify.get('/clients/:clientId/endpoints/:id', { preHandler }, async (request, reply) => {
    const { clientId, id } = request.params
    const userId = request.user.sub
    const owned = await assertClientOwnership(fastify, clientId, userId)
    if (!owned && request.user.role !== 'admin') {
      return reply.code(404).send({ error: 'Client not found' })
    }

    const [ep] = await fastify.sql`
      SELECT id, client_id, name, token, hmac_header,
             CASE WHEN hmac_secret IS NOT NULL THEN true ELSE false END as has_hmac,
             active, created_at
      FROM endpoints WHERE id = ${id} AND client_id = ${clientId}
    `
    if (!ep) return reply.code(404).send({ error: 'Endpoint not found' })
    return ep
  })

  // POST /clients/:clientId/endpoints
  fastify.post('/clients/:clientId/endpoints', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          hmacSecret: { type: 'string' },
          hmacHeader: { type: 'string', default: 'x-hub-signature-256' },
        },
      },
    },
  }, async (request, reply) => {
    const { clientId } = request.params
    const userId = request.user.sub
    const owned = await assertClientOwnership(fastify, clientId, userId)
    if (!owned && request.user.role !== 'admin') {
      return reply.code(404).send({ error: 'Client not found' })
    }

    const { name, hmacSecret, hmacHeader = 'x-hub-signature-256' } = request.body
    const token = nanoid(24)

    const [ep] = await fastify.sql`
      INSERT INTO endpoints (client_id, name, token, hmac_secret, hmac_header)
      VALUES (
        ${clientId}, ${name}, ${token},
        ${hmacSecret ?? null}, ${hmacHeader}
      )
      RETURNING id, client_id, name, token, hmac_header,
                CASE WHEN hmac_secret IS NOT NULL THEN true ELSE false END as has_hmac,
                active, created_at
    `
    return reply.code(201).send(ep)
  })

  // PATCH /clients/:clientId/endpoints/:id
  fastify.patch('/clients/:clientId/endpoints/:id', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          hmacSecret: { type: 'string', nullable: true },
          hmacHeader: { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { clientId, id } = request.params
    const userId = request.user.sub
    const owned = await assertClientOwnership(fastify, clientId, userId)
    if (!owned && request.user.role !== 'admin') {
      return reply.code(404).send({ error: 'Client not found' })
    }

    const { name, hmacSecret, hmacHeader, active } = request.body
    const updates = {}
    if (name !== undefined) updates.name = name
    if (hmacSecret !== undefined) updates.hmac_secret = hmacSecret
    if (hmacHeader !== undefined) updates.hmac_header = hmacHeader
    if (active !== undefined) updates.active = active

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    const [ep] = await fastify.sql`
      UPDATE endpoints SET ${fastify.sql(updates)}, updated_at = NOW()
      WHERE id = ${id} AND client_id = ${clientId}
      RETURNING id, client_id, name, token, hmac_header,
                CASE WHEN hmac_secret IS NOT NULL THEN true ELSE false END as has_hmac,
                active, created_at
    `
    if (!ep) return reply.code(404).send({ error: 'Endpoint not found' })
    return ep
  })

  // DELETE /clients/:clientId/endpoints/:id
  fastify.delete('/clients/:clientId/endpoints/:id', { preHandler }, async (request, reply) => {
    const { clientId, id } = request.params
    const userId = request.user.sub
    const owned = await assertClientOwnership(fastify, clientId, userId)
    if (!owned && request.user.role !== 'admin') {
      return reply.code(404).send({ error: 'Client not found' })
    }
    const [ep] = await fastify.sql`
      DELETE FROM endpoints WHERE id = ${id} AND client_id = ${clientId} RETURNING id
    `
    if (!ep) return reply.code(404).send({ error: 'Endpoint not found' })
    return { deleted: true }
  })
}
