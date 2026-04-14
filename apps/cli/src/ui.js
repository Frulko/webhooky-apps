import chalk from 'chalk'

export function banner(subtitle = '') {
  console.log()
  console.log(chalk.bold.white('  hooky') + (subtitle ? chalk.dim(` — ${subtitle}`) : ''))
  console.log(chalk.dim('  ' + '─'.repeat(45)))
}

export function divider() {
  console.log(chalk.dim('  ' + '─'.repeat(45)))
}

export function row(label, value, highlight = false) {
  const l = chalk.dim(label.padEnd(16))
  const v = highlight ? chalk.cyan(value) : value
  console.log(`  ${l} ${v}`)
}

// Draw a table from an array of row arrays
// cols: [{ label, width, align }]
export function table(cols, rows) {
  const pad = (str, width, align = 'left') => {
    const s = String(str ?? '')
    // Strip ANSI codes for length calculation
    const visLen = s.replace(/\x1b\[[0-9;]*m/g, '').length
    const spaces = Math.max(0, width - visLen)
    return align === 'right' ? ' '.repeat(spaces) + s : s + ' '.repeat(spaces)
  }

  const top    = '  ┌' + cols.map(c => '─'.repeat(c.width + 2)).join('┬') + '┐'
  const mid    = '  ├' + cols.map(c => '─'.repeat(c.width + 2)).join('┼') + '┤'
  const bot    = '  └' + cols.map(c => '─'.repeat(c.width + 2)).join('┴') + '┘'
  const header = '  │' + cols.map(c => ' ' + chalk.bold(pad(c.label, c.width, c.align)) + ' ').join('│') + '│'

  console.log(chalk.dim(top))
  console.log(header)
  if (rows.length) console.log(chalk.dim(mid))

  rows.forEach((r, i) => {
    const line = '  │' + cols.map((c, ci) => ' ' + pad(r[ci], c.width, c.align) + ' ').join('│') + '│'
    console.log(line)
    if (i < rows.length - 1) console.log(chalk.dim('  │' + cols.map(c => ' '.repeat(c.width + 2)).join('│') + '│').replace(/ /g, '·').replace(/·/g, ' '))
  })

  console.log(chalk.dim(bot))
}

export function tree(items) {
  // items: [{ label, sub: [string] }]
  items.forEach((item, i) => {
    const last = i === items.length - 1
    console.log(`  ${chalk.dim(last ? '└──' : '├──')} ${item.label}`)
    if (item.sub) {
      item.sub.forEach((s, si) => {
        const lastSub = si === item.sub.length - 1
        const prefix = last ? '    ' : '│   '
        console.log(`  ${chalk.dim(prefix)}${chalk.dim(lastSub ? '└─' : '├─')} ${s}`)
      })
    }
  })
}

export function success(msg) { console.log(`\n  ${chalk.green('✓')} ${msg}`) }
export function error(msg)   { console.log(`\n  ${chalk.red('✗')} ${msg}`) }
export function warn(msg)    { console.log(`\n  ${chalk.yellow('!')} ${msg}`) }
export function info(msg)    { console.log(`  ${chalk.dim('·')} ${msg}`) }
