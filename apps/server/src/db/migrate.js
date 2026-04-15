import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sql from './index.js'

const __dir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dir, 'migrations')

export async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  const applied = new Set(
    (await sql`SELECT version FROM schema_migrations`).map((r) => r.version)
  )

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    if (applied.has(file)) continue
    console.log(`Applying migration: ${file}`)
    const content = await readFile(join(migrationsDir, file), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(content)
      await tx`INSERT INTO schema_migrations (version) VALUES (${file})`
    })
    console.log(`  ✓ ${file}`)
  }

  console.log('Migrations done.')
}

async function migrateAndClose() {
  await migrate()
  await sql.end()
}

// Run directly (node migrate.js)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrateAndClose().catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
}
