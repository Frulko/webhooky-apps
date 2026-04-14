import { nanoid } from 'nanoid'

/**
 * Short-lived one-time connect tokens for WebSocket authentication.
 * Replaces passing the API key as a query parameter in the WS URL.
 *
 * Tokens expire after 30 seconds and are consumed on first use.
 */

/** @type {Map<string, { endpointId: string, clientId: string, expiresAt: number }>} */
const tokens = new Map()

// Sweep expired tokens every minute
setInterval(() => {
  const now = Date.now()
  for (const [token, data] of tokens) {
    if (data.expiresAt < now) tokens.delete(token)
  }
}, 60_000).unref()

export function createConnectToken(endpointId, clientId) {
  const token = nanoid(32)
  tokens.set(token, { endpointId, clientId, expiresAt: Date.now() + 30_000 })
  return token
}

/**
 * Validates and consumes a connect token.
 * Returns { endpointId, clientId } or null if invalid/expired.
 */
export function consumeConnectToken(token) {
  const data = tokens.get(token)
  if (!data) return null
  if (data.expiresAt < Date.now()) {
    tokens.delete(token)
    return null
  }
  tokens.delete(token)
  return { endpointId: data.endpointId, clientId: data.clientId }
}
