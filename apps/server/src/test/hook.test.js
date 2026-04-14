import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp, seedUser, cleanupUsers } from './helpers.js'

const TEST_EMAIL = 'hook-test@example.com'

let app
let seeded
let client
let endpoint

before(async () => {
  app = await createApp()
  seeded = await seedUser(app, { email: TEST_EMAIL })

  // Create a test client
  ;[client] = await app.sql`
    INSERT INTO clients (user_id, name, api_key, active)
    VALUES (${seeded.user.id}, 'Test Client', ${'wc_test_' + Date.now()}, true)
    RETURNING id, api_key
  `

  // Create a test endpoint
  ;[endpoint] = await app.sql`
    INSERT INTO endpoints (client_id, name, token, active)
    VALUES (${client.id}, 'Test Endpoint', ${'tok_test_' + Date.now()}, true)
    RETURNING id, token
  `
})

after(async () => {
  await app.sql`DELETE FROM webhooks WHERE endpoint_id = ${endpoint.id}`
  await app.sql`DELETE FROM endpoints WHERE id = ${endpoint.id}`
  await app.sql`DELETE FROM clients WHERE id = ${client.id}`
  await cleanupUsers(app, [TEST_EMAIL])
  await app.close()
})

describe('POST /hook/:token', () => {
  test('accepts a valid webhook and returns received: true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpoint.token}`,
      headers: { 'content-type': 'application/json' },
      payload: { event: 'test', data: { foo: 'bar' } },
    })
    assert.equal(res.statusCode, 200)
    const body = res.json()
    assert.equal(body.received, true)
    assert.ok(body.id, 'should return webhook id')
  })

  test('stores the webhook in the database', async () => {
    const payload = { event: 'stored', value: 42 }
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpoint.token}`,
      headers: { 'content-type': 'application/json' },
      payload,
    })
    assert.equal(res.statusCode, 200)
    const { id } = res.json()

    const [stored] = await app.sql`SELECT * FROM webhooks WHERE id = ${id}`
    assert.ok(stored, 'webhook should be in the database')
    assert.equal(stored.method, 'POST')
    assert.equal(stored.endpointId, endpoint.id)
  })

  test('returns 404 for unknown token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/hook/unknown_token_xyz',
      payload: { x: 1 },
    })
    assert.equal(res.statusCode, 404)
  })

  test('accepts non-JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/hook/${endpoint.token}`,
      headers: { 'content-type': 'text/plain' },
      payload: 'raw text payload',
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.json().received, true)
  })
})
