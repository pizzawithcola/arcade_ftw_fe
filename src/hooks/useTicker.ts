import { useEffect, useState } from 'react'

/**
 * Re-renders on an interval so a countdown can move on its own.
 *
 * The server only sends a state change when something changes, so the ticking
 * has to happen locally - otherwise the clock would freeze between messages.
 *
 * Browsers throttle timers in a hidden tab, which leaves `now` stale and makes
 * a countdown look frozen at an inflated value. Refreshing on visibilitychange
 * means the clock is correct the instant the tab is looked at again.
 */
export function useTicker(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const tick = () => setNow(Date.now())
    const id = window.setInterval(tick, intervalMs)

    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [intervalMs])

  return now
}
