/**
 * Event report: what one event's numbers say, read-only.
 *
 * Nothing here touches a room, a score, a player or which event the boards rank -
 * that last one moved to the console, where the controls that change the audience
 * view live. This page only reads, so an operator can leave it open on a second
 * screen for the whole show and nothing it does can reach the room.
 *
 * Every count comes from the event the players chose at the login screen
 * (`players.event`). The one inferred number is the round count: rooms carry no
 * event, so a round is attributed to whichever event most of its players signed
 * in for. The API says so with `rooms.derived`, and the page repeats it.
 */
import { useEffect, useMemo, useState } from 'react'

import {
  fetchEventLeaderboard,
  fetchEventOptions,
  fetchEventSummary,
  type EventLeaderboardRow,
  type EventOptionRow,
  type EventSummary,
} from '../../api'

import './EventReport.css'

const GAMES: { key: string; label: string }[] = [
  { key: 'hallucination', label: 'Hallucination' },
  { key: 'data', label: 'Data Shadows' },
  { key: 'sabotage', label: 'AI Cyber Battle' },
  { key: 'ultimate', label: 'Ultimate' },
]

/**
 * What a perfect run of each game is worth.
 *
 * Hardcoded from the games' own rules, which is the point: the two that live in
 * the frontend are `perfectScore()` for Ultimate and the 3 x 200 answer cap for
 * Hallucination, and Data Shadow and a solo Sabotage are both 800. A player can
 * still exceed these through a manual score adjustment, so the share is clamped
 * rather than trusted to stay under 100%.
 */
const GAME_MAX: Record<string, number> = {
  hallucination: 600,
  data: 800,
  sabotage: 800,
  ultimate: 600,
}

const BOARD_LIMIT = 10

/**
 * Which event the page opens on.
 *
 * There is no "current event" anywhere in the data - a room carries no event and
 * a player carries the one they picked at login - so the choice is remembered
 * from last time, or else taken from the event that was played most recently.
 * The API answers that second question; guessing "the last one in the list"
 * would open on whichever event was added last, which is the one with no data.
 */
const STORE_KEY = 'arcade_ftw_report_event'

function initialEvent(events: EventOptionRow[], latest: string | null): string {
  const remembered = window.localStorage.getItem(STORE_KEY)
  if (remembered && events.some((option) => option.key === remembered)) return remembered
  if (latest) return latest
  return events.at(-1)?.key ?? ''
}

function number(value: number): string {
  return value.toLocaleString('en-US')
}

/** `1,098.4` - one decimal is the difference between "everyone got about 1100"
 *  and a precision nobody needs. */
function average(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** One row of the cross-event table: the same handful of numbers every event, so
 *  the comparison is read down the columns rather than across two pages. */
interface EventCompared {
  key: string
  label: string
  players: number
  played: number
  average: number
  rounds: number
}

export default function EventReport() {
  const [options, setOptions] = useState<{ events: EventOptionRow[]; latest: string | null }>({
    events: [],
    latest: null,
  })
  const [chosen, setChosen] = useState('')
  const [summary, setSummary] = useState<EventSummary | null>(null)
  const [compared, setCompared] = useState<EventCompared[]>([])
  const [board, setBoard] = useState<EventLeaderboardRow[]>([])
  const [error, setError] = useState('')

  // The list is its own request: it carries the headcounts the buttons show and
  // the "most recently played" default, neither of which the console has.
  useEffect(() => {
    let live = true
    fetchEventOptions()
      .then((next) => {
        if (!live) return
        setOptions(next)
      })
      .catch((problem: unknown) => {
        if (!live) return
        setError(problem instanceof Error ? problem.message : 'Could not read the events.')
      })
    return () => {
      live = false
    }
  }, [])

  const events = options.events
  // The remembered choice is derived rather than written into state from an
  // effect - it is a function of the list, not of an event.
  const fallback = useMemo(() => initialEvent(events, options.latest), [events, options.latest])
  const key = chosen || fallback

  useEffect(() => {
    if (key === '') return
    let live = true

    const load = async () => {
      try {
        // Every event, in one pass: the comparison table is what turns three
        // separate reports into a claim about the show, and it must cover the
        // events that are not on screen. A failed sibling drops its own row
        // rather than the whole page.
        const [nextSummary, nextBoard, siblings] = await Promise.all([
          fetchEventSummary(key),
          fetchEventLeaderboard(key, BOARD_LIMIT),
          Promise.all(
            events.map((option) =>
              fetchEventSummary(option.key)
                .then((other) => ({ option, other }))
                .catch(() => null),
            ),
          ),
        ])
        if (!live) return
        setSummary(nextSummary)
        setBoard(nextBoard)
        setCompared(
          siblings
            .filter((entry) => entry !== null)
            .map(({ option, other }) => ({
              key: option.key,
              label: option.label,
              players: other.players,
              played: other.played,
              average: other.score.average,
              rounds: other.rooms.rounds,
            })),
        )
        setError('')
      } catch (problem) {
        if (!live) return
        setError(problem instanceof Error ? problem.message : 'Could not read the event.')
      }
    }

    void load()
    // Ten seconds: the numbers move when someone signs in or answers, both of
    // which are minutes apart in a venue. A socket would buy nothing here.
    const id = window.setInterval(load, 10_000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [key, events])

  const pick = (next: string) => {
    // The old event's numbers must not sit on screen while the new ones load:
    // they would read as the answer for the event just chosen.
    setSummary(null)
    setError('')
    setChosen(next)
    window.localStorage.setItem(STORE_KEY, next)
  }

  // A game nobody played is a module that was switched off for this event, not a
  // result. A row and a column of zeroes both read as "nobody played this",
  // which is a different and worse claim, so both go.
  const playedGames = summary
    ? GAMES.filter((game) => (summary.games[game.key]?.players ?? 0) > 0)
    : GAMES

  return (
    <section className="admin__panel report">
      <div className="admin__panel-head">
        <h2>Event Report</h2>
        <div className="admin__head-tools">
          <div className="admin__toggle" role="tablist" aria-label="Event to report on">
            {events.map((option) => (
              <button
                key={option.key}
                type="button"
                role="tab"
                aria-selected={option.key === key}
                className={option.key === key ? 'is-active' : ''}
                onClick={() => pick(option.key)}
              >
                {option.label}
                <span className="report__tab-count">{number(option.players)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="report__note report__boards">
        Read-only. Which event the boards rank is set in the console; this page only counts what
        already happened.
      </p>

      {error !== '' ? (
        <p className="report__note report__note--error">{error}</p>
      ) : summary === null ? (
        <p className="report__note">Reading the event…</p>
      ) : (
        <>
          <div className="report__cards">
            <Card label="Registered" value={number(summary.players)} note="players, all time" />
            <Card
              label="Played"
              value={number(summary.played)}
              note={`${percent(summary.played_rate)} of them played · ${number(summary.scored)} scored`}
            />
            <Card
              label="Average"
              value={average(summary.score.average)}
              note={`median ${number(summary.score.median)}`}
            />
            <Card
              label="Best"
              value={number(summary.score.best)}
              note={summary.players ? `lowest ${number(summary.score.lowest)}` : 'nobody scored'}
            />
            <Card
              label="Rounds"
              value={number(summary.rooms.rounds)}
              note={
                summary.rooms.derived
                  ? `inferred · ${number(summary.rooms.average_per_round)} per round`
                  : `${number(summary.rooms.average_per_round)} per round`
              }
            />
            <Card
              label="Joins"
              value={number(summary.rooms.participations)}
              note="player-round entries"
            />
          </div>

          <div className="report__block">
            <h3>
              Games
              <span className="report__hint">average as a share of the perfect run</span>
            </h3>
            <div className="report__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Players</th>
                    <th>Average</th>
                    <th>Best</th>
                    <th>Of max</th>
                  </tr>
                </thead>
                <tbody>
                  {playedGames.map((game) => {
                    const stat = summary.games[game.key]
                    const ceiling = GAME_MAX[game.key] ?? 0
                    // Clamped: a manual score adjustment can push a player past
                    // the game's own ceiling, and a bar over 100% reads as a bug.
                    const share = ceiling > 0 ? Math.min(1, (stat?.average ?? 0) / ceiling) : 0
                    return (
                      <tr key={game.key}>
                        <td>{game.label}</td>
                        <td>{number(stat?.players ?? 0)}</td>
                        <td>{average(stat?.average ?? 0)}</td>
                        <td>{number(stat?.best ?? 0)}</td>
                        <td className="report__share">
                          <span className="report__share-track">
                            <span
                              className="report__share-bar"
                              style={{ width: `${Math.round(share * 100)}%` }}
                            />
                          </span>
                          <span className="report__share-value">{percent(share)}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="report__block">
            <h3>
              Played per day
              <span className="report__hint">of that day&rsquo;s sign-ups</span>
            </h3>
            <DayChart days={summary.registrations_per_day} />
          </div>

          <div className="report__block">
            <h3>
              Events compared
              <span className="report__hint">same questions, three rooms</span>
            </h3>
            {compared.length === 0 ? (
              <p className="report__note">No event has numbers yet.</p>
            ) : (
              <div className="report__table-wrap">
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Registered</th>
                      <th>Played</th>
                      <th>Played %</th>
                      <th>Average</th>
                      <th>Rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compared.map((row) => (
                      <tr key={row.key} className={row.key === key ? 'report__row--current' : ''}>
                        <td>{row.label}</td>
                        <td>{number(row.players)}</td>
                        <td>{number(row.played)}</td>
                        <td>{row.players > 0 ? percent(row.played / row.players) : '—'}</td>
                        <td>{row.average > 0 ? average(row.average) : '—'}</td>
                        <td>{number(row.rounds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="report__block">
            <h3>
              Leaderboard
              <span className="report__hint">
                top {Math.min(BOARD_LIMIT, board.length)} of {number(summary.scored)} who scored
              </span>
            </h3>
            {board.length === 0 ? (
              <p className="report__note">Nobody has scored in this event yet.</p>
            ) : (
              <div className="report__table-wrap">
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nickname</th>
                      <th>Total</th>
                      {playedGames.map((game) => (
                        <th key={game.key}>{game.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((row) => (
                      <tr key={`${row.rank}-${row.nickname}`}>
                        <td className="admin__dim">{row.rank}</td>
                        <td>{row.nickname}</td>
                        <td className="report__total">{number(row.total_score)}</td>
                        {playedGames.map((game) => (
                          <td key={game.key}>{number(row[game.key as keyof EventLeaderboardRow] as number)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="report__note">
            Rounds are counted from who joined each room, because a room does not record its event.
            {summary.rooms.unattributed > 0
              ? ` ${number(summary.rooms.unattributed)} room${
                  summary.rooms.unattributed === 1 ? '' : 's'
                } nobody joined ${summary.rooms.unattributed === 1 ? 'is' : 'are'} left out.`
              : ''}{' '}
            Nothing on this page changes the show.
          </p>
        </>
      )}
    </section>
  )
}

function Card({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="report__card">
      <span className="report__card-label">{label}</span>
      <span className="report__card-value">{value}</span>
      <span className="report__card-note">{note}</span>
    </div>
  )
}

/** Sign-ups by day, as bars against the busiest day.
 *
 *  A chart rather than a table because the shape is the point: which day the
 *  room filled up, and whether anyone came back. The bar is the number who
 *  played, the dim number beside it is that day's sign-ups, so the gap between
 *  arriving and playing is visible without a second chart.
 */
function DayChart({ days }: { days: { date: string; count: number; played: number }[] }) {
  if (days.length === 0) return <p className="report__note">Nobody has played yet.</p>
  // Played can be zero on every day, and 0 / 0 would paint a NaN width.
  const busiest = Math.max(1, ...days.map((day) => day.played))
  return (
    <ol className="report__days">
      {days.map((day) => (
        <li key={day.date}>
          <span className="report__day-date">{day.date.slice(5)}</span>
          <span className="report__day-track">
            <span
              className="report__day-bar"
              style={{ width: `${Math.max(4, (day.played / busiest) * 100)}%` }}
            />
          </span>
          <span className="report__day-count">
            {day.played}
            <span className="report__day-total">/{day.count}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
