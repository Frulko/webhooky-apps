import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, seedUser, cleanupUsers } from './helpers.js'

const TEST_EMAIL = 'auth-test@example.com'

let app
let seeded

before(async () => {
  app = await createApp()
  seeded = await seedUser(app, { email: TEST_EMAIL })
})

after(async () => {
  await cleanupUsers(app, [TEST_EMAIL])
  await app.close()
})

describe('POST /api/auth/login', () => {
  test('returns token on valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_EMAIL, password: seeded.password },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.ok(body.token, 'should return access token')
    assert.ok(body.refreshToken, 'should return refresh token')
    assert.equal(body.user.email, TEST_EMAIL)
  })

  test('returns 401 on wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_EMAIL, password: 'wrongpassword' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('returns 401 on unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever' },
    })
    assert.equal(res.statusCode, 401)
  })

  test('returns 400 on invalid email format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email', password: 'whatever' },
    })
    assert.equal(res.statusCode, 400)
  })
})

describe('POST /api/auth/refresh', () => {
  test('returns new token with valid refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: seeded.refreshToken },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.ok(body.token)
  })

  test('returns 401 with invalid refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: 'not.a.valid.token' },
    })
    assert.equal(res.statusCode, 401)
  })
})

describe('GET /api/auth/me', () => {
  test('returns user info with valid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${seeded.token}` },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.email, TEST_EMAIL)
  })

  test('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    assert.equal(res.statusCode, 401)
  })
})
