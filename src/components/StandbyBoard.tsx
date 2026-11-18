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
 * One column, top ten. It used to be two columns filled to whatever height the
 * plate had, which made "how am I doing" a matter of looking in the right half;
 * a single readable ten is the answer a room actually asks for.
 *
 * Ten is the ceiling, not the promise: the wall is 16:9, a laptop is not, and
 * the row height is in rem. So the list is capped to what the plate can hold at
 * the size it is being drawn - measured, because a fixed ten ran off the bottom
 * of the screen as soon as the window was shorter than the projector.
 */

/** The board is a top ten: read as one list, compared by eye. */
const TOP_N = 10

export default function StandbyBoard() {
  const [rows, setRows] = useState<{ rank: number; nickname: string; score: number }[]>([])

  useEffect(() => {
    let live = true
    const pull = () =>
      fetchLeaderboard(TOP_N)
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

  const listRef = useRef<HTMLOListElement | null>(null)
  const [cap, setCap] = useState(TOP_N)

  // How many rows fit: the plate's height minus the live line and the legend,
  // divided by one row's own height. Read off the DOM rather than guessed from
  // the viewport, because the row is sized in rem and the padding is not.
  useLayoutEffect(() => {
    const list = listRef.current
    const board = list?.closest('.standby') as HTMLElement | null
    if (!list || !board) return
    const measure = () => {
      // The board's own box, never the frame's: the frame is content-sized, so
      // measuring against it is circular - fewer rows made a shorter frame,
      // which fitted fewer rows, until the list collapsed to one.
      const frame = list.closest('.ldb__frame') as HTMLElement | null
      const first = list.querySelector('.ldb__row') as HTMLElement | null
      // Height *plus* the gap under it: the row's own box leaves out its margin,
      // and ten rows' worth of margin is most of a row at this size. The last
      // row needs no gap under it, so the division adds one back.
      const rowStyle = first ? getComputedStyle(first) : null
      const gap = rowStyle ? parseFloat(rowStyle.marginBottom) || 0 : 0
      const rowH = first ? first.offsetHeight + gap : 0
      if (!frame || rowH === 0) return
      // What the plate spends before the first row: the frame's own box (border,
      // padding, the live line and the legend) minus the list. Measured this way
      // it does not move when the row count does, so the count cannot chase
      // itself down.
      // Everything the board spends before the rows: the frame's own box minus
      // the list, plus any sibling above the frame (the title).
      const siblings = [...board.children]
        .filter((child) => child !== frame)
        .reduce((sum, child) => {
          const style = getComputedStyle(child as HTMLElement)
          return (
            sum +
            (child as HTMLElement).offsetHeight +
            (parseFloat(style.marginTop) || 0) +
            (parseFloat(style.marginBottom) || 0)
          )
        }, 0)
      const overhead = frame.offsetHeight - list.offsetHeight + siblings
      const room = Math.max(
        1,
        Math.floor((board.clientHeight - overhead + gap) / rowH),
      )
      setCap((current) => {
        const next = Math.min(TOP_N, room)
        return next === current ? current : next
      })
    }
    // Once now, then again on the next frame: the first pass can land before the
    // plate has its final height, and a single low reading would stick - the
    // board itself never resizes again, so nothing would ask it to recount.
    measure()
    const frameId = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(board)
    observer.observe(list)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [rows.length])

  const shown = rows.slice(0, cap)
  // Every bar is measured against the leader, as on every other board.
  const leader = Math.max(1, ...shown.map((row) => Math.max(0, row.score)))

  return (
    <div className="ldb standby">
      <div className="ldb__rail" aria-hidden="true" />
      {/* The plate needs a name on the wall: between rounds there is no room
          title above it, so a bare list of ten names read as whatever the last
          screen happened to be. */}
      <p className="standby__title">Arcade Leaderboard</p>
      {shown.length === 0 ? (
        <p className="ldb__empty">No scores yet.</p>
      ) : (
        <div className="ldb__frame">
          <p className="ldb__live">
            <span className="ldb__pulse" aria-hidden="true" />
            Top players
          </p>
          <div className="ldb__legend standby__legend" aria-hidden="true">
            <div className="standby__legendcol">
              <span>rank</span>
              <span>player</span>
              <span>score</span>
            </div>
          </div>
          <ol className="ldb__list" ref={listRef}>
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
