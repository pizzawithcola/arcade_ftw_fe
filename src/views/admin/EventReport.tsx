/**
 * Results per event.
 *
 * A read-only page: it asks the API for one event's numbers and draws them. It
 * has no controls that touch a room, which is deliberate - the point of putting
 * it in the console is that an operator can look at the last event's scores
 * while the current show is running without any way to disturb it.
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
  { key: 'data', label: 'Data Shadow' },
  { key: 'sabotage', label: 'AI Cyber Battle' },
  { key: 'ultimate', label: 'Ultimate' },
]

const BOARD_LIMIT = 20

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

export default function EventReport() {
  const [options, setOptions] = useState<{ events: EventOptionRow[]; latest: string | null }>({
    events: [],
    latest: null,
  })
  const [chosen, setChosen] = useState('')
  const [summary, setSummary] = useState<EventSummary | null>(null)
  const [board, setBoard] = useState<EventLeaderboardRow[]>([])
  const [error, setError] = useState('')

  // The list is its own request: it carries the headcounts the buttons show and
  // the "most recently played" default, neither of which the console has.
  useEffect(() => {
    let live = true
    fetchEventOptions()
      .then((next) => {
        if (live) setOptions(next)
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
        const [nextSummary, nextBoard] = await Promise.all([
          fetchEventSummary(key),
          fetchEventLeaderboard(key, BOARD_LIMIT),
        ])
        if (!live) return
        setSummary(nextSummary)
        setBoard(nextBoard)
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
  }, [key])

  const pick = (next: string) => {
    // The old event's numbers must not sit on screen while the new ones load:
    // they would read as the answer for the event just chosen.
    setSummary(null)
    setError('')
    setChosen(next)
    window.localStorage.setItem(STORE_KEY, next)
  }

  return (
    <section className="admin__panel report">
      <div className="admin__panel-head">
        <h2>Event Results</h2>
        <div className="admin__head-tools">
          <div className="admin__toggle" role="tablist" aria-label="Event">
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

      {error !== '' ? (
        <p className="report__note report__note--error">{error}</p>
      ) : summary === null ? (
        <p className="report__note">Reading the event…</p>
      ) : (
        <>
          <div className="report__cards">
            <Card label="Signed in" value={number(summary.players)} note="players, all time" />
            <Card
              label="Played"
              value={number(summary.scored)}
              note={`${percent(summary.scored_rate)} of them scored`}
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

          <div className="report__split">
            <div className="report__block">
              <h3>Games</h3>
              <div className="report__table-wrap">
                <table className="admin__table">
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th>Players</th>
                      <th>Average</th>
                      <th>Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GAMES.map((game) => {
                      const stat = summary.games[game.key]
                      return (
                        <tr key={game.key}>
                          <td>{game.label}</td>
                          <td>{number(stat?.players ?? 0)}</td>
                          <td>{average(stat?.average ?? 0)}</td>
                          <td>{number(stat?.best ?? 0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="report__block">
              <h3>Sign-ups per day</h3>
              <DayChart days={summary.registrations_per_day} />
            </div>
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
                      {GAMES.map((game) => (
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
                        {GAMES.map((game) => (
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

/** Registrations by day, as bars against the busiest day.
 *
 *  A chart rather than a table because the shape is the point: which day the
 *  room filled up, and whether anyone came back.
 */
function DayChart({ days }: { days: { date: string; count: number }[] }) {
  if (days.length === 0) return <p className="report__note">No sign-ups yet.</p>
  const busiest = Math.max(...days.map((day) => day.count))
  return (
    <ol className="report__days">
      {days.map((day) => (
        <li key={day.date}>
          <span className="report__day-date">{day.date.slice(5)}</span>
          <span className="report__day-track">
            <span
              className="report__day-bar"
              style={{ width: `${Math.max(4, (day.count / busiest) * 100)}%` }}
            />
          </span>
          <span className="report__day-count">{day.count}</span>
        </li>
      ))}
    </ol>
  )
}
