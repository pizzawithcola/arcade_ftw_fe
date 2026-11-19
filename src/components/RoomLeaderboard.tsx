import { useEffect, useRef, useState } from 'react'
import { fetchRoomLeaderboard } from '../api'
import Leaderboard, { type LeaderboardEntry } from './Leaderboard'

/**
 * Where each player stood the last time this section's board was drawn.
 *
 * A board inside a round is drawn more than once - the wall shows the standings
 * between every Ultimate question - and each drawing is a fresh mount. The
 * server can only say what a section started from, so without this every
 * question would replay the whole section instead of the points that question
 * just added: 500 → 560 would arrive as 500 → 520, then 500 → 540.
 *
 * Module scope on purpose: a remount has to find the previous drawing's numbers,
 * and the key carries the room and the section so two boards never share a
 * baseline.
 */
const lastStanding = new Map<string, number>()

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
  refreshAfterMs,
}: {
  code: string
  section?: string
  /** The player reading it, so the board can point at their own place. */
  me?: string
  /**
   * Draw the board once more after this long.
   *
   * The wall switches to the standings on the same tick the devices report
   * their answer, so the first fetch can land before the points it is meant to
   * show have been written. One redraw a couple of seconds later settles it;
   * the boards that are a node of their own do not need this.
   */
  refreshAfterMs?: number
}) {
  const [rows, setRows] = useState<LeaderboardEntry[]>([])
  const [redraw, setRedraw] = useState(0)
  /**
   * Where each player stood when this board was drawn, per mount.
   *
   * A board that redraws - the wall fetches once more a couple of seconds in,
   * to catch points written just after it went up - must keep the numbers it
   * promised to animate FROM. Reading the memory back on the redraw made
   * `previous` equal the new total, so the second fetch wiped out the whole
   * story: no roll-up, no reordering, a board that just sat there. The memory
   * itself still moves forward, because the next board needs a baseline.
   */
  const baseline = useRef(new Map<string, number>())

  useEffect(() => {
    if (!refreshAfterMs) return
    const timer = setTimeout(() => setRedraw(1), refreshAfterMs)
    return () => clearTimeout(timer)
  }, [refreshAfterMs])

  useEffect(() => {
    if (!code || !section) return
    let live = true
    fetchRoomLeaderboard(code, section)
      .then((board) => {
        if (!live) return
        setRows(
          board.map((row) => {
            const key = `${code}|${section}|${row.nickname}`
            // The standing before this section, taken from the board that was
            // drawn last. A total that went DOWN is not a reset: a wrong answer
            // costs points, and the board has to show that fall. Treating it as
            // a reset sent the row back to the section's zero baseline, so the
            // third review filled up from nothing while the rest of the room
            // counted from where they stood.
            if (!baseline.current.has(key)) {
              baseline.current.set(key, lastStanding.get(key) ?? row.previous)
            }
            lastStanding.set(key, row.total)
            return {
              rank: row.rank,
              nickname: row.nickname,
              score: row.score,
              previous: baseline.current.get(key),
              total: row.total,
            }
          }),
        )
      })
      .catch(() => {
        // A transient failure leaves the last board up rather than a blank screen.
      })
    return () => {
      live = false
    }
  }, [code, section, redraw])

  // The final board plays itself in: last place lands first, then the pile
  // builds upwards until the top three arrive.
  return <Leaderboard rows={rows} pile={section === 'total'} me={me} />
}
