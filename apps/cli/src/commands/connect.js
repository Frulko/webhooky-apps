import WebSocket from 'ws'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { load, save, merge } from '../config.js'
import { listClients, listEndpoints, requestConnectToken, listMissedWebhooks } from '../api.js'
import { select, input } from '@inquirer/prompts'
const MAX_RECONNECTS = 10

// Disable TLS verification for forward targets — self-signed certs, Valet .test, localhost HTTPS.
// This only affects the CLI process, not the server.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization', 'content-length',
])

let debugMode = false
export function setDebug(val) { debugMode = val }

function dbg(...args) {
  if (!debugMode) return
  console.log(chalk.dim('  [debug]'), ...args)
}

async function forwardWebhook(wh, forward, tag = '') {
  const ts = new Date().toLocaleTimeString()
  console.log(`  ${chalk.dim(ts)} ${chalk.blue(wh.method ?? 'POST')}${tag} ${chalk.dim('→')} ${forward}`)

  try {
    const body = typeof wh.body === 'object' ? JSON.stringify(wh.body) : (wh.body || undefined)
    const hasBody = body !== undefined && body !== null && body !== ''

    // Append query params to forward URL
    let forwardUrl = forward
    const qp = wh.query_params ?? wh.queryParams
    if (qp && typeof qp === 'object' && Object.keys(qp).length > 0) {
      const u = new URL(forward)
      for (const [k, v] of Object.entries(qp)) u.searchParams.set(k, v)
      forwardUrl = u.toString()
    }

    // Forward original headers, strip hop-by-hop
    const headers = wh.headers ?? {}
    const parsedHeaders = typeof headers === 'string' ? JSON.parse(headers) : headers
    const forwardHeaders = {}
    for (const [k, v] of Object.entries(parsedHeaders)) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) forwardHeaders[k] = v
    }
    forwardHeaders['x-webhook-id'] = wh.id
    forwardHeaders['x-forwarded-by'] = 'hooky'

    dbg(`→ ${wh.method ?? 'POST'} ${forwardUrl}`)
    dbg('headers sent:', JSON.stringify(forwardHeaders, null, 4))
    if (hasBody) dbg('body:', body?.slice(0, 500))
    dbg(`NODE_TLS_REJECT_UNAUTHORIZED=${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`)

    const res = await fetch(forwardUrl, {
      method: wh.method ?? 'POST',
      headers: forwardHeaders,
      body: hasBody ? body : undefined,
      signal: AbortSignal.timeout(10000),
    })

    dbg(`← ${res.status} ${res.statusText}`)
    if (debugMode) {
      const resHeaders = {}
      res.headers.forEach((v, k) => { resHeaders[k] = v })
      dbg('response headers:', JSON.stringify(resHeaders, null, 4))
    }

    const color = res.ok ? chalk.green : chalk.red
    console.log(`          ${color(`→ ${res.status} ${res.statusText}`)}`)
  } catch (err) {
    console.log(`          ${chalk.red(`✗ ${err.message}`)}`)
    if (debugMode) {
      dbg(`error code:  ${err.code ?? '(none)'}`)
      dbg(`error cause: ${err.cause?.message ?? err.cause ?? '(none)'}`)
      dbg('stack:', err.stack)
    }
  }
}

async function pickEndpoint(cfg) {
  let clients
  try {
    clients = await listClients(cfg.server, cfg.auth.token)
  } catch {
    console.error(chalk.red('  ✗ Could not fetch clients — using stored config'))
    return null
  }

  if (!clients.length) return null

  let chosenClient
  if (clients.length === 1) {
    chosenClient = clients[0]
  } else {
    try {
      const id = await select({
        message: 'Select a client',
        default: cfg.client?.id,
        choices: clients.map((c) => ({
          name: `${c.name}${c.id === cfg.client?.id ? chalk.dim(' ← current') : ''}`,
          value: c.id,
        })),
      })
      chosenClient = clients.find((c) => c.id === id)
    } catch { return null }
  }

  let endpoints
  try {
    endpoints = await listEndpoints(cfg.server, cfg.auth.token, chosenClient.id)
  } catch {
    return null
  }

  if (!endpoints.length) {
    console.log(chalk.yellow('  No endpoints on this client.'))
    return null
  }

  let chosenEndpoint
  if (endpoints.length === 1) {
    chosenEndpoint = endpoints[0]
  } else {
    try {
      const id = await select({
        message: 'Select an endpoint',
        default: cfg.endpoint?.id,
        choices: endpoints.map((e) => ({
          name: `${e.name}${e.active ? '' : chalk.dim(' (inactive)')}${e.id === cfg.endpoint?.id ? chalk.dim(' ← current') : ''}`,
          value: e.id,
          disabled: !e.active ? '(inactive)' : false,
        })),
      })
      chosenEndpoint = endpoints.find((e) => e.id === id)
    } catch { return null }
  }

  let forward
  try {
    forward = await input({
      message: 'Local URL to forward webhooks to',
      default: cfg.forward ?? 'http://localhost:8080/webhook',
      validate: (v) => { try { new URL(v); return true } catch { return 'Enter a valid URL' } },
    })
  } catch { return null }

  // Persist the choice
  save({
    ...cfg,
    client: { id: chosenClient.id, name: chosenClient.name, apiKey: chosenClient.apiKey },
    endpoint: { id: chosenEndpoint.id, name: chosenEndpoint.name, token: chosenEndpoint.token, hasHmac: chosenEndpoint.hasHmac },
    forward,
  })

  return { client: chosenClient, endpoint: chosenEndpoint, forward }
}

export async function connect(flags) {
  if (flags.debug) setDebug(true)

  let cfg = load()
  const opts = merge(cfg, flags)

  // Flags bypass all prompts
  const tokenFlag = flags.token
  const keyFlag = flags.key
  const forwardFlag = flags.forward

  let token = tokenFlag ?? cfg?.endpoint?.token
  let key = keyFlag ?? cfg?.client?.apiKey
  let forward = forwardFlag ?? opts.forward
  const server = opts.server

  // No flags — interactive selection if we have auth
  if (!tokenFlag && !keyFlag && cfg?.auth?.token) {
    if (cfg.endpoint && cfg.client) {
      console.log(chalk.bold('\n  hooky'))
      console.log(chalk.dim('  ─────────────────────────────────────'))
      console.log(`  ${chalk.dim('Client:')}   ${chalk.cyan(cfg.client.name)}`)
      console.log(`  ${chalk.dim('Endpoint:')} ${chalk.cyan(cfg.endpoint.name)}`)
      console.log(`  ${chalk.dim('Forward:')}  ${chalk.green(forward ?? '(not set)')}`)
      console.log(chalk.dim('  ─────────────────────────────────────'))

      let useCurrent = true
      try {
        useCurrent = await confirm({ message: 'Connect to this endpoint?', default: true })
      } catch { process.exit(0) }

      if (!useCurrent) {
        const picked = await pickEndpoint(cfg)
        if (picked) {
          cfg = load() // reload after save in pickEndpoint
          token = cfg.endpoint.token
          key = cfg.client.apiKey
          forward = cfg.forward
        }
      }
    } else {
      // Auth exists but no endpoint selected yet — go straight to picker
      console.log(chalk.bold('\n  hooky — select endpoint'))
      console.log(chalk.dim('  ─────────────────────────────────────\n'))
      const picked = await pickEndpoint(cfg)
      if (picked) {
        cfg = load()
        token = cfg.endpoint.token
        key = cfg.client.apiKey
        forward = cfg.forward
      }
    }
  }

  const missing = []
  if (!token) missing.push('endpoint token (--token)')
  if (!key) missing.push('API key (--key)')
  if (!forward) missing.push('forward URL (--forward)')

  if (missing.length) {
    console.error(chalk.red(`\n  Missing: ${missing.join(', ')}`))
    console.error(chalk.dim('  Run `hooky init` to configure, or pass the flags directly.\n'))
    process.exit(1)
  }

  const wsBase = server.replace(/^http/, 'ws').replace(/\/$/, '')

  console.log(chalk.bold('\n  hooky'))
  console.log(chalk.dim('  ─────────────────────────────────────'))
  console.log(`  ${chalk.dim('Endpoint:')}      ${chalk.cyan(cfg?.endpoint?.name ?? token.slice(0, 8) + '…')}`)
  console.log(`  ${chalk.dim('Forwarding to:')} ${chalk.green(forward)}`)
  console.log(`  ${chalk.dim('Server:')}        ${chalk.dim(server)}`)
  if (debugMode) console.log(`  ${chalk.dim('Debug:')}         ${chalk.yellow('ON')}`)
  console.log(chalk.dim('  ─────────────────────────────────────\n'))

  let ws
  let reconnectDelay = 1000
  let reconnectAttempts = 0
  let pingInterval
  let disconnectedAt = null

  async function doConnect() {
    let connectToken
    try {
      connectToken = await requestConnectToken(cfg, token, key)
    } catch (err) {
      console.error(chalk.red(`  ✗ ${err.message}`))
      process.exit(1)
    }

    const fullUrl = `${wsBase}/ws/${token}?t=${connectToken}`
    ws = new WebSocket(fullUrl)

    ws.on('open', async () => {
      console.log(chalk.green('  ✓ Connected'))

      // Catch up on webhooks missed during the disconnection window
      if (disconnectedAt && cfg?.endpoint?.id && cfg?.auth?.token) {
        try {
          const missed = await listMissedWebhooks(cfg, cfg.endpoint.id, disconnectedAt)
          if (missed.length > 0) {
            console.log(chalk.yellow(`\n  ↻ ${missed.length} webhook(s) received while disconnected — replaying…`))
            for (const wh of missed) {
              await forwardWebhook(wh, forward, chalk.yellow(' [missed]'))
            }
            console.log()
          }
        } catch (err) {
          console.log(chalk.dim(`  ↻ Could not fetch missed webhooks: ${err.message}`))
        }
        disconnectedAt = null
      }

      reconnectDelay = 1000
      reconnectAttempts = 0
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, 30000)
    })

    ws.on('message', async (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }

      if (msg.type === 'pong') return
      if (msg.type === 'error') {
        console.error(chalk.red(`  ✗ Error: ${msg.message}`))
        process.exit(1)
      }

      if (msg.type === 'webhook' || msg.type === 'replay') {
        const tag = msg.type === 'replay' ? chalk.yellow(' [replay]') : ''
        await forwardWebhook(msg.webhook, forward, tag)
      }
    })

    ws.on('close', (code) => {
      clearInterval(pingInterval)

      if (code === 1008) {
        console.error(chalk.red('  ✗ Authentication failed — check your token and API key'))
        process.exit(1)
      }

      disconnectedAt = new Date().toISOString()
      reconnectAttempts++

      if (reconnectAttempts > MAX_RECONNECTS) {
        console.error(chalk.red(`\n  ✗ Failed to reconnect after ${MAX_RECONNECTS} attempts.`))
        console.error(chalk.dim('  Run `hooky connect` to retry.\n'))
        process.exit(1)
      }

      console.log(chalk.dim(
        `  ↻ Disconnected (attempt ${reconnectAttempts}/${MAX_RECONNECTS}). Reconnecting in ${reconnectDelay / 1000}s…`
      ))
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
        doConnect().catch((err) => {
          console.error(chalk.red(`  ✗ Reconnect failed: ${err.message}`))
          process.exit(1)
        })
      }, reconnectDelay)
    })

    ws.on('error', (err) => {
      console.error(chalk.red(`  ✗ ${err.message}`))
    })
  }

  doConnect().catch((err) => {
    console.error(chalk.red(`  ✗ ${err.message}`))
    process.exit(1)
  })

  process.on('SIGINT', () => {
    console.log(chalk.dim('\n  Disconnecting…'))
    ws?.close()
    process.exit(0)
  })
}
