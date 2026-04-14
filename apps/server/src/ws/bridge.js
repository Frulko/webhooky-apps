/**
 * WebSocket bridge manager.
 * Maintains a map of endpointId -> Set of active WebSocket connections.
 */

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const connections = new Map()

export function register(endpointId, ws) {
  if (!connections.has(endpointId)) {
    connections.set(endpointId, new Set())
  }
  connections.get(endpointId).add(ws)
}

export function unregister(endpointId, ws) {
  const set = connections.get(endpointId)
  if (!set) return
  set.delete(ws)
  if (set.size === 0) connections.delete(endpointId)
}

export function getConnections(endpointId) {
  return connections.get(endpointId) ?? new Set()
}

export function countConnections(endpointId) {
  return connections.get(endpointId)?.size ?? 0
}

export function countAllConnections() {
  let total = 0
  for (const set of connections.values()) total += set.size
  return total
}

/**
 * Forward a payload to all connected clients on an endpoint.
 * Returns the number of clients reached.
 */
export function broadcast(endpointId, payload) {
  const set = connections.get(endpointId)
  if (!set || set.size === 0) return 0
  const data = JSON.stringify(payload)
  let count = 0
  for (const ws of set) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(data)
      count++
    }
  }
  return count
}

/**
 * Forward a payload to a single WebSocket connection.
 */
export function sendToSocket(ws, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload))
    return true
  }
  return false
}
