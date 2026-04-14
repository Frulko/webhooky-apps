import chalk from 'chalk'
import { input, select } from '@inquirer/prompts'
import { load, save } from '../config.js'
import { listClients, listEndpoints } from '../api.js'

export async function switchEndpoint() {
  const cfg = load()

  if (!cfg?.auth?.token) {
    console.error(chalk.red('\n  Not authenticated. Run `hooky init` first.\n'))
    process.exit(1)
  }

  console.log(chalk.bold('\n  hooky — switch endpoint'))
  console.log(chalk.dim('  ─────────────────────────────────────\n'))

  let clients
  try {
    clients = await listClients(cfg.server, cfg.auth.token)
  } catch (err) {
    console.error(chalk.red(`  ✗ ${err.message}`))
    process.exit(1)
  }

  if (clients.length === 0) {
    console.log(chalk.yellow('  No clients found. Create one in the dashboard first.\n'))
    process.exit(0)
  }

  let chosenClient
  try {
    if (clients.length === 1) {
      chosenClient = clients[0]
      console.log(`  Client: ${chalk.cyan(chosenClient.name)}`)
    } else {
      const currentClientId = cfg.client?.id
      const clientId = await select({
        message: 'Select a client',
        default: currentClientId,
        choices: clients.map((c) => ({
          name: `${c.name} (${c.apiKey.slice(0, 10)}…)${c.id === currentClientId ? chalk.dim(' ← current') : ''}`,
          value: c.id,
        })),
      })
      chosenClient = clients.find((c) => c.id === clientId)
    }
  } catch {
    process.exit(0)
  }

  let endpoints
  try {
    endpoints = await listEndpoints(cfg.server, cfg.auth.token, chosenClient.id)
  } catch (err) {
    console.error(chalk.red(`  ✗ ${err.message}`))
    process.exit(1)
  }

  if (endpoints.length === 0) {
    console.log(chalk.yellow('  No endpoints found. Create one in the dashboard first.\n'))
    process.exit(0)
  }

  let chosenEndpoint
  try {
    if (endpoints.length === 1) {
      chosenEndpoint = endpoints[0]
      console.log(`  Endpoint: ${chalk.cyan(chosenEndpoint.name)}`)
    } else {
      const currentEndpointId = cfg.endpoint?.id
      const endpointId = await select({
        message: 'Select an endpoint',
        default: currentEndpointId,
        choices: endpoints.map((e) => ({
          name: `${e.name}${e.active ? '' : chalk.dim(' (inactive)')}${e.id === currentEndpointId ? chalk.dim(' ← current') : ''}`,
          value: e.id,
          disabled: !e.active ? '(inactive)' : false,
        })),
      })
      chosenEndpoint = endpoints.find((e) => e.id === endpointId)
    }
  } catch {
    process.exit(0)
  }

  let forward = cfg.forward
  try {
    forward = await input({
      message: 'Local URL to forward webhooks to',
      default: cfg.forward ?? 'http://localhost:8080/webhook',
      validate: (v) => { try { new URL(v); return true } catch { return 'Enter a valid URL' } },
    })
  } catch {
    process.exit(0)
  }

  save({
    ...cfg,
    client: { id: chosenClient.id, name: chosenClient.name, apiKey: chosenClient.apiKey },
    endpoint: { id: chosenEndpoint.id, name: chosenEndpoint.name, token: chosenEndpoint.token, hasHmac: chosenEndpoint.hasHmac },
    forward,
  })

  console.log(chalk.green('\n  ✓ Switched to:'))
  console.log(`  ${chalk.dim('Client:')}   ${chosenClient.name}`)
  console.log(`  ${chalk.dim('Endpoint:')} ${chosenEndpoint.name}`)
  console.log(`  ${chalk.dim('Forward:')}  ${forward}`)
  console.log(chalk.dim('\n  Run `hooky connect` to start.\n'))
}
