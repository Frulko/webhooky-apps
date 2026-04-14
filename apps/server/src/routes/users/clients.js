import { nanoid } from 'nanoid'

export default async function clientsRoutes(fastify) {
  const preHandler = [fastify.authenticate]

  function ownerId(request) {
    // Admins can pass ?userId=xxx, users are scoped to themselves
    if (request.user.role === 'admin' && request.query.userId) {
      return request.query.userId
    }
    return request.user.sub
  }

  // GET /clients
  fastify.get('/clients', { preHandler }, async (request) => {
    const userId = ownerId(request)
    return fastify.sql`
      SELECT id, user_id, name, description, api_key, active, created_at
      FROM clients WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `
  })

  // GET /clients/:id
  fastify.get('/clients/:id', { preHandler }, async (request, reply) => {
    const { id } = request.params
    const userId = ownerId(request)
    const [client] = await fastify.sql`
      SELECT id, user_id, name, description, api_key, active, created_at
      FROM clients WHERE id = ${id} AND user_id = ${userId}
    `
    if (!client) return reply.code(404).send({ error: 'Client not found' })
    return client
  })

  // POST /clients
  fastify.post('/clients', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
        },
      },
    },
  }, async (request, reply) => {
    const { name, description } = request.body
    const userId = ownerId(request)
    const apiKey = `wc_${nanoid(32)}`

    const [client] = await fastify.sql`
      INSERT INTO clients (user_id, name, description, api_key)
      VALUES (${userId}, ${name}, ${description ?? null}, ${apiKey})
      RETURNING id, user_id, name, description, api_key, active, created_at
    `
    return reply.code(201).send(client)
  })

  // PATCH /clients/:id
  fastify.patch('/clients/:id', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          active: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const userId = ownerId(request)
    const { name, description, active } = request.body

    const updates = {}
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (active !== undefined) updates.active = active

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    const [client] = await fastify.sql`
      UPDATE clients SET ${fastify.sql(updates)}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id, user_id, name, description, api_key, active, created_at
    `
    if (!client) return reply.code(404).send({ error: 'Client not found' })
    return client
  })

  // DELETE /clients/:id
  fastify.delete('/clients/:id', { preHandler }, async (request, reply) => {
    const { id } = request.params
    const userId = ownerId(request)
    const [client] = await fastify.sql`
      DELETE FROM clients WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `
    if (!client) return reply.code(404).send({ error: 'Client not found' })
    return { deleted: true }
  })

  // POST /clients/:id/rotate-key — generate a new API key
  fastify.post('/clients/:id/rotate-key', { preHandler }, async (request, reply) => {
    const { id } = request.params
    const userId = ownerId(request)
    const apiKey = `wc_${nanoid(32)}`

    const [client] = await fastify.sql`
      UPDATE clients SET api_key = ${apiKey}, updated_at = NOW()
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id, api_key
    `
    if (!client) return reply.code(404).send({ error: 'Client not found' })
    return client
  })
}
