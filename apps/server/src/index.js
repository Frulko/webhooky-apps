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
import hookRoutes from './routes/hook.js'
import webhookRoutes from './routes/webhooks.js'
import replayRoutes from './routes/replay.js'
import wsRoutes from './routes/ws.js'
import connectionsRoutes from './routes/connections.js'
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

// Public routes — no prefix
await fastify.register(hookRoutes)   // POST /hook/:token
await fastify.register(wsRoutes)     // WS  /ws/:token

// Authenticated API routes — all under /api
await fastify.register(authRoutes, { prefix: '/api' })
await fastify.register(webhookRoutes, { prefix: '/api' })
await fastify.register(replayRoutes, { prefix: '/api' })
await fastify.register(connectionsRoutes, { prefix: '/api' })
await fastify.register(adminUsersRoutes, { prefix: '/api' })
await fastify.register(clientsRoutes, { prefix: '/api' })
await fastify.register(endpointsRoutes, { prefix: '/api' })

// Health check
fastify.get('/api/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// Serve built frontend (production)
// In Docker: dist/ is at apps/server/dist (copied from web build)
// In dev: dist/ is at apps/web/dist (after pnpm --filter web build)
const webDist = existsSync(join(__dir, '../dist'))
  ? join(__dir, '../dist')
  : join(__dir, '../../web/dist')
if (existsSync(webDist)) {
  await fastify.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
  })

  // SPA fallback — serve index.html for all non-API, non-hook, non-ws routes
  fastify.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0]
    if (url.startsWith('/api/') || url.startsWith('/hook/') || url.startsWith('/ws/')) {
      return reply.code(404).send({ error: 'Not found' })
    }
    reply.sendFile('index.html')
  })
}

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT) || 3000

try {
  await fastify.listen({ port, host })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
