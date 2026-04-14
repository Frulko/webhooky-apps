import { useEffect, useRef, useCallback } from 'react'

type WsMessage = { type: string; [key: string]: unknown }
type Handler = (msg: WsMessage) => void

export function useWebSocket(endpointToken: string | null, apiKey: string | null, onMessage: Handler) {
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const connect = useCallback(() => {
    if (!endpointToken || !apiKey) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/${endpointToken}?key=${apiKey}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as WsMessage
        onMessage(data)
      } catch { /* ignore */ }
    }

    ws.onopen = () => {
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30000)
    }

    ws.onclose = () => {
      if (pingRef.current) clearInterval(pingRef.current)
      // Reconnect after 3s
      setTimeout(connect, 3000)
    }
  }, [endpointToken, apiKey, onMessage])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
      if (pingRef.current) clearInterval(pingRef.current)
    }
  }, [connect])
}
