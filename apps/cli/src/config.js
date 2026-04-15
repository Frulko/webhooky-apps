import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  renameSync,
  statSync,
  existsSync,
  unlinkSync,
  copyFileSync,
} from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, dirname } from 'node:path'
import chalk from 'chalk'

function configPath() {
  if (process.env.HOOKY_CONFIG) return process.env.HOOKY_CONFIG
  const home = homedir()
  const plat = platform()
  if (plat === 'win32') {
    return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'webhooky', 'config.json')
  }
  // ~/.config/webhooky on all Unix platforms
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'webhooky', 'config.json')
}

// Old locations used before v0.7.17
function legacyConfigPath() {
  if (process.env.HOOKY_CONFIG) return null
  const home = homedir()
  const plat = platform()
  if (plat === 'win32') return null
  if (plat === 'darwin') {
    return join(home, 'Library', 'Application Support', 'hooky', 'config.json')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'hooky', 'config.json')
}

export const CONFIG_PATH = configPath()

export function load() {
  // Auto-migrate from legacy path if new path doesn't exist yet
  if (!existsSync(CONFIG_PATH)) {
    const legacy = legacyConfigPath()
    if (legacy && existsSync(legacy)) {
      try {
        const dir = dirname(CONFIG_PATH)
        mkdirSync(dir, { recursive: true, mode: 0o700 })
        if (platform() !== 'win32') { try { chmodSync(dir, 0o700) } catch {} }
        copyFileSync(legacy, CONFIG_PATH)
        if (platform() !== 'win32') { try { chmodSync(CONFIG_PATH, 0o600) } catch {} }
        unlinkSync(legacy)
        console.log(`  ${chalk.dim(`Config migrated to ${CONFIG_PATH}`)}`)
      } catch {
        // Migration failed silently — legacy path will still be read below
      }
    }
  }

  const pathToRead = existsSync(CONFIG_PATH) ? CONFIG_PATH : (legacyConfigPath() ?? CONFIG_PATH)
  if (!existsSync(pathToRead)) return null

  // Warn if world-readable on Unix
  if (platform() !== 'win32') {
    try {
      const mode = statSync(pathToRead).mode
      if ((mode & 0o077) !== 0) {
        console.warn(`  Warning: config file is world-readable. Run: chmod 600 "${pathToRead}"`)
      }
    } catch {}
  }
  try {
    return JSON.parse(readFileSync(pathToRead, 'utf8'))
  } catch {
    return null
  }
}

export function save(data) {
  const dir = dirname(CONFIG_PATH)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  // Ensure dir has correct permissions
  if (platform() !== 'win32') {
    try { chmodSync(dir, 0o700) } catch {}
  }
  const tmp = CONFIG_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 })
  renameSync(tmp, CONFIG_PATH)
  if (platform() !== 'win32') {
    try { chmodSync(CONFIG_PATH, 0o600) } catch {}
  }
}

export function clear() {
  if (existsSync(CONFIG_PATH)) {
    unlinkSync(CONFIG_PATH)
  }
}

export function merge(cfg, flags) {
  return {
    server: flags.server ?? cfg?.server ?? 'http://localhost:3000',
    forward: flags.forward ?? cfg?.forward,
    auth: cfg?.auth,
    client: cfg?.client,
    endpoint: cfg?.endpoint,
  }
}

export function redact(cfg) {
  if (!cfg) return null
  return {
    ...cfg,
    auth: cfg.auth
      ? {
          ...cfg.auth,
          token: cfg.auth.token ? cfg.auth.token.slice(0, 12) + '…' : undefined,
          refreshToken: cfg.auth.refreshToken ? cfg.auth.refreshToken.slice(0, 12) + '…' : undefined,
        }
      : undefined,
    client: cfg.client
      ? {
          ...cfg.client,
          apiKey: cfg.client.apiKey ? cfg.client.apiKey.slice(0, 10) + '…' : undefined,
        }
      : undefined,
    endpoint: cfg.endpoint
      ? {
          ...cfg.endpoint,
          token: cfg.endpoint.token ? cfg.endpoint.token.slice(0, 6) + '…' : undefined,
        }
      : undefined,
  }
}
