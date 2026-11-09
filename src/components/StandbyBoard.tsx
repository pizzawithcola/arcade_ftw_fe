import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchLeaderboard } from '../api'

/**
 * The wall between rounds, before the next room exists.
 *
 * There is no room to rank, so this is the public board: the best players of
 * the event so far. It is drawn with the leaderboard's own classes rather than a
 * copy of them, so the plate, the row and the meter are the same objects the
 * room has been reading all night.
 *
 * Two columns, filled top to bottom and then across, which is what a ranking
 * looks like on a screen that is wider than it is tall. How many rows are shown
 * is measured, not guessed: the plate takes the height the stage gives it, and
 * the list shows as many whole rows as fit.
 */

/** Topped up to this many names, so a tall screen has enough to fill both. */
const FETCH_LIMIT = 20

/** Never fewer than a top three, however short the screen. */
const MIN_ROWS = 3

export default function StandbyBoard() {
  const [rows, setRows] = useState<{ rank: number; nickname: string; score: number }[]>([])
  const [capacity, setCapacity] = useState(FETCH_LIMIT)
  const list = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    let live = true
    const pull = () =>
      fetchLeaderboard(FETCH_LIMIT)
        .then((board) => {
          if (!live) return
          setRows(
            board.map((row) => ({
              rank: row.rank,
              nickname: row.nickname,
              score: row.total_score,
            })),
          )
        })
        .catch(() => {
          // The board is scenery here: a blip leaves the last list up.
        })
    void pull()
    const id = window.setInterval(() => void pull(), 5000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [])

  // How many whole rows the plate can hold, in two columns.
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return
    const measure = () => {
      const item = element.children[0] as HTMLElement | undefined
      if (!item) return
      const gap = parseFloat(getComputedStyle(item).marginBottom) || 0
      const rowHeight = item.offsetHeight + gap
      if (rowHeight <= 0) return
      // The plate is no longer stretched to the stage: it is as tall as its rows
      // and centres in the stage, so the height to divide up is the stage minus
      // the chrome the plate always carries (rail, live tag, legend).
      const plate = element.parentElement
      const stage = plate?.parentElement
      const chrome = plate && stage ? plate.offsetHeight - element.offsetHeight : 0
      const available = stage ? Math.max(0, stage.clientHeight - chrome) : 0
      const perColumn = Math.max(1, Math.floor(available / rowHeight))
      setCapacity(Math.max(MIN_ROWS, perColumn * 2))
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

  const shown = rows.slice(0, capacity)
  // Every bar is measured against the leader, as on every other board.
  const leader = Math.max(1, ...shown.map((row) => Math.max(0, row.score)))

  return (
    <div className="ldb standby">
      <div className="ldb__rail" aria-hidden="true" />
      {shown.length === 0 ? (
        <p className="ldb__empty">No scores yet.</p>
      ) : (
        <div className="ldb__frame">
          <p className="ldb__live">
            <span className="ldb__pulse" aria-hidden="true" />
            Top players
          </p>
          {/* One legend a column, in the row's own grid: a single line across
              both columns would put "score" over the middle of the board. */}
          <div className="ldb__legend standby__legend" aria-hidden="true">
            {[0, 1].map((column) => (
              <div className="standby__legendcol" key={column}>
                <span>rank</span>
                <span>player</span>
                <span>score</span>
              </div>
            ))}
          </div>
          <ol className="ldb__list ldb__list--split" ref={list}>
            {shown.map((row) => (
              <li key={`${row.rank}-${row.nickname}`} className="ldb__row">
                <span
                  className="ldb__fill"
                  aria-hidden="true"
                  style={{ '--fill': `${Math.round((row.score / leader) * 100)}%` } as React.CSSProperties}
                />
                <span className="ldb__rank">{String(row.rank).padStart(2, '0')}</span>
                <span className="ldb__name">{row.nickname}</span>
                <span className="ldb__score">{row.score}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
