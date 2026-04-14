import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { buildApp } from '../app.js'

/**
 * Builds the app with logging disabled for tests.
 * Call app.close() in after() to release DB connections.
 */
export async function createApp() {
  const app = await buildApp({ logger: false, serveStatic: false })
  await app.ready()
  return app
}

/**
 * Insert a test user and return their credentials + JWT token.
 */
export async function seedUser(app, {
  email = 'test@example.com',
  password = 'testpassword',
  role = 'user',
} = {}) {
  const hash = await bcrypt.hash(password, 10)

  const [user] = await app.sql`
    INSERT INTO users (email, password_hash, role, active)
    VALUES (${email}, ${hash}, ${role}, true)
    ON CONFLICT (email) DO UPDATE SET password_hash = ${hash}, active = true
    RETURNING id, email, role
  `

  const token = app.jwt.sign({ sub: user.id, email: user.email, role: user.role })
  const refreshToken = app.jwt.sign(
    { sub: user.id, type: 'refresh' },
    { expiresIn: '7d' }
  )

  return { user, token, refreshToken, password }
}

/**
 * Clean up test data inserted by a test.
 */
export async function cleanupUsers(app, emails) {
  await app.sql`DELETE FROM users WHERE email = ANY(${emails})`
}
