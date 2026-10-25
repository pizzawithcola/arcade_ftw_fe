import { useEffect, useRef, useState } from 'react'
import './Leaderboard.css'

export interface LeaderboardEntry {
  rank: number
  nickname: string
  score: number
}

/** Breathing room below the list before it counts as overflowing. */
const BOTTOM_MARGIN = 24

/**
 * One ranking list, shared by the public board, the big screen and the player
 * tablets.
 *
 * One column by default. It only splits into two when the stack would run past
 * the bottom of the window - a short board stays a single readable column
 * whatever the screen's orientation.
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

  useEffect(() => {
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

  return (
    <div className="ldb">
      {title && <h2 className="ldb__title">{title}</h2>}
      {rows.length === 0 ? (
        <p className="ldb__empty">No scores yet.</p>
      ) : (
        <ol className={`ldb__list${split ? ' ldb__list--split' : ''}`} ref={list}>
          {rows.map((row) => (
            <li key={row.rank} className={`ldb__row is-rank-${row.rank}`}>
              <span className="ldb__rank">{row.rank}</span>
              <span className="ldb__name">{row.nickname}</span>
              <span className="ldb__score">{row.score}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
