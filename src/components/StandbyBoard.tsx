import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
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
 * Ten, always: a top ten that quietly becomes a top nine is not a top ten, and
 * the tenth name is the one somebody in the room is looking for. When the wall
 * cannot hold ten rows at their natural size the rows give the height instead -
 * the board is measured, the ten are divided into what is left, and the list
 * stays a list of ten from the projector down to a laptop.
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
  const [rowHeight, setRowHeight] = useState<number | null>(null)

  // Ten rows, or ten rows made to fit: the plate's own height minus what the
  // title and the frame spend, divided by the number of places being shown.
  useLayoutEffect(() => {
    const list = listRef.current
    const board = list?.closest('.standby') as HTMLElement | null
    if (!list || !board) return

    const measure = () => {
      const rows = Array.from(list.children) as HTMLElement[]
      if (rows.length === 0) return
      // Read the natural size first, or the squeeze applied last time is what
      // gets measured and the rows ratchet down every frame.
      setRowHeight(null)
      void list.offsetHeight
      const style = getComputedStyle(rows[0])
      const gap = parseFloat(style.marginBottom) || 0
      const natural = rows[0].offsetHeight
      if (natural === 0) return
      // The board's own box is the stable side of this: the frame is sized by
      // its rows, so measuring against it makes the count chase itself.
      const frame = list.closest('.ldb__frame') as HTMLElement | null
      const title = board.querySelector('.standby__title') as HTMLElement | null
      const titleBox = title ? title.offsetHeight + (parseFloat(getComputedStyle(title).marginBottom) || 0) : 0
      const chrome = frame ? frame.offsetHeight - list.offsetHeight : 0
      const room = board.clientHeight - titleBox - chrome
      const needed = rows.length * natural + (rows.length - 1) * gap
      if (needed <= room) return
      // One row's share of what is left: the gaps are kept, the row shrinks.
      const per = (room - (rows.length - 1) * gap) / rows.length
      // Below two thirds the type stops fitting the row it is in, so the plate
      // takes the last of it rather than the numbers going illegible.
      setRowHeight(Math.max(natural * 0.66, per))
    }

    measure()
    const frameId = requestAnimationFrame(measure)
    const observer = new ResizeObserver(() => requestAnimationFrame(measure))
    observer.observe(board)
    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
    }
  }, [rows.length])

  const shown = rows.slice(0, TOP_N)
  // Every bar is measured against the leader, as on every other board.
  const leader = Math.max(1, ...shown.map((row) => Math.max(0, row.score)))

  return (
    <div className="ldb standby">
      {/* The plate needs a name on the wall: between rounds there is no room
          title above it, so a bare list of ten names read as whatever the last
          screen happened to be. */}
      <p className="standby__title">Arcade Leaderboard</p>
      {shown.length === 0 ? (
        <p className="ldb__empty">No scores yet.</p>
      ) : (
        <div className="ldb__frame">
          <span className="ldb__ring" aria-hidden="true" />
          <ol
            className="ldb__list"
            ref={listRef}
            style={rowHeight === null ? undefined : ({ '--standby-row': `${rowHeight}px` } as CSSProperties)}
          >
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
