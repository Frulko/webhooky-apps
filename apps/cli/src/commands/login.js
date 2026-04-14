import chalk from 'chalk'
import { input, password } from '@inquirer/prompts'
import { load, save, CONFIG_PATH } from '../config.js'
import { login as apiLogin } from '../api.js'

export async function login() {
  const saved = load() ?? {}

  if (!saved.server) {
    console.error(chalk.red('  No config found. Run `hooky init` first.'))
    process.exit(1)
  }

  console.log(chalk.bold('\n  hooky — login'))
  console.log(chalk.dim('  ─────────────────────────────────────\n'))

  let email, pass, authData

  try {
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
        authData = await apiLogin(saved.server, email, pass)
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

  const updated = {
    ...saved,
    auth: {
      email,
      userId: authData.user.id,
      role: authData.user.role,
      token: authData.token,
      refreshToken: authData.refreshToken,
    },
  }

  save(updated)
  console.log(chalk.green(`\n  ✓ Logged in as ${email}\n`))
}
