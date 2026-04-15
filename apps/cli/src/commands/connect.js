import WebSocket from 'ws'
import chalk from 'chalk'
import { confirm } from '@inquirer/prompts'
import { spawnSync } from 'node:child_process'
import { platform } from 'node:os'
import { load, save, merge } from '../config.js'
import { listClients, listEndpoints, requestConnectToken, listMissedWebhooks, reportDelivery } from '../api.js'
import { select, input } from '@inquirer/prompts'
const MAX_RECONNECTS = 10

// Disable TLS verification for forward targets — self-signed certs, Valet .test, localhost HTTPS.
// This only affects the CLI process, not the server.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const HOP_BY_HOP = new Set([
  'host', 'connection', 'keep-alive', 'transfer-encoding',
  'te', 'trailer', 'upgrade', 'proxy-authorization', 'content-length',
])

function buildCurl(wh, targetUrl) {
  const method = wh.method ?? 'POST'
  const headers = wh.headers ?? {}
  const parsedHeaders = typeof headers === 'string' ? JSON.parse(headers) : headers
  const body = typeof wh.body === 'object' ? JSON.stringify(wh.body) : (wh.body || '')

  const parts = [`curl -X ${method} '${targetUrl}'`]
  for (const [k, v] of Object.entries(parsedHeaders)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) {
      parts.push(`  -H '${k}: ${String(v).replace(/'/g, "'\\''")}'`)
    }
  }
  if (body) parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`)
  return parts.join(' \\\n')
}

function copyToClipboard(text) {
  try {
    const buf = Buffer.from(text)
    const plat = platform()
    if (plat === 'darwin') {
      spawnSync('pbcopy', { input: buf })
    } else if (plat === 'linux') {
      const r = spawnSync('xclip', ['-selection', 'clipboard'], { input: buf })
      if (r.error) spawnSync('xsel', ['--clipboard', '--input'], { input: buf })
    } else if (plat === 'win32') {
      spawnSync('clip', { input: buf, shell: true })
    }
    return true
  } catch {
    return false
  }
}

let debugMode = false
export function setDebug(val) { debugMode = val }

function dbg(...args) {
  if (!debugMode) return
  console.log(chalk.dim('  [debug]'), ...args)
}

// Returns the curl string so the caller can offer clipboard copy on demand.
async function forwardWebhook(wh, forward, tag = '', opts = {}) {
  const ts = new Date().toLocaleTimeString()
  console.log(`  ${chalk.dim(ts)} ${chalk.blue(wh.method ?? 'POST')}${tag} ${chalk.dim('→')} ${forward}`)

  const curl = buildCurl(wh, forward)
  const startMs = Date.now()

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

    const durationMs = Date.now() - startMs

    dbg(`← ${res.status} ${res.statusText} (${durationMs}ms)`)

    const resHeaders = {}
    res.headers.forEach((v, k) => { resHeaders[k] = v })
    if (debugMode) dbg('response headers:', JSON.stringify(resHeaders, null, 4))

    let responseBody
    try {
      const text = await res.text()
      responseBody = text.slice(0, 10_000) // cap at 10 KB
    } catch { /* ignore */ }

    const color = res.ok ? chalk.green : chalk.red
    console.log(`          ${color(`→ ${res.status} ${res.statusText}`)} ${chalk.dim(`${durationMs}ms`)}`)

    if (opts.cfg?.reportDeliveries && wh.id) {
      reportDelivery(opts.cfg, wh.id, {
        sessionId: opts.sessionId ?? null,
        statusCode: res.status,
        responseHeaders: resHeaders,
        responseBody,
        durationMs,
      })
    }
  } catch (err) {
    const durationMs = Date.now() - startMs

    // Unwrap cause chain — Node fetch wraps the real error in err.cause
    const causes = []
    let cur = err
    while (cur) {
      causes.push(cur)
      cur = cur.cause
    }
    const root = causes[causes.length - 1]
    const detail = root !== err ? ` (${root.message})` : ''
    console.log(`          ${chalk.red(`✗ ${err.message}${detail}`)}`)
    if (debugMode) {
      causes.forEach((c, i) => {
        dbg(`cause[${i}] ${c.code ? chalk.yellow(c.code) + ' ' : ''}${c.message}`)
      })
      dbg('stack:', err.stack)
    }

    if (opts.cfg?.reportDeliveries && wh.id) {
      reportDelivery(opts.cfg, wh.id, {
        sessionId: opts.sessionId ?? null,
        durationMs,
        errorMsg: `${err.message}${detail}`,
      })
    }
  }

  return curl
}

// Ask once (when key is missing from config) then persist the answer.
async function askFirstRunOptions(cfg) {
  const needsReport = cfg?.reportDeliveries === undefined
  if (!needsReport) return cfg

  console.log(chalk.dim('\n  ─────────────────────────────────────'))
  console.log(`  ${chalk.bold('First-time option')} ${chalk.dim('(saved to config, asked once)')}`)

  let reportDeliveries = false
  try {
    reportDeliveries = await confirm({
      message: 'Send delivery reports to the dashboard? (response codes, duration)',
      default: true,
    })
  } catch { /* Ctrl-C → keep default */ }

  const updated = { ...cfg, reportDeliveries }
  save(updated)
  console.log(chalk.dim('  ─────────────────────────────────────\n'))
  return updated
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
  // Ask once for options that haven't been configured yet
  if (cfg?.auth?.token) cfg = await askFirstRunOptions(cfg)
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
  let sessionId = null
  const curlSlots = new Array(9).fill(null) // rolling buffer, slots 0-8 → keys 1-9
  let nextSlot = 0
  let reconnectDelay = 1000
  let reconnectAttempts = 0
  let pingInterval
  let disconnectedAt = null

  // label positions — { row, slot } — row is always viewport-relative (updated on scroll)
  const labelPositions = []
  let cursorPosResolve = null
  let stdinReady = false

  function disableMouse() {
    if (process.stdout.isTTY) process.stdout.write('\x1b[?1000l\x1b[?1006l')
  }

  // Async cursor row query — resolves via stdin response ESC[row;colR
  function queryCursorRow() {
    if (!stdinReady) return Promise.resolve(null)
    return new Promise((resolve) => {
      cursorPosResolve = resolve
      process.stdout.write('\x1b[6n')
      setTimeout(() => {
        if (cursorPosResolve === resolve) { cursorPosResolve = null; resolve(null) }
      }, 100)
    })
  }

  // Print the clickable hint, capture its viewport row, push to labelPositions.
  async function printHint(label, slot) {
    if (!process.stdin.isTTY) return
    // Write without trailing newline so cursor sits on the hint row
    process.stdout.write(chalk.dim(`          press ${chalk.bold(`[${label}]`)} or click · to copy curl`))
    const row = await queryCursorRow()
    if (row !== null) labelPositions.push({ row, slot })
    process.stdout.write('\n')
  }

  // Set up interactive stdin — called once after all prompts are done.
  function setupStdin() {
    if (!process.stdin.isTTY || stdinReady) return
    stdinReady = true

    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    // Enable SGR extended mouse tracking (button + scroll events with full coords)
    process.stdout.write('\x1b[?1000h\x1b[?1006h')

    // Intercept stdout.write to track newlines → keep labelPositions rows in sync with scroll
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = function (chunk, ...args) {
      if (typeof chunk === 'string') {
        const nl = (chunk.match(/\n/g) ?? []).length
        if (nl > 0) {
          for (const e of labelPositions) e.row -= nl
          // Prune labels that have scrolled off the top
          const first = labelPositions.findIndex(e => e.row > 0)
          if (first > 0) labelPositions.splice(0, first)
          else if (first === -1) labelPositions.length = 0
        }
      }
      return origWrite(chunk, ...args)
    }

    process.stdin.on('data', (key) => {
      // Cursor position response: ESC[row;colR
      const posMatch = key.match(/\x1b\[(\d+);(\d+)R/)
      if (posMatch) {
        cursorPosResolve?.(parseInt(posMatch[1], 10))
        cursorPosResolve = null
        return
      }

      // SGR mouse event: ESC[<btn;col;rowM (press) or ESC[<btn;col;rowm (release)
      const mouseMatch = key.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/)
      if (mouseMatch) {
        const btn = parseInt(mouseMatch[1], 10)
        const row = parseInt(mouseMatch[3], 10)
        const pressed = mouseMatch[4] === 'M'
        if (btn === 0 && pressed) {
          // Find the label at this row (scroll-compensated)
          const entry = labelPositions.findLast(e => e.row === row)
          if (entry && curlSlots[entry.slot]) {
            copyToClipboard(curlSlots[entry.slot])
            process.stdout.write(`          ${chalk.dim(`📋 [${entry.slot + 1}] copied!`)}\n`)
          }
        }
        return
      }

      // Numeric keys 1-9
      const n = parseInt(key, 10)
      if (n >= 1 && n <= 9 && curlSlots[n - 1]) {
        copyToClipboard(curlSlots[n - 1])
        process.stdout.write(`          ${chalk.dim(`📋 [${n}] copied!`)}\n`)
        return
      }

      // Ctrl-C — raw mode prevents SIGINT, handle manually
      if (key === '\u0003') {
        disableMouse()
        console.log(chalk.dim('\n  Disconnecting…'))
        ws?.close()
        process.exit(0)
      }
    })
  }

  async function doConnect(isReconnect = false) {
    let connectToken
    try {
      connectToken = await requestConnectToken(cfg, token, key)
    } catch (err) {
      if (!isReconnect) {
        console.error(chalk.red(`  ✗ ${err.message}`))
        process.exit(1)
      }
      // Server not ready yet — keep retrying with the same backoff
      reconnectAttempts++
      if (reconnectAttempts > MAX_RECONNECTS) {
        console.error(chalk.red(`\n  ✗ Failed to reconnect after ${MAX_RECONNECTS} attempts.`))
        console.error(chalk.dim('  Run `hooky connect` to retry.\n'))
        process.exit(1)
      }
      console.log(chalk.dim(
        `  ↻ Server not ready (attempt ${reconnectAttempts}/${MAX_RECONNECTS}). Retrying in ${reconnectDelay / 1000}s…`
      ))
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000)
        doConnect(true).catch(() => {})
      }, reconnectDelay)
      return
    }

    const fullUrl = `${wsBase}/ws/${token}?t=${connectToken}`
    ws = new WebSocket(fullUrl)

    ws.on('open', async () => {
      console.log(chalk.green('  ✓ Connected'))
      setupStdin()

      // Catch up on webhooks missed during the disconnection window
      if (disconnectedAt && cfg?.endpoint?.id && cfg?.auth?.token) {
        try {
          const missed = await listMissedWebhooks(cfg, cfg.endpoint.id, disconnectedAt)
          if (missed.length > 0) {
            console.log(chalk.yellow(`\n  ↻ ${missed.length} webhook(s) received while disconnected — replaying…`))
            for (const wh of missed) {
              const slot = nextSlot
              const label = slot + 1
              nextSlot = (nextSlot + 1) % 9
              curlSlots[slot] = await forwardWebhook(wh, forward, chalk.yellow(' [missed]'), { cfg, sessionId })
              await printHint(label, slot)
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
      if (msg.type === 'connected') {
        sessionId = msg.sessionId ?? null
        return
      }
      if (msg.type === 'error') {
        console.error(chalk.red(`  ✗ Error: ${msg.message}`))
        process.exit(1)
      }

      if (msg.type === 'webhook' || msg.type === 'replay') {
        const slot = nextSlot
        const label = slot + 1
        nextSlot = (nextSlot + 1) % 9

        const tag = msg.type === 'replay' ? chalk.yellow(' [replay]') : ''
        curlSlots[slot] = await forwardWebhook(msg.webhook, forward, tag, { cfg, sessionId })
        await printHint(label, slot)
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
        doConnect(true).catch((err) => {
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
    disableMouse()
    console.log(chalk.dim('\n  Disconnecting…'))
    ws?.close()
    process.exit(0)
  })

  process.on('exit', disableMouse)
}
