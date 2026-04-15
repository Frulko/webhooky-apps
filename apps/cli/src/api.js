import { save } from './config.js'

function decodeJwtExp(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp
  } catch {
    return null
  }
}

export async function login(server, email, password) {
  const res = await fetch(`${server}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Login failed'), { status: res.status })
  return data // { token, refreshToken, user }
}

export async function refreshToken(server, refreshTokenStr) {
  const res = await fetch(`${server}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refreshTokenStr }),
  })
  if (!res.ok) throw Object.assign(new Error('Refresh failed'), { status: res.status })
  return (await res.json()).token
}

export async function me(server, token) {
  const res = await fetch(`${server}/api/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw Object.assign(new Error('Unauthorized'), { status: res.status })
  return res.json()
}

export async function listClients(server, token) {
  const res = await fetch(`${server}/api/clients`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch clients')
  return res.json()
}

export async function listEndpoints(server, token, clientId) {
  const res = await fetch(`${server}/api/clients/${clientId}/endpoints`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch endpoints')
  return res.json()
}

export async function listMissedWebhooks(cfg, endpointId, since) {
  const params = new URLSearchParams({ endpointId, since, full: '1', limit: '50' })
  const res = await authedFetch(cfg, `/api/webhooks?${params}`)
  if (!res.ok) throw new Error('Failed to fetch missed webhooks')
  return res.json()
}

export async function reportDelivery(cfg, webhookId, data) {
  try {
    await authedFetch(cfg, `/api/webhooks/${webhookId}/delivery`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  } catch {
    // Fire-and-forget — never crash the CLI on a reporting failure
  }
}

export async function requestConnectToken(cfg, endpointToken, apiKey) {
  const res = await authedFetch(cfg, '/api/ws-token', {
    method: 'POST',
    body: JSON.stringify({ endpointToken, apiKey }),
  })
  if (!res.ok) throw new Error('Failed to get connect token — check credentials')
  return (await res.json()).connectToken
}

// Auto-refreshes JWT when <60s remain, persists new token to config.
export async function authedFetch(cfg, path, init = {}) {
  let token = cfg.auth?.token
  const exp = decodeJwtExp(token)
  const now = Math.floor(Date.now() / 1000)

  if (exp && exp - now < 60) {
    try {
      token = await refreshToken(cfg.server, cfg.auth.refreshToken)
      const updated = { ...cfg, auth: { ...cfg.auth, token } }
      save({ version: 1, ...updated })
      cfg.auth.token = token
    } catch {
      throw new Error('Session expired — run `hooky login`')
    }
  }

  const res = await fetch(`${cfg.server}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  })

  // One refresh retry on 401
  if (res.status === 401) {
    try {
      token = await refreshToken(cfg.server, cfg.auth.refreshToken)
      const updated = { ...cfg, auth: { ...cfg.auth, token } }
      save({ version: 1, ...updated })
      cfg.auth.token = token
    } catch {
      throw new Error('Session expired — run `hooky login`')
    }
    return fetch(`${cfg.server}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    })
  }

  return res
}
