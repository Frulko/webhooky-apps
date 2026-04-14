import bcrypt from 'bcryptjs'

export default async function adminUsersRoutes(fastify) {
  const preHandler = [fastify.requireAdmin]

  // GET /admin/users
  fastify.get('/admin/users', { preHandler }, async () => {
    return fastify.sql`
      SELECT id, email, role, active, created_at
      FROM users ORDER BY created_at DESC
    `
  })

  // POST /admin/users
  fastify.post('/admin/users', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: ['admin', 'user'], default: 'user' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password, role = 'user' } = request.body
    const passwordHash = await bcrypt.hash(password, 12)

    const [existing] = await fastify.sql`SELECT id FROM users WHERE email = ${email}`
    if (existing) return reply.code(409).send({ error: 'Email already in use' })

    const [user] = await fastify.sql`
      INSERT INTO users (email, password_hash, role)
      VALUES (${email}, ${passwordHash}, ${role})
      RETURNING id, email, role, active, created_at
    `
    return reply.code(201).send(user)
  })

  // PATCH /admin/users/:id
  fastify.patch('/admin/users/:id', {
    preHandler,
    schema: {
      body: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['admin', 'user'] },
          active: { type: 'boolean' },
          password: { type: 'string', minLength: 8 },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params
    const { role, active, password } = request.body

    const updates = {}
    if (role !== undefined) updates.role = role
    if (active !== undefined) updates.active = active
    if (password !== undefined) updates.password_hash = await bcrypt.hash(password, 12)

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ error: 'No fields to update' })
    }

    const [user] = await fastify.sql`
      UPDATE users SET ${fastify.sql(updates)}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, email, role, active, created_at
    `
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return user
  })

  // DELETE /admin/users/:id
  fastify.delete('/admin/users/:id', { preHandler }, async (request, reply) => {
    const { id } = request.params
    if (id === request.user.sub) {
      return reply.code(400).send({ error: 'Cannot delete yourself' })
    }
    const [user] = await fastify.sql`
      DELETE FROM users WHERE id = ${id} RETURNING id
    `
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return { deleted: true }
  })
}
