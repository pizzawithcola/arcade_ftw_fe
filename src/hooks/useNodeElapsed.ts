import { useGameStore } from '../store/gameStore'
import { useTicker } from './useTicker'

/**
 * How far into the current node the show has got, in milliseconds - advancing
 * only while the engine is playing.
 *
 * The games run their own per-question countdowns, and those have to obey the
 * engine: pausing is an operator action that must stop everything on screen, not
 * just the node header. A raw `Date.now()` clock ignored the pause entirely, so
 * a paused node kept burning through its questions.
 *
 * Derived from the engine's own countdown rather than accumulated locally. The
 * store already holds the pause-aware values - `endsAt` while playing, `heldMs`
 * while paused - so subtracting the remaining time from the node's length gives
 * the elapsed time for free, with no refs and no second clock to keep in sync.
 */
export function useNodeElapsed(): number {
  const now = useTicker()
  const node = useGameStore((state) => state.node)
  const endsAt = useGameStore((state) => state.endsAt)
  const heldMs = useGameStore((state) => state.heldMs)

  const durationMs = (node?.duration_sec ?? 0) * 1000

  // While playing the deadline is fixed and `now` grows, so this counts up.
  // While paused the deadline is gone and the held value is constant, so it
  // freezes - which is exactly the behaviour a paused show needs.
  const remainingMs = endsAt !== null ? Math.max(0, endsAt - now) : heldMs

  return Math.max(0, durationMs - remainingMs)
}
