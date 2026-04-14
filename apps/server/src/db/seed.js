import 'dotenv/config'
import bcrypt from 'bcryptjs'
import sql from './index.js'

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.ADMIN_PASSWORD || 'changeme'

  const existing = await sql`SELECT id FROM users WHERE email = ${email}`
  if (existing.length > 0) {
    console.log(`Admin user already exists: ${email}`)
    await sql.end()
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await sql`
    INSERT INTO users (email, password_hash, role)
    VALUES (${email}, ${passwordHash}, 'admin')
  `
  console.log(`Admin user created: ${email}`)
  await sql.end()
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
