import { useCallback, useRef } from 'react'
import { reportScore } from '../api'

const RETRY_MS = 2000

/**
 * Report scores for one node, once per question.
 *
 * The server already ignores repeats, but suppressing them here too keeps a
 * re-render or a double tap from producing pointless requests. `question` is
 * null for rounds that are submitted as a whole (Data Shadow).
 *
 * Reporting is fire-and-forget: a lost report must never hold up the screen the
 * audience is looking at. The one retry exists because venue wifi drops, and
 * the retry is free thanks to the server's idempotency.
 */
export function useScoreReport(room: string, nodeIndex: number) {
  const sent = useRef(new Set<string>())

  return useCallback(
    (question: number | null, points: number) => {
      if (!room || !points) return
      const key = question === null ? 'total' : String(question)
      if (sent.current.has(key)) return
      sent.current.add(key)

      const send = (attempt: number) => {
        void reportScore({
          room,
          nodeIndex,
          question: question ?? undefined,
          points,
        }).catch(() => {
          if (attempt === 0) {
            window.setTimeout(() => send(1), RETRY_MS)
          } else {
            // Give up, but let a later interaction on the same question try
            // again - a lost answer is still visible on the player's own screen.
            sent.current.delete(key)
          }
        })
      }

      send(0)
    },
    [room, nodeIndex],
  )
}
