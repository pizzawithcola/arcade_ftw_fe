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
  fetchEventArchive,
  fetchEventLeaderboard,
  fetchEventOptions,
  fetchEventSummary,
  type EventArchive,
  type EventLeaderboardRow,
  type EventOptionRow,
  type EventSummary,
} from '../../api'

import { printAllReports } from './EventReportPrint'

import './EventReport.css'

const GAMES: { key: string; label: string }[] = [
  { key: 'hallucination', label: 'Hallucination' },
  { key: 'data', label: 'Data Shadows' },
  { key: 'sabotage', label: 'AI Cyber Battle' },
  { key: 'ultimate', label: 'Ultimate' },
]

const BOARD_LIMIT = 10

/** The report's own pseudo-event: every event at once. The backend publishes it
 *  as the first row of `/api/events`, and it is not something a player can sign
 *  in for. */
const ALL_KEY = 'all'

/**
 * Which event the page opens on.
 *
 * The remembered choice wins, so an operator who spent the show looking at
 * Singapore comes back to Singapore. With nothing remembered it opens on the
 * all-time summary, which is the view that answers "how did it go" without
 * first deciding which event to look at.
 */
const STORE_KEY = 'arcade_ftw_report_event'

function initialEvent(events: EventOptionRow[]): string {
  const remembered = window.localStorage.getItem(STORE_KEY)
  if (remembered && events.some((option) => option.key === remembered)) return remembered
  if (events.some((option) => option.key === ALL_KEY)) return ALL_KEY
  return events[0]?.key ?? ''
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

/** `949.6 (34%)` - a score and what share of that event it is.
 *
 *  The score keeps the formatter its column always used: a best is a single
 *  score and reads as `2000`, not `2000.0`.
 */
function withShare(
  score: number,
  share: number,
  format: (value: number) => string = average,
): string {
  return `${format(score)} (${Math.round(share)}%)`
}

/** `324.5 / 600` - a score is only meaningful next to what it is out of.
 *
 *  The formatter is a parameter because an average wants one decimal and a best
 *  does not: "600 / 600" is a result, "600.0 / 600" is a measurement.
 */
function fraction(value: number, ceiling: number, format: (value: number) => string): string {
  // The ceiling is always a round number: "800", never "800.0", because a
  // ceiling is a rule rather than a measurement.
  return ceiling > 0 ? `${format(value)} / ${number(ceiling)}` : format(value)
}

export default function EventReport() {
  const [options, setOptions] = useState<{ events: EventOptionRow[]; latest: string | null }>({
    events: [],
    latest: null,
  })
  const [chosen, setChosen] = useState('')
  const [summary, setSummary] = useState<EventSummary | null>(null)
  const [archive, setArchive] = useState<EventArchive | null>(null)
  const [board, setBoard] = useState<EventLeaderboardRow[]>([])
  const [error, setError] = useState('')

  // The list is its own request: it carries the headcounts the tabs show, and the
  // all-time row the page opens on, neither of which the console has.
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
  const fallback = useMemo(() => initialEvent(events), [events])
  const key = chosen || fallback
  // An Arcade 1.0 event, which has its own scale and its own endpoint.
  const archived = events.find((option) => option.key === key)?.source !== undefined

  useEffect(() => {
    if (key === '') return
    let live = true

    const load = async () => {
      try {
        if (archived) {
          const next = await fetchEventArchive(key)
          if (!live) return
          setArchive(next)
          setError('')
          return
        }
        // Every event, in one pass: the comparison table is what turns three
        // separate reports into a claim about the show, and it must cover the
        // events that are not on screen. A failed sibling drops its own row
        // rather than the whole page. Archived events are excluded - they are
        // another product's numbers and there is nothing to compare.
        const nextSummary = await fetchEventSummary(key)
        if (!live) return
        setSummary(nextSummary)
        // The all-time report shows a distribution instead of a board, so it
        // does not ask for one.
        setBoard(
          key === ALL_KEY ? [] : await fetchEventLeaderboard(key, BOARD_LIMIT),
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
  }, [key, events, archived])

  const [printing, setPrinting] = useState(false)

  const download = async () => {
    setPrinting(true)
    try {
      await printAllReports()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not build the report set.')
    } finally {
      setPrinting(false)
    }
  }

  const pick = (next: string) => {
    // The old event's numbers must not sit on screen while the new ones load:
    // they would read as the answer for the event just chosen.
    setSummary(null)
    setArchive(null)
    setError('')
    setChosen(next)
    window.localStorage.setItem(STORE_KEY, next)
  }

  // The all-time report is the only one that spans events, so it is the only one
  // that cuts itself per event instead of per day, and the only one whose board
  // would be a list of everybody at every show.
  const isAll = key === ALL_KEY

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
                {option.tab}
                <span className="report__tab-count">{number(option.players)}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="admin__new-round report__download"
            disabled={printing}
            title="Every report, one A4 page each, in tab order"
            onClick={() => void download()}
          >
            {printing ? 'building…' : 'download'}
          </button>
        </div>
      </div>

      {error !== '' ? (
        <p className="report__note report__note--error">{error}</p>
      ) : archived ? (
        archive === null ? (
          <p className="report__note">Reading the archive…</p>
        ) : (
          <ArchiveReport archive={archive} />
        )
      ) : summary === null ? (
        <p className="report__note">Reading the event…</p>
      ) : (
        <>
          <h3 className="report__title">{summary.event.title}</h3>
          {summary.event.facts && <p className="report__facts">{summary.event.facts}</p>}

          <div className="report__cards">
            <Card label="Registered" value={number(summary.players)} note="players, all time" />
            <Card
              label="Played"
              value={number(summary.played)}
              note={`${percent(summary.played_rate)} of them played · ${number(summary.scored)} scored`}
            />
            <Card
              label="Rounds"
              value={number(summary.rooms.rounds)}
              note={summary.rooms.derived ? 'inferred from who joined' : 'rooms run'}
            />
            {/* People per round, not the running total: the total is what you
                divide to get this, so it belongs in the note. `Size` is how big
                a room got, which is what decides whether the show felt full. */}
            <Card
              label="Size"
              value={
                summary.rooms.rounds ? average(summary.rooms.average_per_round) : '—'
              }
              note={
                summary.rooms.rounds
                  ? `${number(summary.rooms.participations)} entries over ${number(
                      summary.rooms.rounds,
                    )} round${summary.rooms.rounds === 1 ? '' : 's'}`
                  : 'no room has been opened'
              }
            />
            {/* The share in brackets is what makes the number comparable across
                events: 949.6 means nothing until you know a perfect run was
                2,800 in Hong Kong and 2,000 in Singapore. */}
            <Card
              label="Average"
              value={withShare(summary.score.average, summary.score.average_share)}
              note={`median ${number(summary.score.median)}`}
            />
            <Card
              label="Best"
              value={withShare(summary.score.best, summary.score.best_share, number)}
              note={summary.players ? `lowest ${number(summary.score.lowest)}` : 'nobody scored'}
            />
          </div>

          <div className="report__block">
            <h3>
              {isAll ? 'Played per event' : 'Played per day'}
              <span className="report__hint">
                {/* Inside a JS string, so the apostrophe is a character, not an
                    entity: `&rsquo;` would print itself. */}
                {isAll ? 'of each event’s sign-ups' : 'of that day’s sign-ups'}
              </span>
            </h3>
            <div className="report__chart">
              {isAll && summary.by_event ? (
                <BarList
                  rows={summary.by_event.map((row) => ({
                    label: row.short,
                    value: row.played,
                    ghost: row.players,
                    note: `of ${number(row.players)}`,
                  }))}
                />
              ) : (
                <DayBars days={summary.registrations_per_day} />
              )}
            </div>
          </div>

          <div className="report__block">
            <h3>
              Games
              <span className="report__hint">
                {isAll
                  ? 'average per event, out of what the round is worth'
                  : 'average and best out of what the round is worth'}
              </span>
            </h3>
            {isAll && summary.by_event ? (
              <GamesMatrix summary={summary} />
            ) : (
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
                  {playedGames.map((game) => {
                    const stat = summary.games[game.key]
                    // The ceiling rides with the number: an average of 324.5
                    // says nothing until the reader knows the round is worth
                    // 600, and a separate column meant reading across two cells
                    // to answer one question.
                    const ceiling = stat?.max ?? 0
                    return (
                      <tr key={game.key}>
                        <td>{game.label}</td>
                        <td>{number(stat?.players ?? 0)}</td>
                        <td>{fraction(stat?.average ?? 0, ceiling, average)}</td>
                        <td>{fraction(stat?.best ?? 0, ceiling, number)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>

          {/* The all-time report drops the board and shows the shape of the
              scores instead. A top ten of three shows combined is a list of
              names nobody can act on; the distribution says whether the game
              separated anyone at all, which is the question a report is for. */}
          {isAll ? (
            <div className="report__block">
              <h3>
                Score distribution
                <span className="report__hint">
                  {number(summary.played)} who played, by share of what their event could score
                </span>
              </h3>
              <div className="report__chart">
                <BarList
                  rows={summary.distribution.map((band) => ({
                    label: band.label,
                    value: band.count,
                  }))}
                />
              </div>
              <p className="report__note report__hint">
                0 is its own band: answered something and scored nothing is a finding, not the
                bottom of a range. Shares are taken against each event&rsquo;s own ceiling - Hong Kong
                ran four games, Singapore three, so a perfect night was worth 2,800 in one place and
                2,000 in the other.
              </p>
            </div>
          ) : (
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

          )}
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

/** Label, bar, value, note - the shape every simple bar chart on this page uses.
 *
 *  `ghost` is the denominator drawn behind the bar (sign-ups behind played, for
 *  instance) so the gap is visible without a second series.
 */
function BarList({
  rows,
}: {
  rows: { label: string; value: number; ghost?: number; note?: string }[]
}) {
  if (rows.length === 0) return <p className="report__note">Nothing to draw yet.</p>
  const busiest = Math.max(1, ...rows.map((row) => row.ghost ?? row.value))
  return (
    <ul className="report__bars">
      {rows.map((row) => (
        <li key={row.label}>
          <span className="report__bar-date">{row.label}</span>
          <span className="report__bar-track">
            <span
              className="report__bar-ghost"
              style={{ width: `${Math.max(2, ((row.ghost ?? row.value) / busiest) * 100)}%` }}
            />
            <span
              className="report__bar-fill"
              style={{ width: `${Math.max(2, (row.value / busiest) * 100)}%` }}
            />
          </span>
          <span className="report__bar-value">{number(row.value)}</span>
          <span className="report__bar-note">{row.note ?? ''}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The all-time Games table: one column per event beside the total.
 *
 * A single "Average" column on a report that spans three shows answers nothing -
 * the reader cannot tell whether 324 came from one event or is an average of
 * three. Putting the events side by side is the comparison the summary exists
 * for, and it costs no extra request: the same rows are already in hand.
 */
function GamesMatrix({ summary }: { summary: EventSummary }) {
  const events = summary.by_event ?? []
  // Only games somebody played, here or at any event in the summary: a row of
  // dashes and zeroes would read as "nobody played this", which is a worse claim
  // than "this module was not switched on".
  const games = GAMES.filter(
    (game) =>
      (summary.games[game.key]?.players ?? 0) > 0 ||
      events.some((row) => (row.games[game.key]?.players ?? 0) > 0),
  )
  return (
    <div className="report__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th>Game</th>
            <th>Total Avg</th>
            {events.map((row) => (
              <th key={row.key}>{row.short} Avg</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {games.map((game) => {
            const ceiling = summary.games[game.key]?.max ?? 0
            return (
              <tr key={game.key}>
                <td>{game.label}</td>
                <td>{fraction(summary.games[game.key]?.average ?? 0, ceiling, average)}</td>
                {events.map((row) => {
                  const stat = row.games[game.key]
                  // A dash, not a zero: nobody at that show reached this game,
                  // which is not the same as everyone scoring nothing.
                  return (
                    <td key={row.key}>
                      {(stat?.players ?? 0) > 0 ? fraction(stat.average, ceiling, average) : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * One row per day, bar scaled to the busiest day.
 *
 * Horizontal on purpose: a day is a label followed by a length, and reading
 * "11-18 ▇▇▇▇▇ 240" down the page beats reading it off a column - it also keeps
 * the block short enough to sit in half a console beside the pie without
 * growing the row and pushing the rest of the report off the screen.
 *
 * Where a day has a `played` count, the dim track behind the solid bar is that
 * day's sign-ups, so the gap between arriving and playing is visible without a
 * second chart.
 */
function DayBars({ days }: { days: { date: string; count: number; played?: number }[] }) {
  if (days.length === 0) return <p className="report__note">No days to draw yet.</p>
  // A day where nobody played would make 0 / 0 a NaN width.
  const busiest = Math.max(1, ...days.map((day) => day.played ?? day.count))
  return (
    <ul className="report__bars">
      {days.map((day) => {
        const solid = day.played ?? day.count
        const ghost = day.played === undefined ? solid : day.count
        return (
          <li key={day.date}>
            <span className="report__bar-date">{day.date.slice(5)}</span>
            <span className="report__bar-track">
              <span
                className="report__bar-ghost"
                style={{ width: `${Math.max(2, (ghost / busiest) * 100)}%` }}
              />
              <span
                className="report__bar-fill"
                style={{ width: `${Math.max(2, (solid / busiest) * 100)}%` }}
              />
            </span>
            <span className="report__bar-value">{number(solid)}</span>
            <span className="report__bar-note">
              {day.played === undefined ? '' : `of ${number(day.count)}`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A pie of one categorical breakdown, drawn with conic-gradient.
 *
 * No chart library: the whole chart is one CSS gradient plus a legend, and a
 * dependency to draw seven wedges would be more code to keep current than the
 * twenty lines here. The palette is one tint ramp off the brand colour so the
 * wedges stay distinct in both themes without a hardcoded set of hexes.
 */
/**
 * Categorical wedges need distinguishable colours, and a ramp of one red cannot
 * do that - by the fourth slice the reader is guessing which tint is which. So
 * the palette steps off the brand for the wedges only: the page stays 60% black,
 * 30% white and 10% red, and the pie is the one place allowed to spend other
 * hues, because the alternative is a chart nobody can decode.
 */
const PIE_COLOURS = [
  'var(--report-pie-1)',
  'var(--report-pie-2)',
  'var(--report-pie-3)',
  'var(--report-pie-4)',
  'var(--report-pie-5)',
  'var(--report-pie-6)',
  'var(--report-pie-7)',
  'var(--report-pie-8)',
]

function Pie({ slices }: { slices: { label: string; value: number }[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  if (total === 0) return <p className="report__note">Nothing to break down yet.</p>

  // Largest first: the wedge order should follow the eye, not the JSON.
  const ordered = [...slices].sort((a, b) => b.value - a.value)
  const colour = (at: number) => PIE_COLOURS[at % PIE_COLOURS.length]

  // Cumulative edges first, so the gradient is built from values rather than
  // from a running total mutated inside a map.
  const edges = ordered.reduce<number[]>((acc, slice) => [...acc, (acc.at(-1) ?? 0) + slice.value], [0])
  const stops = ordered.map(
    (_, at) => `${colour(at)} ${(edges[at] / total) * 100}% ${(edges[at + 1] / total) * 100}%`,
  )

  return (
    <div className="report__pie">
      <span
        className="report__pie-disc"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
        role="img"
        aria-label={ordered.map((slice) => `${slice.label} ${slice.value}`).join(', ')}
      />
      <ul className="report__legend">
        {ordered.map((slice, at) => (
          <li key={slice.label}>
            <span className="report__legend-dot" style={{ background: colour(at) }} />
            <span className="report__legend-label">{slice.label}</span>
            <span className="report__legend-n">{number(slice.value)}</span>
            <span className="report__legend-pct">{percent(slice.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * An event that ran on Arcade 1.0, shown on its own terms.
 *
 * Nothing here is comparable with the live report above it: five games scored
 * out of 100 instead of four sections worth 600/800/800/600, a total near 500
 * instead of 2800, and a top ten instead of a full board. The page says so at the
 * top rather than letting the numbers be added up wrongly.
 */
function ArchiveReport({ archive }: { archive: EventArchive }) {
  const { headline } = archive
  const answersPerRound =
    headline.rounds > 0 ? average(headline.answers / headline.rounds) : '—'
  return (
    <>
      <h3 className="report__title">{archive.title}</h3>
      <p className="report__note report__archive">{archive.tagline}</p>

      <div className="report__cards">
        <Card
          label="Participants"
          value={number(headline.participants)}
          note="signed in, Arcade 1.0"
        />
        <Card
          label="Played"
          value={number(headline.active_players)}
          note={`${percent(
            headline.participants > 0 ? headline.active_players / headline.participants : 0,
          )} of them played`}
        />
        <Card label="Countries" value={number(headline.countries)} note="on the sign-in form" />
        <Card label="Rounds" value={number(headline.rounds)} note="Ultimate Showdown rooms" />
        <Card
          label="Answers"
          value={number(headline.answers)}
          note={`${answersPerRound} per round · ${number(headline.round_players)} players`}
        />
        <Card
          label="Best"
          value={number(archive.leaderboard[0]?.total_score ?? 0)}
          note="of about 500"
        />
      </div>

      <div className="report__pair">
        <div className="report__block">
          <h3>
            Countries
            <span className="report__hint">{number(headline.countries)} on the sign-in form</span>
          </h3>
          <div className="report__chart">
            <Pie
              slices={archive.countries.map((country) => ({
                label: country.region,
                value: country.count,
              }))}
            />
          </div>
        </div>

        <div className="report__block">
          <h3>
            Registrations per day
            <span className="report__hint">{number(headline.participants)} in total</span>
          </h3>
          {/* The 1.0 export counts sign-ups only, so these bars have no
              "played" series to draw inside them. */}
          <div className="report__chart">
            <DayBars days={archive.registrations_per_day} />
          </div>
        </div>
      </div>

      <div className="report__block">
        <h3>
          Games
          <span className="report__hint">
            how many of the 1.0 players met it · scores are out of 100
          </span>
        </h3>
        <div className="report__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Game</th>
                <th>Players</th>
                <th>Average</th>
                <th>Best</th>
                <th>Of played</th>
              </tr>
            </thead>
            <tbody>
              {archive.games.map((game) => {
                const share =
                  headline.active_players > 0 ? game.players / headline.active_players : 0
                return (
                  <tr key={game.key}>
                    <td>{game.label}</td>
                    <td>{number(game.players)}</td>
                    <td>{average(game.average)}</td>
                    <td>{number(game.best)}</td>
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

      {/* The two shapes that answer "who came" and "when": a pie shows how
          lopsided the audience was, and columns show which day carried the show.
          Side by side because they are read together. */}
      <div className="report__block">
        <h3>
          Leaderboard
          <span className="report__hint">{archive.leaderboard_note}</span>
        </h3>
        <div className="report__table-wrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Nickname</th>
                <th>Name</th>
                <th>Country</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {archive.leaderboard.map((row) => (
                <tr key={`${row.rank}-${row.nickname}`}>
                  <td className="admin__dim">{row.rank}</td>
                  <td>{row.nickname}</td>
                  <td>{row.name}</td>
                  <td className="admin__dim">{row.region}</td>
                  <td className="report__total">{average(row.total_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
