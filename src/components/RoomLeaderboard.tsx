import { useEffect, useState } from 'react'
import { fetchRoomLeaderboard } from '../api'
import Leaderboard, { type LeaderboardEntry } from './Leaderboard'

/**
 * One section's in-game ranking for a room. Fetches the section's scores and
 * renders the shared list. The title is left to the enclosing screen.
 *
 * `total` is the last board of the night, so it is drawn differently: the rows
 * stack up from the bottom rather than arriving as a finished list.
 */
export default function RoomLeaderboard({
  code,
  section,
  me,
}: {
  code: string
  section?: string
  /** The player reading it, so the board can point at their own place. */
  me?: string
}) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    if (!code || !section) return
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

  // The final board plays itself in: last place lands first, then the pile
  // builds upwards until the top three arrive.
  return <Leaderboard rows={rows} pile={section === 'total'} me={me} />
}
