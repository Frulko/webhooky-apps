import 'dotenv/config'
import { buildApp } from './app.js'

// Fail fast in production if JWT_SECRET is not set
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required in production')
  process.exit(1)
}

const app = await buildApp()

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT) || 3000

try {
  await app.listen({ port, host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
