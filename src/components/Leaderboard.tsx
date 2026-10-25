import './Leaderboard.css'

export interface LeaderboardEntry {
  rank: number
  nickname: string
  score: number
}

/**
 * One ranking list, shared by the public board, the big screen and the
 * player tablets. Portrait reads top-to-bottom; landscape splits into two
 * columns so the board fills a wide display instead of stretching one tall
 * strip down the middle.
 */
export default function Leaderboard({
  title,
  rows,
}: {
  title?: string
  rows: LeaderboardEntry[]
}) {
  return (
    <div className="ldb">
      {title && <h2 className="ldb__title">{title}</h2>}
      {rows.length === 0 ? (
        <p className="ldb__empty">No scores yet.</p>
      ) : (
        <ol className="ldb__list">
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
