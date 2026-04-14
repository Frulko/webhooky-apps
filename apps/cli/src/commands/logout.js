import chalk from 'chalk'
import { clear, CONFIG_PATH } from '../config.js'

export function logout() {
  clear()
  console.log(chalk.dim(`\n  Logged out. Config removed: ${CONFIG_PATH}\n`))
}
