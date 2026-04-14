import chalk from 'chalk'
import { load, merge } from '../config.js'
import { authedFetch } from '../api.js'

export async function replay(flags) {
  const cfg = load()
  const opts = merge(cfg, flags)

  const forward = flags.forward ?? opts.forward
  const { id } = flags

  if (!cfg?.auth?.token) {
    console.error(chalk.red('\n  Not authenticated. Run `hooky login` or `hooky init`.\n'))
    process.exit(1)
  }

  if (!forward) {
    console.error(chalk.red('\n  Missing forward URL. Pass --forward or run `hooky init`.\n'))
    process.exit(1)
  }

  console.log(chalk.bold('\n  Replaying webhook'))
  console.log(chalk.dim('  ─────────────────────────────────────'))
  console.log(`  ${chalk.dim('Webhook ID:')}    ${chalk.cyan(id)}`)
  console.log(`  ${chalk.dim('Forwarding to:')} ${chalk.green(forward)}`)
  console.log(chalk.dim('  ─────────────────────────────────────\n'))

  let wh
  try {
    const res = await authedFetch(cfg, `/webhooks/${id}`)
    if (!res.ok) throw new Error(`Server returned ${res.status}`)
    wh = await res.json()
  } catch (err) {
    console.error(chalk.red(`  ✗ Failed to fetch webhook: ${err.message}`))
    process.exit(1)
  }

  const parsedBody = typeof wh.bodyParsed === 'string'
    ? JSON.parse(wh.bodyParsed)
    : wh.bodyParsed

  const body = parsedBody ? JSON.stringify(parsedBody) : wh.body

  const parsedHeaders = typeof wh.headers === 'string'
    ? JSON.parse(wh.headers)
    : (wh.headers ?? {})

  const contentType = parsedHeaders['content-type'] ?? 'application/json'

  try {
    const res = await fetch(forward, {
      method: wh.method ?? 'POST',
      headers: {
        'content-type': contentType,
        'x-webhook-id': wh.id,
        'x-forwarded-by': 'hooky',
        'x-webhook-replay': 'true',
      },
      body,
      signal: AbortSignal.timeout(10000),
    })

    const color = res.ok ? chalk.green : chalk.red
    console.log(`  ${color(`${res.status} ${res.statusText}`)}`)
    if (res.ok) {
      console.log(chalk.green('  ✓ Replay successful'))
    }
  } catch (err) {
    console.error(chalk.red(`  ✗ ${err.message}`))
    process.exit(1)
  }
}
