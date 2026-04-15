import 'dotenv/config'
import { buildApp } from './app.js'
import { migrate } from './db/migrate.js'
import sql from './db/index.js'

// Fail fast in production if JWT_SECRET is not set
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production')
  process.exit(1)
}

await migrate()

// Mark sessions that were open when the previous server instance died as disconnected.
// On a clean shutdown the ws.on('close') handler does this; on a crash/restart it doesn't.
const { count } = await sql`
  UPDATE ws_sessions SET disconnected_at = NOW()
  WHERE disconnected_at IS NULL
  RETURNING count(*)::int AS count
`.then((rows) => rows[0] ?? { count: 0 })
if (count > 0) console.log(`Cleaned up ${count} stale WS session(s) from previous instance.`)

const app = await buildApp()

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT) || 3000

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
