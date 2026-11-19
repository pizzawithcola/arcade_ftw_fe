import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import './Leaderboard.css'

export interface LeaderboardEntry {
  rank: number
  nickname: string
  /** This section's points. */
  score: number
  /**
   * The player's standing before this section, and what they hold now. Both are
   * optional so a board with no history (the public top ten) still renders:
   * without them the list is drawn once, already settled.
   */
  previous?: number
  total?: number
}

/** The share of the screen the standings may take. A constant, so it cannot
 *  depend on the height it is used to compute. */
const WALL_SHARE = 0.62
/** The smallest the type goes, however short the row gets. 0.9 of natural is
 *  24px names and 25px scores on a 1080p wall - as small as this board can go
 *  and still be read from the back of the room. */
const TYPE_FLOOR = 0.9
/** Nine names fit one column on the wall; a tenth is where two columns start. */
const SINGLE_COLUMN_MAX = 9
/** Breathing room below the list before it counts as overflowing. */
const BOTTOM_MARGIN = 24

/** The board as it stood a moment ago, before this section's points land. */
const HOLD_MS = 500
/**
 * How long the numbers take to roll up to the new total.
 *
 * Longer than the hold on purpose: the room has to be able to watch a place
 * change hands, and 1.2s was over before the eye had found the row. The move
 * that follows is what says who won, so there is no point rushing to it.
 */
const COUNT_MS = 2000
/** How long a row takes to travel from its old place to its new one. */
const SLIDE_MS = 700
/** The same curve the row's own transition declares. */
const SLIDE_EASE = 'cubic-bezier(0.2, 0.9, 0.25, 1)'

/**
 * The final board builds itself as a pile.
 *
 * Last place drops in first, then every place above it lands on the stack and
 * presses it down a little, the way a box does. The top three arrive at the end,
 * each one louder than the last. It is the only board anybody remembers, so it
 * is the only one that gets to be a moment rather than a list.
 */
/** How long a row takes to fall. */
const PILE_FALL_MS = 420
/** Between places below the top three, last place first. */
const PILE_STAGGER_MS = 200
/**
 * Between the top three, which are the ones the room is waiting for.
 *
 * A longer gap is not slowness: it is the pause that makes the third, second
 * and first places three separate moments instead of one list arriving.
 */
const PILE_TOP_STAGGER_MS = 500
const PILE_PRESS_MS = 240
/** How far a landed row is pushed down by the weight above it. */
const PILE_PRESS_PX = 9
/** How far a row falls from. Longer than the gaps between rows, so it reads as a drop. */
const PILE_DROP_PX = 220
/** How long the top three keep glowing after they land. */
const PILE_FLARE_MS = 900
/** How long the top three take to settle from their landing pop. */
const PILE_POP_MS = 520
/** Past this many places a single column no longer fits, so the pile is off. */
const PILE_MAX_ROWS = 10

/**
 * When a place lands, in milliseconds from the start, last place first.
 *
 * Rows are handed over best-first, so the schedule is built from the bottom up:
 * everyone below the podium takes 200ms each, and then the top three take 500ms
 * each. A room of three or fewer is all podium, so it starts at zero rather
 * than after a gap that has nobody in it.
 */
function revealDelay(index: number, count: number) {
  const fromBottom = count - 1 - index
  if (count <= 3) return fromBottom * PILE_TOP_STAGGER_MS
  if (index >= 3) return fromBottom * PILE_STAGGER_MS
  const below = (count - 4) * PILE_STAGGER_MS
  return below + (3 - index) * PILE_TOP_STAGGER_MS
}

/** Where one row of the pile is at `clock` milliseconds in. */
function pileAt(clock: number, index: number, count: number) {
  const since = clock - revealDelay(index, count)
  if (since <= 0) return { y: -PILE_DROP_PX, opacity: 0, landed: false }
  const fall = Math.min(1, since / PILE_FALL_MS)
  // Accelerating, not decelerating: this is a weight being dropped, and an
  // ease-out would slow it down exactly where it should hit hardest.
  const eased = fall * fall
  // Every row that lands above this one presses it down a little further.
  let press = 0
  for (let above = 0; above < index; above += 1) {
    const landedAt = revealDelay(above, count) + PILE_FALL_MS
    const weight = clock - landedAt
    if (weight > 0 && weight < PILE_PRESS_MS) {
      press += PILE_PRESS_PX * (1 - weight / PILE_PRESS_MS)
    }
  }
  return { y: -PILE_DROP_PX * (1 - eased) + press, opacity: fall, landed: fall === 1 }
}

/** The order a board is drawn in before this section's points land. */
function heldOrder(rows: LeaderboardEntry[]) {
  return [...rows].sort((a, b) => {
    const gap = (b.previous ?? 0) - (a.previous ?? 0)
    return gap !== 0 ? gap : a.nickname.localeCompare(b.nickname)
  })
}

type Phase = 'hold' | 'slide' | 'done'

/**
 * One ranking list, shared by the public board, the big screen and the player
 * tablets.
 *
 * One column by default. It only splits into two when the stack would run past
 * the bottom of the window - a short board stays a single readable column
 * whatever the screen's orientation.
 *
 * When the rows carry history the list plays the standings as a moment rather
 * than a result: the old order holds for a second while the scores roll up,
 * then the cards travel into their new places. Landing the finished order on
 * screen told nobody what had just happened to them; the move is the news.
 *
 * The travel is a FLIP - remember where each row is drawn, re-order, draw it
 * back at the old spot, then release it - because a translateY offset only
 * means something in one column. Two columns lay the rows out along two axes,
 * so an offset cannot express "this player moved across the gutter", and the
 * board used to give up on the animation entirely the moment it split.
 * Measured positions work in any layout.
 *
 * The roll-up writes to the DOM instead of to React state: sixteen rows
 * re-rendered sixty times a second is the stutter the wall had.
 */
export default function Leaderboard({
  title,
  rows,
  pile = false,
  me,
}: {
  title?: string
  rows: LeaderboardEntry[]
  /** The last board of the night: build it as a stack instead of a list. */
  pile?: boolean
  /** This device's nickname, so the reader can find themselves in the list. */
  me?: string
}) {
  const board = useRef<HTMLDivElement | null>(null)
  const list = useRef<HTMLOListElement | null>(null)
  const rowEls = useRef(new Map<string, HTMLLIElement>())
  const before = useRef(new Map<string, { left: number; top: number }>())
  const [phase, setPhase] = useState<Phase>('done')
  const [clock, setClock] = useState(0)
  /**
   * When this board's three beats started.
   *
   * A board can be handed new rows halfway through - the wall fetches once more
   * after it goes up, to catch points written a moment too late. Restarting the
   * clock from that render replayed the hold and the count from the top, which
   * read as the board rewinding. One clock per mount: a later fetch changes the
   * numbers being counted towards, never the time already spent.
   */
  const startedAt = useRef<number | null>(null)

  const withHistory = rows.filter((row) => typeof row.previous === 'number').length
  // A pile is a single column by definition, so the final board never splits.
  // Past ten places there is nothing left to stack - the rows alone would not
  // fit - so a very large room falls back to the ordinary list.
  const piling = pile && rows.length > 1 && rows.length <= PILE_MAX_ROWS
  const pileMs =
    rows.length > 0
      ? revealDelay(0, rows.length) + PILE_FALL_MS + PILE_FLARE_MS
      : 0
  const animated = !pile && rows.length > 1 && withHistory === rows.length
  /**
   * One column or two, from the number of names alone.
   *
   * Nine fit one column on the wall; ten do not. Deciding this by MEASURING was
   * the bug that blanked the display: the two-column rule makes rows shorter,
   * the shorter rows then measured as "it fits", going back to one column made
   * them tall again, and the board flipped between the two layouts until React
   * gave up and unmounted the screen. Data in, layout out - one direction only,
   * so there is no loop to have.
   */
  const split = !(pile && piling) && rows.length > SINGLE_COLUMN_MAX

  // The rows on screen right now: the old order while the scores roll, the new
  // one from the moment the board is allowed to move.
  const shownRows = animated && phase === 'hold' ? heldOrder(rows) : rows

  // ── the pile's own clock: three transforms a frame, at most ten rows ───────
  useEffect(() => {
    if (!piling) return
    let frame = 0
    const start = performance.now()
    const step = (now: number) => {
      const spent = now - start
      setClock(spent)
      if (spent < pileMs) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [piling, pileMs, rows])

  // ── the list's beats: hold, then re-order, then let the transition land ────
  useEffect(() => {
    if (!animated) return
    // A resolved fetch is the event this hangs on, and it is not one React can
    // see; the board has to start held or it arrives settled, which is the one
    // thing the whole animation exists to avoid.
    if (startedAt.current === null) {
      startedAt.current = performance.now()
      // oxlint-disable-next-line react/set-state-in-effect
      setPhase('hold')
    }
    const left = Math.max(0, startedAt.current + HOLD_MS + COUNT_MS - performance.now())
    const timer = window.setTimeout(() => setPhase('slide'), left)
    return () => window.clearTimeout(timer)
  }, [animated, rows])

  // ── the roll-up: one animation frame loop, no re-render ────────────────────
  useEffect(() => {
    if (!animated || phase !== 'hold') return
    const leader = Math.max(
      1,
      ...rows.map((row) => Math.max(0, row.total ?? row.score)),
    )
    let frame = 0
    const origin = startedAt.current ?? performance.now()
    const step = (now: number) => {
      const spent = now - origin
      const through = Math.min(1, Math.max(0, (spent - HOLD_MS) / COUNT_MS))
      for (const row of rows) {
        const element = rowEls.current.get(row.nickname)
        if (!element) continue
        const target = row.total ?? row.score
        const from = row.previous ?? target
        const value = Math.round(from + (target - from) * through)
        const score = element.querySelector('.ldb__score')
        if (score && score.textContent !== String(value)) score.textContent = String(value)
        const fill = element.querySelector<HTMLElement>('.ldb__fill')
        if (fill) {
          const share = Math.min(1, Math.max(0, value / leader))
          fill.style.width = `${(share * 100).toFixed(1)}%`
          // A bar of no width still draws its bright right edge, which reads as
          // a score the player does not have. Hidden rather than unmounted: an
          // element that is not there cannot be grown, and every row that
          // started this section on zero - which is every row, on the first
          // question - used to arrive fully drawn instead of filling up.
          fill.style.visibility = share > 0 ? '' : 'hidden'
        }
      }
      if (spent < HOLD_MS + COUNT_MS) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [animated, phase, rows])

  // ── rows short enough for the space the column count left them ─────────────
  // Only the ROW HEIGHT is measured, and never in a way that can feed back: the
  // room comes from the box the board is drawn in (constant), the chrome around
  // the rows is constant, and the answer is written once and quantised. Nothing
  // here can change the column count, which is what used to close the loop.
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return

    const fit = () => {
      const items = Array.from(element.children) as HTMLElement[]
      if (items.length === 0) return
      // Natural size first, so last time's squeeze is not what gets measured.
      element.style.removeProperty('--ldb-row')
      element.style.removeProperty('--ldb-scale')
      element.style.removeProperty('--ldb-fit')
      const gap = parseFloat(getComputedStyle(items[0]).marginBottom) || 0
      const natural = items[0].offsetHeight
      if (natural === 0) return
      const perColumn = Math.ceil(items.length / (split ? 2 : 1))
      const rowsHeight = perColumn * natural + (perColumn - 1) * gap
      // Everything the board draws that is not a row: heading, plate padding,
      // the pad under the last row. Read once, at natural size.
      const whole = board.current
      if (!whole) return
      const chrome = whole.offsetHeight - rowsHeight
      // The budget comes from the SCREEN, never from the board's own box. Every
      // ancestor here is sized by its content, so asking one of them how much
      // room is left answers with the board's current height - which is the
      // circle that blanked the display. The window does not move when rows
      // shrink.
      const usable = window.innerHeight * WALL_SHARE
      const room = (usable - chrome - BOTTOM_MARGIN - (perColumn - 1) * gap) / perColumn
      if (room >= natural) return
      // Below two thirds the type no longer fits the row it is in, and the board
      // clips rather than shrinking further: a floor is what stops this from
      // chasing an impossible height.
      const target = Math.round(Math.max(natural * 0.66, room) * 2) / 2
      if (Math.abs(target - natural) < 0.5) return
      element.style.setProperty('--ldb-row', `${target}px`)
      // The type has to come down with the row, or a squeezed board is a row of
      // the same words in a smaller box: cramped, and no longer centred once the
      // line box is taller than the space around it. It stops at 80% of the
      // natural size - further down the words stop being readable from the back
      // of the room, which is the whole point of the board.
      const fit = target / natural
      element.style.setProperty('--ldb-fit', fit.toFixed(3))
      element.style.setProperty('--ldb-scale', Math.max(fit, TYPE_FLOOR).toFixed(3))
    }

    fit()
    // One more pass on the next frame: the first can land before the plate has
    // been laid out, and a zero height there simply returns. A single extra
    // pass cannot loop - it is not re-armed by the height it writes.
    const frame = requestAnimationFrame(fit)
    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [rows, split, piling, pile])

  // ── where every row stood, just before the board is allowed to move ────────
  useLayoutEffect(() => {
    if (!animated || phase !== 'hold') return
    const spots = new Map<string, { left: number; top: number }>()
    for (const [nickname, element] of rowEls.current) {
      const box = element.getBoundingClientRect()
      spots.set(nickname, { left: box.left, top: box.top })
    }
    // oxlint-disable-next-line react/immutability
    before.current = spots
  }, [animated, phase, shownRows])

  // ── the flip: draw each row back at its old spot, then let it go ──────────
  // Web Animations rather than inline styles: the travel is one transform, it
  // never interacts with React's rendering, and the compositor keeps it.
  useLayoutEffect(() => {
    if (phase !== 'slide') return
    const flights: Animation[] = []
    for (const [nickname, element] of rowEls.current) {
      const from = before.current.get(nickname)
      if (!from) continue
      const to = element.getBoundingClientRect()
      const dx = from.left - to.left
      const dy = from.top - to.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      flights.push(
        element.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0px, 0px)' },
          ],
          { duration: SLIDE_MS, easing: SLIDE_EASE },
        ),
      )
    }
    return () => {
      for (const flight of flights) flight.cancel()
    }
  }, [phase])

  const tight = split || (piling && rows.length > 6)
  const counting = phase === 'hold'
  // Every row's bar is measured against the leader, so the board reads as a
  // spread rather than as a list of numbers.
  const leader = Math.max(
    1,
    ...shownRows.map((row) => Math.max(0, row.total ?? row.score)),
  )
  const mine = me ? rows.find((row) => row.nickname === me) : undefined
  const placed = new Map(shownRows.map((row, at) => [row.nickname, at + 1]))

  return (
    <div
      className={`ldb${piling ? ' ldb--pile' : ''}${split ? ' ldb--wide' : ''}`}
      ref={board}
    >
      {title && <h2 className="ldb__title">{title}</h2>}
      {rows.length === 0 ? (
        <p className="ldb__empty">No scores yet.</p>
      ) : (
        <div className="ldb__frame">
          {/* The plate carries its own light: one edge, two arcs half a turn
              apart, the way a panel reports that it is running. */}
          <span className="ldb__ring" aria-hidden="true" />
          {/* The board is four hundred names long from where the player sits:
              without this line they have to hunt for their own row. */}
          {mine && (
            <p className="ldb__you">
              You are <b>#{mine.rank}</b> of {rows.length}
            </p>
          )}
          <ol
            className={[
              'ldb__list',
              split ? 'ldb__list--split' : '',
              // Two columns, or a pile of more than six, has to give the height
              // back or the last place lands off the bottom of the wall.
              tight ? 'ldb__list--tight' : '',
              phase === 'slide' ? 'ldb__list--flying' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            ref={list}
          >
            {shownRows.map((row, at) => {
              const standing = row.total ?? row.score
              const from = row.previous ?? standing
              // While the old order is on screen the numbers are still rolling:
              // React draws the value they start from and the frame loop above
              // carries them from there.
              const displayed = counting ? from : standing
              const rank = counting ? (placed.get(row.nickname) ?? row.rank) : row.rank
              const share = Math.min(1, Math.max(0, displayed / leader))
              const drop = piling ? pileAt(clock, at, rows.length) : null
              // The top three are the ones the room came to see: they land with
              // a flare, rank one loudest.
              const tier = piling && rank <= 3 ? 4 - rank : 0
              const landedAt = revealDelay(at, rows.length) + PILE_FALL_MS
              const sinceLand = clock - landedAt
              const flare = drop !== null && tier > 0 && drop.landed && sinceLand < PILE_FLARE_MS
              // The three at the top land with weight: a pop that settles, so the
              // room feels the order finally settle rather than read it.
              const pop =
                drop !== null && tier > 0 && sinceLand > 0 && sinceLand < PILE_POP_MS
                  ? 1 + (0.02 + tier * 0.022) * (1 - sinceLand / PILE_POP_MS)
                  : 1
              const style = {
                '--fill': `${(share * 100).toFixed(1)}%`,
                '--row': at,
                '--tier': tier,
                ...(drop
                  ? {
                      transform: `translateY(${drop.y.toFixed(2)}px) scale(${pop.toFixed(3)})`,
                      opacity: drop.opacity,
                    }
                  : {}),
              } as CSSProperties
              return (
                <li
                  key={row.nickname}
                  ref={(element) => {
                    if (element) rowEls.current.set(row.nickname, element)
                    else rowEls.current.delete(row.nickname)
                  }}
                  className={[
                    'ldb__row',
                    `is-rank-${rank}`,
                    counting ? 'is-counting' : '',
                    piling ? 'is-piling' : '',
                    flare ? 'is-flare' : '',
                    row.nickname === me ? 'is-me' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={style}
                >
                  {/* Rendered even at zero width, so the roll-up can grow it:
                      unmounted, it could only appear fully drawn when the
                      count ended. `visibility` hides the one thing a 0% bar
                      still paints, its bright right edge. */}
                  <span
                    className="ldb__fill"
                    aria-hidden="true"
                    style={{ visibility: share > 0 ? undefined : 'hidden' }}
                  />
                  <span className="ldb__rank">{String(rank).padStart(2, '0')}</span>
                  <span className="ldb__name">{row.nickname}</span>
                  <span className="ldb__score">{displayed}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </div>
  )
}
