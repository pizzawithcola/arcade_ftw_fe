import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLeaderboard } from '../api'
import Leaderboard, { type LeaderboardEntry } from '../components/Leaderboard'
import './LeaderboardPage.css'

/**
 * The public leaderboard. It hangs on a screen behind the audience, so it is
 * deliberately read-only, unauthenticated and refreshes itself rather than
 * waiting for anyone to press a button.
 */
export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const pull = () => {
      fetchLeaderboard(10)
        .then((board) => {
          if (live) {
            setRows(
              board.map((row) => ({
                rank: row.rank,
                nickname: row.nickname,
                score: row.total_score,
              })),
            )
            setError('')
          }
        })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof Error ? caught.message : String(caught))
        })
    }
    void pull()
    const id = window.setInterval(pull, 5000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <main className="board">
      <header className="board__bar">
        <h1>Leaderboard</h1>
        <Link to="/" className="board__home">
          ← back
        </Link>
      </header>

      {error && <p className="board__error">{error}</p>}

      {rows === null && !error ? (
        <p className="board__empty">Loading…</p>
      ) : (
        <Leaderboard title="Top players" rows={rows ?? []} />
      )}
    </main>
  )
}
