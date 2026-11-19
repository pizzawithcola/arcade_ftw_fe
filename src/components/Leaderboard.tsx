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

/** Breathing room below the list before it counts as overflowing. */
const BOTTOM_MARGIN = 24
/** Below this a clipping ancestor has not been laid out yet, so it is no ruler. */
const LAYOUT_FLOOR = 120

/** The board as it stood a second ago, before this section's points land. */
const HOLD_MS = 1000
/** How long the numbers take to roll up to the new total. */
const COUNT_MS = 1200
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
const PILE_FALL_MS = 460
const PILE_STAGGER_MS = 260
const PILE_PRESS_MS = 240
/** How far a landed row is pushed down by the weight above it. */
const PILE_PRESS_PX = 9
/** How long the top three keep glowing after they land. */
const PILE_FLARE_MS = 900
/** How long the top three take to settle from their landing pop. */
const PILE_POP_MS = 520
/** Past this many places a single column no longer fits, so the pile is off. */
const PILE_MAX_ROWS = 10

/** Where one row of the pile is at `clock` milliseconds in. */
function pileAt(clock: number, index: number, count: number) {
  const revealAt = (count - 1 - index) * PILE_STAGGER_MS
  const since = clock - revealAt
  if (since <= 0) return { y: -170, opacity: 0, landed: false }
  const fall = Math.min(1, since / PILE_FALL_MS)
  // Cubic ease-out: heavy on the way down, soft on the landing.
  const eased = 1 - (1 - fall) ** 3
  // Every row above that has already landed is weight on this one.
  let press = 0
  for (let above = 0; above < index; above += 1) {
    const landedAt = (count - 1 - above) * PILE_STAGGER_MS + PILE_FALL_MS
    const weight = clock - landedAt
    if (weight > 0 && weight < PILE_PRESS_MS) {
      press += PILE_PRESS_PX * (1 - weight / PILE_PRESS_MS)
    }
  }
  return { y: -170 * (1 - eased) + press, opacity: fall, landed: fall === 1 }
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
  const [split, setSplit] = useState(false)
  const [phase, setPhase] = useState<Phase>('done')
  const [clock, setClock] = useState(0)

  const withHistory = rows.filter((row) => typeof row.previous === 'number').length
  // A pile is a single column by definition, so the final board never splits.
  // Past ten places there is nothing left to stack - the rows alone would not
  // fit - so a very large room falls back to the ordinary list.
  const piling = pile && rows.length > 1 && rows.length <= PILE_MAX_ROWS
  const pileMs =
    rows.length > 0
      ? (rows.length - 1) * PILE_STAGGER_MS + PILE_FALL_MS + PILE_FLARE_MS
      : 0
  const animated = !pile && rows.length > 1 && withHistory === rows.length

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
    // A fetch that resolves with new rows is the event this hangs on, and it is
    // not one React can see; the board has to start held or it arrives settled,
    // which is the thing the whole animation exists to avoid.
    // oxlint-disable-next-line react/set-state-in-effect
    if (animated) setPhase('hold')
    if (!animated) return
    const timer = window.setTimeout(() => setPhase('slide'), HOLD_MS + COUNT_MS)
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
    const start = performance.now()
    const step = (now: number) => {
      const spent = now - start
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
        }
      }
      if (spent < HOLD_MS + COUNT_MS) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [animated, phase, rows])

  // ── one column or two, and rows short enough to fit either way ─────────────
  // A layout effect, not an effect: the rows have to know their stride before
  // the first paint, or a split board flashes as a single column first.
  //
  // Written straight to the list rather than through state: the height it sets
  // is also the height the next measurement reads, and a state round trip
  // between the two is what makes a board ratchet itself smaller every frame.
  useLayoutEffect(() => {
    const element = list.current
    const observer = new ResizeObserver(() => requestAnimationFrame(measure))
    let watched: Element | null = null

    const measure = () => {
      const items = Array.from(element?.children ?? []) as HTMLElement[]
      if (!element || items.length === 0) {
        setSplit(false)
        return
      }
      element.style.removeProperty('--ldb-row')
      void element.offsetHeight
      const gap = parseFloat(getComputedStyle(items[0]).marginBottom) || 0
      const natural = items[0].offsetHeight
      if (natural === 0) return
      const stacked = items.reduce((sum, item) => sum + item.offsetHeight + gap, 0)
      const listTop = element.getBoundingClientRect().top
      // The box this board is drawn in. A clipping or scrolling ancestor is the
      // real ceiling: the wall has a stage under its header, and whatever stands
      // above the list (the standings heading) is spent from the same budget.
      let clip: Element | null = element.parentElement
      while (clip && clip !== document.body) {
        const overflow = getComputedStyle(clip).overflowY
        if (overflow === 'auto' || overflow === 'hidden' || overflow === 'scroll') break
        clip = clip.parentElement
      }
      if (clip !== watched) {
        watched = clip
        observer.disconnect()
        observer.observe(element)
        if (clip && clip !== document.body) observer.observe(clip)
      }
      // A clipping ancestor that has not been laid out yet reads as a few
      // pixels tall, and squeezing against that turns a short board into a
      // compressed one. Below the threshold the window is the only honest
      // ceiling, and the observer above asks again once the box has a size.
      const fitted = clip && clip !== document.body ? clip.getBoundingClientRect() : null
      const box = fitted && fitted.height >= LAYOUT_FLOOR ? fitted : null
      const ceiling = Math.min(window.innerHeight, box?.bottom ?? window.innerHeight)
      // What sits above the list, read at its natural size in this same pass.
      // It moves a little when the rows shrink - the whole block is centred -
      // so this settles over two or three frames instead of being pinned to a
      // number taken before the heading was on screen.
      const chrome = listTop - (box?.top ?? 0)
      const available = ceiling - ((box?.top ?? 0) + chrome) - BOTTOM_MARGIN
      // The final board is a stack: splitting it would draw two shorter piles.
      // A board too big to stack is not a pile any more, so it may split.
      const columns = pile && piling ? 1 : stacked > available ? 2 : 1
      setSplit(columns === 2)
      // Two columns halve the height; whatever is still over comes out of the
      // rows, so a full room reads as a full room instead of a list whose bottom
      // edge fell off the plate.
      const perColumn = Math.ceil(items.length / columns)
      // What the board has to lose is the difference between everything it draws
      // - the heading above it, the plate, and the padding under the last row -
      // and the box it is drawn in. Measured from the board's own box, both ends
      // are counted by construction, so nothing has to be guessed.
      const whole = board.current
      const over = whole && box
        ? Math.max(
            0,
            whole.getBoundingClientRect().top - box.top + whole.offsetHeight + BOTTOM_MARGIN - box.height,
          )
        : 0
      const room = natural - over / perColumn
      // Below two thirds the type no longer fits the row it is in.
      if (room < natural) {
        element.style.setProperty('--ldb-row', `${Math.max(natural * 0.66, room).toFixed(1)}px`)
      }
    }

    measure()
    if (element) observer.observe(element)
    const onResize = () => requestAnimationFrame(measure)
    window.addEventListener('resize', onResize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [shownRows, pile, piling])

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
              const landedAt = (rows.length - 1 - at) * PILE_STAGGER_MS + PILE_FALL_MS
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
                  {/* A zero-share row gets no bar at all: a 0% bar still draws
                      its bright right edge, which reads as a score it does not
                      have. */}
                  {share > 0 && <span className="ldb__fill" aria-hidden="true" />}
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
