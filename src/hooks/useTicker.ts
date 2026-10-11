import { useEffect, useState } from 'react'

/**
 * Re-renders on an interval so a countdown can move on its own.
 *
 * The server only sends a state change when something changes, so the ticking
 * has to happen locally - otherwise the clock would freeze between messages.
 */
export function useTicker(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}
