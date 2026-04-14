import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'

export default fp(async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'dev_secret_change_me',
    sign: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
  })

  // Decorator: authenticate requires valid JWT
  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // Decorator: requireAdmin requires role admin
  fastify.decorate('requireAdmin', async function (request, reply) {
    try {
      await request.jwtVerify()
      if (request.user.role !== 'admin') {
        reply.code(403).send({ error: 'Forbidden' })
      }
    } catch {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  })
})
