import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import chalk from 'chalk'
import { banner } from '../ui.js'

function currentVersion() {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8')
  )
  return pkg.version
}

export async function latestVersion() {
  try {
    const res = await fetch('https://registry.npmjs.org/webhooky/latest', {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.version ?? null
  } catch {
    return null
  }
}

export async function update() {
  banner('update')
  console.log()

  const current = currentVersion()
  console.log(`  ${chalk.dim('Current version')}  ${chalk.cyan(current)}`)

  process.stdout.write(`  ${chalk.dim('Latest version')}   ${chalk.dim('checking…')}`)

  const latest = await latestVersion()

  // Clear the "checking…" line
  process.stdout.write('\r' + ' '.repeat(50) + '\r')

  if (!latest) {
    console.log(`  ${chalk.yellow('!')} Could not reach npm registry. Check your connection.`)
    console.log()
    console.log(`  To update manually:`)
    console.log(`  ${chalk.dim('$')} npm install -g webhooky@latest`)
    console.log()
    return
  }

  console.log(`  ${chalk.dim('Latest version')}   ${chalk.cyan(latest)}`)
  console.log()

  if (current === latest) {
    console.log(`  ${chalk.green('✓')} Already up to date.`)
    console.log()
    return
  }

  console.log(`  ${chalk.yellow('↑')} Update available: ${chalk.dim(current)} → ${chalk.green(latest)}`)
  console.log()

  try {
    // Remove first to avoid stale cached files, then reinstall clean
    process.stdout.write(`  ${chalk.dim('Removing old version…')}\n`)
    execSync('npm remove -g webhooky', { stdio: 'pipe' })
    process.stdout.write(`  ${chalk.dim(`Installing webhooky@${latest}…`)}\n`)
    execSync(`npm install -g webhooky@${latest}`, { stdio: 'inherit' })
    console.log()
    console.log(`  ${chalk.green('✓')} Updated to ${chalk.bold(latest)}`)
  } catch {
    console.log(`  ${chalk.red('✗')} Update failed. Try manually:`)
    console.log(`  ${chalk.dim('$')} npm remove -g webhooky && npm install -g webhooky@latest`)
  }

  console.log()
}
