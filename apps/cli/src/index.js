import { program } from 'commander'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import chalk from 'chalk'

const __dir = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dir, '../package.json'), 'utf8'))

program
  .name('hooky')
  .version(pkg.version)
  .helpOption('-h, --help', 'Show help')
  .addHelpText('beforeAll', `
${chalk.bold.white('  hooky')} ${chalk.dim(`v${pkg.version}`)}
${chalk.dim('  Receive webhooks in the cloud, forward them to localhost.')}
${chalk.dim('  ─────────────────────────────────────────────')}
`)
  .addHelpText('afterAll', `
${chalk.dim('  ─────────────────────────────────────────────')}
  ${chalk.dim('Examples:')}
  ${chalk.dim('$')} hooky init          ${chalk.dim('# first-time setup')}
  ${chalk.dim('$')} hooky connect        ${chalk.dim('# start forwarding')}
  ${chalk.dim('$')} hooky list           ${chalk.dim('# browse clients & endpoints')}
  ${chalk.dim('$')} hooky switch         ${chalk.dim('# change active endpoint')}
`)

const { switchEndpoint } = await import('./commands/switch.js')
const { list } = await import('./commands/list.js')
const { connect } = await import('./commands/connect.js')
const { replay } = await import('./commands/replay.js')
const { init } = await import('./commands/init.js')
const { login } = await import('./commands/login.js')
const { logout } = await import('./commands/logout.js')
const { status } = await import('./commands/status.js')

program
  .command('init')
  .description('First-time setup: server, login, client & endpoint')
  .action(init)

program
  .command('login')
  .description('Re-authenticate (keeps existing config)')
  .action(login)

program
  .command('logout')
  .description('Remove saved credentials and config')
  .action(logout)

program
  .command('status')
  .description('Show current config and auth status')
  .action(status)

program
  .command('list')
  .description('List all clients and endpoints')
  .action(list)

program
  .command('switch')
  .description('Switch active client / endpoint (no re-login)')
  .action(switchEndpoint)

program
  .command('connect')
  .description('Connect and forward webhooks to localhost')
  .option('-t, --token <token>',   'Endpoint token (overrides config)')
  .option('-f, --forward <url>',   'Local URL to forward to (overrides config)')
  .option('-k, --key <apiKey>',    'Client API key (overrides config)')
  .option('-s, --server <url>',    'Server URL (overrides config)')
  .action(connect)

program
  .command('replay')
  .description('Replay a stored webhook to localhost')
  .requiredOption('-i, --id <webhookId>', 'Webhook ID')
  .option('-f, --forward <url>',  'Local URL to forward to (overrides config)')
  .option('-s, --server <url>',   'Server URL (overrides config)')
  .action(replay)

// Show help when no command given
if (process.argv.length === 2) {
  program.help()
}

program.parse()
