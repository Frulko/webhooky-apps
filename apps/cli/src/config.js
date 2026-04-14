import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  renameSync,
  statSync,
  existsSync,
  unlinkSync,
} from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, dirname } from 'node:path'

function configPath() {
  if (process.env.HOOKY_CONFIG) {
    return process.env.HOOKY_CONFIG
  }
  const home = homedir()
  const plat = platform()
  let dir
  if (plat === 'win32') {
    dir = join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'hooky', 'Config')
  } else if (plat === 'darwin') {
    dir = join(home, 'Library', 'Application Support', 'hooky')
  } else {
    dir = join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'hooky')
  }
  return join(dir, 'config.json')
}

export const CONFIG_PATH = configPath()

export function load() {
  if (!existsSync(CONFIG_PATH)) return null
  // Warn if world-readable on Unix
  if (platform() !== 'win32') {
    try {
      const mode = statSync(CONFIG_PATH).mode
      if ((mode & 0o077) !== 0) {
        console.warn(`  Warning: config file is world-readable. Run: chmod 600 "${CONFIG_PATH}"`)
      }
    } catch {}
  }
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
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
