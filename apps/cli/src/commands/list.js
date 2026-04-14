import chalk from 'chalk'
import { load } from '../config.js'
import { listClients, listEndpoints } from '../api.js'
import { banner, divider, success, warn, error } from '../ui.js'

export async function list() {
  const cfg = load()

  if (!cfg?.auth?.token) {
    error('Not authenticated. Run `hooky init` first.')
    console.log()
    process.exit(1)
  }

  banner('clients & endpoints')

  let clients
  try {
    clients = await listClients(cfg.server, cfg.auth.token)
  } catch (err) {
    error(err.message)
    process.exit(1)
  }

  if (!clients.length) {
    warn('No clients yet — create one in the dashboard.')
    console.log()
    return
  }

  console.log()

  for (const client of clients) {
    const isCurrent = client.id === cfg.client?.id
    const activeTag = client.active ? '' : chalk.dim(' [disabled]')
    const currentTag = isCurrent ? chalk.green.bold(' ← active') : ''

    console.log(`  ${isCurrent ? chalk.green('●') : chalk.dim('○')}  ${chalk.bold(client.name)}${activeTag}${currentTag}`)

    let endpoints
    try {
      endpoints = await listEndpoints(cfg.server, cfg.auth.token, client.id)
    } catch {
      console.log(chalk.dim('     (could not fetch endpoints)'))
      console.log()
      continue
    }

    if (!endpoints.length) {
      console.log(chalk.dim('     no endpoints yet'))
      console.log()
      continue
    }

    endpoints.forEach((ep, i) => {
      const last = i === endpoints.length - 1
      const isCurrentEp = ep.id === cfg.endpoint?.id
      const tree = chalk.dim(last ? '     └──' : '     ├──')
      const bullet = isCurrentEp ? chalk.green('▶') : chalk.dim('·')
      const name = isCurrentEp ? chalk.green.bold(ep.name) : ep.name
      const tags = [
        !ep.active ? chalk.dim('[disabled]') : '',
        ep.hasHmac ? chalk.dim('[HMAC]') : '',
        isCurrentEp ? chalk.green('← active') : '',
      ].filter(Boolean).join(' ')

      console.log(`${tree} ${bullet} ${name}  ${tags}`)
      console.log(chalk.dim(`     ${last ? '       ' : '  │    '}  ${cfg.server}/hook/${ep.token}`))
    })

    console.log()
  }

  divider()
  console.log(`  ${chalk.dim('Active endpoint:')} ${cfg.endpoint ? chalk.cyan(cfg.endpoint.name) : chalk.dim('none')}   ${chalk.dim('forward →')} ${cfg.forward ?? chalk.dim('none')}`)
  console.log()
}
