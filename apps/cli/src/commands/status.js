import chalk from 'chalk'
import { load, redact, CONFIG_PATH } from '../config.js'
import { me } from '../api.js'
import { banner, divider, row, success, error, warn } from '../ui.js'

function tokenExpiry(token) {
  try {
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    const remaining = exp - Math.floor(Date.now() / 1000)
    if (remaining <= 0) return chalk.red('expired')
    if (remaining < 120) return chalk.yellow(`${remaining}s`)
    return chalk.dim(`${Math.round(remaining / 60)}m`)
  } catch {
    return chalk.dim('unknown')
  }
}

export async function status() {
  const cfg = load()

  banner('status')
  console.log()

  row('Config file', CONFIG_PATH)

  if (!cfg) {
    warn('No config found. Run `hooky init` to set up.')
    console.log()
    return
  }

  const r = redact(cfg)

  row('Server', cfg.server)

  if (cfg.auth) {
    row('Email', cfg.auth.email)
    row('Role', cfg.auth.role)
    if (cfg.auth.token) row('Token', `expires in ${tokenExpiry(cfg.auth.token)}`)
  }

  if (cfg.client)   row('Client',   `${cfg.client.name}  ${chalk.dim(r.client.apiKey)}`)
  if (cfg.endpoint) row('Endpoint', `${cfg.endpoint.name}  ${chalk.dim('token: ' + r.endpoint.token)}`)
  if (cfg.forward)  row('Forward',  cfg.forward)

  console.log()
  divider()

  if (!cfg.auth?.token) {
    warn('Not authenticated. Run `hooky login`.')
    console.log()
    return
  }

  try {
    const user = await me(cfg.server, cfg.auth.token)
    success(`Authenticated as ${chalk.bold(user.email)}`)
  } catch {
    error('Token invalid or expired — run `hooky login`')
  }

  console.log()
}
