import chalk from 'chalk'
import { input, password, select } from '@inquirer/prompts'
import { load, save, CONFIG_PATH } from '../config.js'
import { login, listClients, listEndpoints } from '../api.js'

export async function init() {
  const saved = load() ?? {}

  console.log(chalk.bold('\n  hooky — setup'))
  console.log(chalk.dim('  ─────────────────────────────────────\n'))

  let server, email, pass, authData

  try {
    const rawUrl = await input({
      message: 'Dashboard URL',
      default: saved.server ?? 'http://localhost:3000',
      validate: (v) => { try { new URL(v); return true } catch { return 'Enter a valid URL' } },
    })

    // In dev, Vite runs on :5173 but the API is on :3000.
    // In production they're the same domain — use as-is.
    const u = new URL(rawUrl)
    if (u.hostname === 'localhost' && u.port === '5173') {
      u.port = '3000'
      console.log(chalk.dim(`  (dev mode detected → API at ${u.origin})`))
    }
    server = u.origin

    email = await input({
      message: 'Email',
      default: saved.auth?.email ?? undefined,
      validate: (v) => v.includes('@') || 'Enter a valid email',
    })

    let attempts = 0
    while (attempts < 3) {
      pass = await password({
        message: 'Password',
        validate: (v) => v.trim().length > 0 || 'Required',
      })
      try {
        authData = await login(server, email, pass)
        break
      } catch (err) {
        attempts++
        if (err.status === 401) {
          if (attempts < 3) {
            console.log(chalk.red('  ✗ Invalid credentials, try again'))
          } else {
            console.log(chalk.red('  ✗ Too many failed attempts'))
            process.exit(1)
          }
        } else {
          console.log(chalk.red(`  ✗ ${err.message}`))
          process.exit(1)
        }
      }
    }
  } catch {
    process.exit(0)
  }

  const auth = {
    email,
    userId: authData.user.id,
    role: authData.user.role,
    token: authData.token,
    refreshToken: authData.refreshToken,
  }

  console.log(chalk.green(`\n  ✓ Logged in as ${email}`))

  // Fetch clients
  let clients
  try {
    clients = await listClients(server, auth.token)
  } catch (err) {
    console.error(chalk.red(`  ✗ ${err.message}`))
    process.exit(1)
  }

  if (clients.length === 0) {
    console.log(chalk.yellow('\n  No clients found. Create one in the dashboard, then re-run `hooky init`.'))
    save({ version: 1, server, auth })
    console.log(chalk.dim(`\n  Saved partial config to ${CONFIG_PATH}`))
    process.exit(0)
  }

  let chosenClient
  try {
    if (clients.length === 1) {
      chosenClient = clients[0]
      console.log(`  Client: ${chalk.cyan(chosenClient.name)}`)
    } else {
      const clientId = await select({
        message: 'Select a client',
        choices: clients.map((c) => ({
          name: `${c.name} (${c.apiKey.slice(0, 10)}…)`,
          value: c.id,
        })),
      })
      chosenClient = clients.find((c) => c.id === clientId)
    }
  } catch {
    process.exit(0)
  }

  // Fetch endpoints
  let endpoints
  try {
    endpoints = await listEndpoints(server, auth.token, chosenClient.id)
  } catch (err) {
    console.error(chalk.red(`  ✗ ${err.message}`))
    process.exit(1)
  }

  if (endpoints.length === 0) {
    console.log(chalk.yellow('\n  No endpoints found. Create one in the dashboard, then re-run `hooky init`.'))
    save({
      version: 1, server, auth,
      client: { id: chosenClient.id, name: chosenClient.name, apiKey: chosenClient.apiKey },
    })
    console.log(chalk.dim(`\n  Saved partial config to ${CONFIG_PATH}`))
    process.exit(0)
  }

  let chosenEndpoint
  try {
    if (endpoints.length === 1) {
      chosenEndpoint = endpoints[0]
      console.log(`  Endpoint: ${chalk.cyan(chosenEndpoint.name)}`)
    } else {
      const endpointId = await select({
        message: 'Select an endpoint',
        choices: endpoints.map((e) => ({
          name: `${e.name}${e.active ? '' : chalk.dim(' (inactive)')}`,
          value: e.id,
          disabled: !e.active ? '(inactive)' : false,
        })),
      })
      chosenEndpoint = endpoints.find((e) => e.id === endpointId)
    }
  } catch {
    process.exit(0)
  }

  // Forward URL
  let forward
  try {
    forward = await input({
      message: 'Local URL to forward webhooks to',
      default: saved.forward ?? 'http://localhost:8080/webhook',
      validate: (v) => { try { new URL(v); return true } catch { return 'Enter a valid URL' } },
    })
  } catch {
    process.exit(0)
  }

  const cfg = {
    version: 1,
    server,
    auth,
    client: { id: chosenClient.id, name: chosenClient.name, apiKey: chosenClient.apiKey },
    endpoint: { id: chosenEndpoint.id, name: chosenEndpoint.name, token: chosenEndpoint.token, hasHmac: chosenEndpoint.hasHmac },
    forward,
  }

  save(cfg)

  console.log(chalk.bold(`\n  ✓ Saved to ${CONFIG_PATH}`))
  console.log(`  ${chalk.dim('Client:')}   ${chosenClient.name} ${chalk.dim('(' + chosenClient.apiKey.slice(0, 10) + '…)')}`)
  console.log(`  ${chalk.dim('Endpoint:')} ${chosenEndpoint.name}`)
  console.log(`  ${chalk.dim('Forward:')}  ${forward}`)
  console.log(chalk.dim('\n  Run `hooky connect` to start.\n'))
}
