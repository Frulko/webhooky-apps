import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import fastifyRateLimit from '@fastify/rate-limit'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

import dbPlugin from './plugins/db.js'
import authPlugin from './plugins/auth.js'

import authRoutes from './routes/auth.js'
import hookRoutes from './routes/hook.js'
import webhookRoutes from './routes/webhooks.js'
import replayRoutes from './routes/replay.js'
import deliveryRoutes from './routes/deliveries.js'
import wsRoutes from './routes/ws.js'
import wsTokenRoutes from './routes/ws-token.js'
import connectionsRoutes from './routes/connections.js'
import adminUsersRoutes from './routes/admin/users.js'
import clientsRoutes from './routes/users/clients.js'
import endpointsRoutes from './routes/users/endpoints.js'

const __dir = dirname(fileURLToPath(import.meta.url))

/**
 * Build and return the configured Fastify instance.
 * Does NOT call listen() — that's the caller's responsibility.
 *
 * @param {{ logger?: boolean|object, serveStatic?: boolean }} opts
 */
export async function buildApp({ logger = true, serveStatic = true } = {}) {
  const fastify = Fastify({
    logger: logger === true
      ? {
          level: process.env.LOG_LEVEL || 'info',
          transport: process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty' }
            : undefined,
        }
      : logger,
    bodyLimit: 524_288,
  })

  await fastify.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })

  await fastify.register(fastifyRateLimit, {
    global: false,
    errorResponseBuilder: () => ({ error: 'Too many requests, please try again later.' }),
  })

  await fastify.register(fastifyWebsocket)
  await fastify.register(dbPlugin)
  await fastify.register(authPlugin)

  // Raw body support for HMAC verification
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body
    try {
      done(null, JSON.parse(body.toString()))
    } catch (err) {
      done(err)
    }
  })

  fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body
    done(null, body.toString())
  })

  // Public routes — no prefix
  await fastify.register(hookRoutes)
  await fastify.register(wsRoutes)

  // Authenticated API routes
  await fastify.register(authRoutes, { prefix: '/api' })
  await fastify.register(webhookRoutes, { prefix: '/api' })
  await fastify.register(replayRoutes, { prefix: '/api' })
  await fastify.register(deliveryRoutes, { prefix: '/api' })
  await fastify.register(connectionsRoutes, { prefix: '/api' })
  await fastify.register(wsTokenRoutes, { prefix: '/api' })
  await fastify.register(adminUsersRoutes, { prefix: '/api' })
  await fastify.register(clientsRoutes, { prefix: '/api' })
  await fastify.register(endpointsRoutes, { prefix: '/api' })

  fastify.get('/api/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  if (serveStatic) {
    const webDist = existsSync(join(__dir, '../dist'))
      ? join(__dir, '../dist')
      : join(__dir, '../../web/dist')

    if (existsSync(webDist)) {
      await fastify.register(fastifyStatic, { root: webDist, prefix: '/' })

      fastify.setNotFoundHandler((req, reply) => {
        const url = req.url.split('?')[0]
        if (url.startsWith('/api/') || url.startsWith('/hook/') || url.startsWith('/ws/')) {
          return reply.code(404).send({ error: 'Not found' })
        }
        reply.sendFile('index.html')
      })
    }
  }

  return fastify
}
