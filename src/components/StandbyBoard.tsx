import { useEffect, useState } from 'react'
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

  const shown = rows.slice(0, TOP_N)
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
          <div className="ldb__legend standby__legend" aria-hidden="true">
            <div className="standby__legendcol">
              <span>rank</span>
              <span>player</span>
              <span>score</span>
            </div>
          </div>
          <ol className="ldb__list">
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
