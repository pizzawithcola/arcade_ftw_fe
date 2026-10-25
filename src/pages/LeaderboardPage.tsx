import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLeaderboard, type LeaderboardRow } from '../api'
import './LeaderboardPage.css'

/**
 * The public leaderboard. It hangs on a screen behind the audience, so it is
 * deliberately read-only, unauthenticated and refreshes itself rather than
 * waiting for anyone to press a button.
 */
export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const pull = () => {
      fetchLeaderboard(10)
        .then((board) => {
          if (live) {
            setRows(board)
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
      ) : rows !== null && rows.length === 0 ? (
        <p className="board__empty">No scores yet.</p>
      ) : (
        <ol className="board__list">
          {rows?.map((row) => (
            <li key={row.rank} className={`board__row is-rank-${row.rank}`}>
              <span className="board__rank">{row.rank}</span>
              <span className="board__name">{row.nickname}</span>
              <span className="board__score">{row.total_score}</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
