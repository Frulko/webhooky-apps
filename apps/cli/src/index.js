import { program } from 'commander'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dir = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dir, '../package.json'), 'utf8'))

program
  .name('webhook-catcher')
  .description('Forward webhooks from webhook-catcher service to your local server')
  .version(pkg.version)

// Commands
const { connect } = await import('./commands/connect.js')
const { replay } = await import('./commands/replay.js')

program
  .command('connect')
  .description('Connect to a webhook endpoint and forward to a local URL')
  .requiredOption('-t, --token <token>', 'Endpoint token')
  .requiredOption('-f, --forward <url>', 'Local URL to forward webhooks to (e.g. http://localhost:3000/webhook)')
  .requiredOption('-k, --key <apiKey>', 'Client API key (wc_...)')
  .option('-s, --server <url>', 'Webhook catcher server URL', 'http://localhost:3000')
  .option('--no-color', 'Disable colored output')
  .action(connect)

program
  .command('replay')
  .description('Replay a webhook by ID to your local server')
  .requiredOption('-i, --id <webhookId>', 'Webhook ID to replay')
  .requiredOption('-f, --forward <url>', 'Local URL to forward to')
  .requiredOption('-k, --key <apiKey>', 'Client API key')
  .option('-s, --server <url>', 'Webhook catcher server URL', 'http://localhost:3000')
  .action(replay)

program.parse()
