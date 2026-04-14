import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

import dbPlugin from './plugins/db.js'
import authPlugin from './plugins/auth.js'

import authRoutes from './routes/auth.js'
import webhookRoutes from './routes/webhooks.js'
import replayRoutes from './routes/replay.js'
import wsRoutes from './routes/ws.js'
import adminUsersRoutes from './routes/admin/users.js'
import clientsRoutes from './routes/users/clients.js'
import endpointsRoutes from './routes/users/endpoints.js'

const __dir = dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

// Plugins
await fastify.register(fastifyCors, {
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
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

// Routes
await fastify.register(authRoutes)
await fastify.register(webhookRoutes)
await fastify.register(replayRoutes)
await fastify.register(wsRoutes)
await fastify.register(adminUsersRoutes)
await fastify.register(clientsRoutes)
await fastify.register(endpointsRoutes)

// Serve built frontend (production)
const webDist = join(__dir, '../../web/dist')
if (existsSync(webDist)) {
  await fastify.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: false,
  })

  fastify.setNotFoundHandler((req, reply) => {
    if (!req.url.startsWith('/hook/') && !req.url.startsWith('/ws/') && !req.url.startsWith('/auth')) {
      reply.sendFile('index.html')
    } else {
      reply.code(404).send({ error: 'Not found' })
    }
  })
}

// Health check
fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT) || 3000

try {
  await fastify.listen({ port, host })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
