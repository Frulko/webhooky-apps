import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Point config to a temp file for all tests
const tmpDir = join(tmpdir(), `hooky-test-${Date.now()}`)
const tmpConfig = join(tmpDir, 'config.json')
process.env.HOOKY_CONFIG = tmpConfig

// Import after setting env var so the module picks up the override
const { load, save, clear, merge, redact } = await import('../config.js')

before(() => {
  mkdirSync(tmpDir, { recursive: true })
})

after(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('load()', () => {
  test('returns null when file does not exist', () => {
    assert.equal(load(), null)
  })

  test('returns parsed config when file exists', () => {
    const cfg = { version: 1, server: 'http://localhost:3000' }
    writeFileSync(tmpConfig, JSON.stringify(cfg), { mode: 0o600 })
    assert.deepEqual(load(), cfg)
  })
})

describe('save() / load() round-trip', () => {
  test('persists and reloads config correctly', () => {
    const cfg = {
      version: 1,
      server: 'http://example.com',
      auth: { email: 'user@example.com', token: 'jwt.token.here', refreshToken: 'refresh.token' },
      client: { id: 'c1', name: 'My Client', apiKey: 'wc_abc123' },
      endpoint: { id: 'e1', name: 'My Endpoint', token: 'tok_xyz', hasHmac: false },
      forward: 'http://localhost:8080/webhook',
    }
    save(cfg)
    assert.deepEqual(load(), cfg)
  })
})

describe('clear()', () => {
  test('removes the config file', () => {
    save({ version: 1, server: 'http://example.com' })
    assert.ok(load() !== null)
    clear()
    assert.equal(load(), null)
  })
})

describe('merge()', () => {
  test('flags override config values', () => {
    const cfg = { server: 'http://server.com', forward: 'http://localhost:8080' }
    const flags = { forward: 'http://localhost:9999' }
    const result = merge(cfg, flags)
    assert.equal(result.forward, 'http://localhost:9999')
    assert.equal(result.server, 'http://server.com')
  })

  test('config values used when flags are absent', () => {
    const cfg = { server: 'http://server.com', forward: 'http://localhost:8080' }
    const result = merge(cfg, {})
    assert.equal(result.forward, 'http://localhost:8080')
  })

  test('handles null config gracefully', () => {
    const result = merge(null, { server: 'http://override.com' })
    assert.equal(result.server, 'http://override.com')
  })
})

describe('redact()', () => {
  test('truncates sensitive fields', () => {
    const cfg = {
      version: 1,
      server: 'http://example.com',
      auth: { email: 'user@example.com', token: 'eyJhbGciOiJIUzI1NiJ9.payload.sig', refreshToken: 'refresh' },
      client: { id: 'c1', name: 'Client', apiKey: 'wc_abcdef1234567890' },
      endpoint: { id: 'e1', name: 'EP', token: 'tok_abcdef1234' },
    }
    const r = redact(cfg)
    assert.ok(r.client.apiKey.endsWith('…'), 'apiKey should be truncated')
    assert.ok(r.endpoint.token.endsWith('…'), 'endpoint token should be truncated')
    assert.equal(r.server, cfg.server, 'server should be unchanged')
    assert.equal(r.auth.email, cfg.auth.email, 'email should be unchanged')
  })
})
