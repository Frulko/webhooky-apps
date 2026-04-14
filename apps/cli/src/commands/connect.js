import WebSocket from 'ws'
import chalk from 'chalk'

export async function connect(options) {
  const { token, forward, key, server } = options

  const wsUrl = server
    .replace(/^http/, 'ws')
    .replace(/\/$/, '')
  const fullUrl = `${wsUrl}/ws/${token}?key=${key}`

  console.log(chalk.bold('\n  webhook-catcher'))
  console.log(chalk.dim('  ─────────────────────────────────────'))
  console.log(`  ${chalk.dim('Endpoint token:')} ${chalk.cyan(token)}`)
  console.log(`  ${chalk.dim('Forwarding to:')} ${chalk.green(forward)}`)
  console.log(`  ${chalk.dim('Server:')}        ${chalk.dim(server)}`)
  console.log(chalk.dim('  ─────────────────────────────────────\n'))

  let ws
  let reconnectDelay = 1000
  let pingInterval

  function connect() {
    ws = new WebSocket(fullUrl)

    ws.on('open', () => {
      console.log(chalk.green('  ✓ Connected'))
      reconnectDelay = 1000

      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)
    })

    ws.on('message', async (data) => {
      let msg
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }

      if (msg.type === 'pong') return
      if (msg.type === 'error') {
        console.error(chalk.red(`  ✗ Error: ${msg.message}`))
        process.exit(1)
      }

      if (msg.type === 'webhook' || msg.type === 'replay') {
        const wh = msg.webhook
        const tag = msg.type === 'replay' ? chalk.yellow(' [replay]') : ''
        const ts = new Date().toLocaleTimeString()

        console.log(
          `  ${chalk.dim(ts)} ${chalk.blue(wh.method ?? 'POST')}${tag} ${chalk.dim('→')} ${forward}`
        )

        try {
          const body = typeof wh.body === 'object' ? JSON.stringify(wh.body) : wh.body
          const contentType = wh.headers?.['content-type'] ?? 'application/json'

          const res = await fetch(forward, {
            method: wh.method ?? 'POST',
            headers: {
              'content-type': contentType,
              'x-webhook-id': wh.id,
              'x-forwarded-by': 'webhook-catcher',
            },
            body,
            signal: AbortSignal.timeout(10000),
          })

          const color = res.ok ? chalk.green : chalk.red
          console.log(`          ${color(`→ ${res.status} ${res.statusText}`)}`)
        } catch (err) {
          console.log(`          ${chalk.red(`✗ ${err.message}`)}`)
        }
      }
    })

    ws.on('close', (code) => {
      clearInterval(pingInterval)
      if (code === 1008) {
        console.error(chalk.red('  ✗ Authentication failed — check your token and API key'))
        process.exit(1)
      }
      console.log(chalk.dim(`  ↻ Disconnected. Reconnecting in ${reconnectDelay / 1000}s…`))
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
        connect()
      }, reconnectDelay)
    })

    ws.on('error', (err) => {
      console.error(chalk.red(`  ✗ ${err.message}`))
    })
  }

  connect()

  process.on('SIGINT', () => {
    console.log(chalk.dim('\n  Disconnecting…'))
    ws?.close()
    process.exit(0)
  })
}
