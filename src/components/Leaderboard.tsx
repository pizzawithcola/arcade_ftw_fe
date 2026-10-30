import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './Leaderboard.css'

export interface LeaderboardEntry {
  rank: number
  nickname: string
  /** This section's points. */
  score: number
  /**
   * The player's standing before this section, and what they hold now. Both are
   * optional so a board with no history (the public top ten) still renders:
   * without them the list is drawn once, already settled.
   */
  previous?: number
  total?: number
}

/** Breathing room below the list before it counts as overflowing. */
const BOTTOM_MARGIN = 24

/** The board as it stood a second ago, before this section's points land. */
const HOLD_MS = 1000
/** How long the numbers take to roll up to the new total. */
const COUNT_MS = 1200

/**
 * One ranking list, shared by the public board, the big screen and the player
 * tablets.
 *
 * One column by default. It only splits into two when the stack would run past
 * the bottom of the window - a short board stays a single readable column
 * whatever the screen's orientation.
 *
 * When the rows carry history the list plays the standings as a moment rather
 * than a result: the old order holds for a second, the scores roll up, then the
 * cards slide into their new places. Landing the finished order on screen told
 * nobody what had just happened to them; the move is the news.
 */
export default function Leaderboard({
  title,
  rows,
}: {
  title?: string
  rows: LeaderboardEntry[]
}) {
  const list = useRef<HTMLOListElement | null>(null)
  const [split, setSplit] = useState(false)
  const [stride, setStride] = useState(0)
  const [clock, setClock] = useState(0)

  const withHistory = rows.filter((row) => typeof row.previous === 'number').length
  const animated = rows.length > 1 && withHistory === rows.length

  // The three beats run off one clock, then stop: no animation frames while
  // the board is just sitting there.
  useEffect(() => {
    if (!animated) return
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const spent = now - start
      setClock(spent)
      if (spent < HOLD_MS + COUNT_MS) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [animated, rows])

  // A layout effect, not an effect: the rows have to know their stride before
  // the first paint, or a settled board flashes for a frame before it plays.
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return

    const measure = () => {
      const items = Array.from(element.children) as HTMLElement[]
      if (items.length === 0) {
        setSplit(false)
        return
      }
      const gap = parseFloat(getComputedStyle(items[0]).marginBottom) || 0
      // Stacked height, which does not depend on how many columns are in use.
      const stacked = items.reduce((sum, item) => sum + item.offsetHeight + gap, 0)
      const available = window.innerHeight - element.getBoundingClientRect().top - BOTTOM_MARGIN
      setSplit(stacked > available)
      // One step down the list, for the slide: every row is the same height.
      setStride(items[0].offsetHeight + gap)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [rows])

  // Splitting into columns makes a vertical offset meaningless, so a long board
  // is drawn settled instead.
  const playing = animated && !split && stride > 0
  const counted = playing ? Math.min(1, Math.max(0, (clock - HOLD_MS) / COUNT_MS)) : 1
  const settled = !playing || clock >= HOLD_MS + COUNT_MS

  // Where each player stood before this section. Both orders are stable, so the
  // only thing that moves is where the cards are drawn.
  const beforeIndex = new Map<string, number>()
  if (playing) {
    const before = [...rows].sort((a, b) => (b.previous ?? 0) - (a.previous ?? 0))
    before.forEach((row, at) => beforeIndex.set(row.nickname, at))
  }

  return (
    <div className="ldb">
      {title && <h2 className="ldb__title">{title}</h2>}
      {rows.length === 0 ? (
        <p className="ldb__empty">No scores yet.</p>
      ) : (
        <ol className={`ldb__list${split ? ' ldb__list--split' : ''}`} ref={list}>
          {rows.map((row, at) => {
            const standing = row.total ?? row.score
            const start = row.previous ?? standing
            const shown = Math.round(start + (standing - start) * counted)
            const was = beforeIndex.get(row.nickname)
            const rank = settled || was === undefined ? row.rank : was + 1
            const shift = was === undefined ? 0 : (was - at) * stride
            return (
              <li
                key={row.nickname}
                className={`ldb__row is-rank-${rank}${playing ? ' is-moving' : ''}`}
                style={playing ? { transform: `translateY(${shift}px)` } : undefined}
              >
                <span className="ldb__rank">{rank}</span>
                <span className="ldb__name">{row.nickname}</span>
                <span className="ldb__score">{shown}</span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
