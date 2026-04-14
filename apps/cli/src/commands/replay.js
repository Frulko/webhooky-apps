import chalk from 'chalk'

export async function replay(options) {
  const { id, forward, key, server } = options

  console.log(chalk.bold('\n  Replaying webhook'))
  console.log(chalk.dim('  ─────────────────────────────────────'))
  console.log(`  ${chalk.dim('Webhook ID:')}    ${chalk.cyan(id)}`)
  console.log(`  ${chalk.dim('Forwarding to:')} ${chalk.green(forward)}`)
  console.log(chalk.dim('  ─────────────────────────────────────\n'))

  // Fetch the webhook from server
  let wh
  try {
    const res = await fetch(`${server}/webhooks/${id}`, {
      headers: {
        'x-api-key': key,
        authorization: `Bearer ${key}`,
      },
    })
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`)
    }
    wh = await res.json()
  } catch (err) {
    console.error(chalk.red(`  ✗ Failed to fetch webhook: ${err.message}`))
    process.exit(1)
  }

  const body = wh.body_parsed ? JSON.stringify(wh.body_parsed) : wh.body
  const contentType = wh.headers?.['content-type'] ?? 'application/json'

  try {
    const res = await fetch(forward, {
      method: wh.method ?? 'POST',
      headers: {
        'content-type': contentType,
        'x-webhook-id': wh.id,
        'x-forwarded-by': 'webhook-catcher',
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
