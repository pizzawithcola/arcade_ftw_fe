import { useEffect, useState } from 'react'
import { fetchRoomLeaderboard } from '../api'
import Leaderboard, { type LeaderboardEntry } from './Leaderboard'

/**
 * One section's in-game ranking for a room. Fetches the section's scores and
 * renders the shared list. The title is left to the enclosing screen; the
 * `total` section is still a placeholder until its design lands.
 */
export default function RoomLeaderboard({
  code,
  section,
}: {
  code: string
  section?: string
}) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    if (!code || !section || section === 'total') return
    let live = true
    fetchRoomLeaderboard(code, section)
      .then((board) => {
        if (live) {
          setRows(
            board.map((row) => ({
              rank: row.rank,
              nickname: row.nickname,
              score: row.score,
              previous: row.previous,
              total: row.total,
            })),
          )
        }
      })
      .catch(() => {
        // A transient failure leaves the last board up rather than a blank screen.
      })
    return () => {
      live = false
    }
  }, [code, section])

  if (section === 'total') {
    return <p className="ldb__empty">The final ranking is coming soon.</p>
  }

  return <Leaderboard rows={rows} />
}
