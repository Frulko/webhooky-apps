import bcrypt from 'bcryptjs'

export default async function authRoutes(fastify) {
  // POST /auth/login
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body
    const [user] = await fastify.sql`
      SELECT id, email, password_hash, role, active
      FROM users WHERE email = ${email}
    `

    if (!user || !user.active) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    })

    const refreshToken = fastify.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    )

    return { token, refreshToken, user: { id: user.id, email: user.email, role: user.role } }
  })

  // POST /auth/refresh
  fastify.post('/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string' } },
      },
    },
  }, async (request, reply) => {
    try {
      const payload = fastify.jwt.verify(request.body.refreshToken)
      if (payload.type !== 'refresh') throw new Error('invalid type')

      const [user] = await fastify.sql`
        SELECT id, email, role, active FROM users WHERE id = ${payload.sub}
      `
      if (!user || !user.active) return reply.code(401).send({ error: 'Unauthorized' })

      const token = fastify.jwt.sign({ sub: user.id, email: user.email, role: user.role })
      return { token }
    } catch {
      return reply.code(401).send({ error: 'Invalid refresh token' })
    }
  })

  // GET /auth/me
  fastify.get('/auth/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const [user] = await fastify.sql`
      SELECT id, email, role, created_at FROM users WHERE id = ${request.user.sub}
    `
    return user
  })
}
