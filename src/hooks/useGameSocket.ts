import { useEffect } from 'react'
import { useGameStore, type WsMessage } from '../store/gameStore'

const RETRY_MS = 2000

/**
 * One websocket per screen, reconnecting on its own.
 *
 * A kiosk that has been running for hours will lose the connection at some
 * point - a deploy, a wifi blip - so reconnecting is not optional. On every
 * (re)connect the server immediately sends the current state, which is what
 * makes a reconnect invisible to the audience.
 */
export function useGameSocket(room: string): void {
  const setConnection = useGameStore((state) => state.setConnection)
  const applyMessage = useGameStore((state) => state.applyMessage)
  const resetForRoom = useGameStore((state) => state.resetForRoom)

  useEffect(() => {
    // A different room means none of the previous room's state applies.
    resetForRoom()

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${scheme}://${location.host}/api/ws?room=${encodeURIComponent(room)}`

    let socket: WebSocket | null = null
    let retry: number | undefined
    let disposed = false

    const connect = () => {
      if (disposed) return
      setConnection('connecting')
      socket = new WebSocket(url)

      socket.onopen = () => setConnection('open')

      socket.onmessage = (event) => {
        try {
          applyMessage(JSON.parse(String(event.data)) as WsMessage)
        } catch {
          // A message we cannot parse is not worth breaking the screen over.
        }
      }

      socket.onclose = () => {
        setConnection('closed')
        if (!disposed) retry = window.setTimeout(connect, RETRY_MS)
      }

      socket.onerror = () => socket?.close()
    }

    connect()

    return () => {
      disposed = true
      if (retry !== undefined) window.clearTimeout(retry)
      socket?.close()
    }
  }, [room, setConnection, applyMessage, resetForRoom])
}
