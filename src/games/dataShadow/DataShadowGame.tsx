import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useScoreReport } from '../../hooks/useScoreReport'
import { BLOCKS, IMAGES, LEAKS, POST_META, POST_TEXT } from './content'
import { ReportKindIcon } from './ReportKindIcon'
import {
  evaluate,
  maxScore,
  MIN_SELECTION_CHARS,
  resolveLeaks,
  targetCount,
  type Evaluation,
  type LeakSpan,
  type Selection,
} from './scoring'
import './DataShadowGame.css'

/**
 * One post, one clock. Fifty seconds was too short to read a paragraph and
 * sweep it for names: the room was still working when the verdict landed.
 * The node's own duration leaves a few seconds of verdict after this.
 */
const ROUND_SECONDS = 80

const BLOCK_OFFSETS: number[] = (() => {
  const offsets: number[] = []
  let cursor = 0
  for (const block of BLOCKS) {
    offsets.push(cursor)
    cursor += block.length
  }
  return offsets
})()

const LEAK_SPANS: LeakSpan[] = resolveLeaks(POST_TEXT, LEAKS)

interface Mark {
  start: number
  end: number
  className: string
  key: string
}

/**
 * Selection ranges can overlap; highlighting needs them disjoint or the same
 * words would emit two nested marks. The range being swept right now wins over
 * one already flagged, so the live gesture stays visible while it happens.
 */
function mergeMarks(marks: Mark[]) {
  const sorted = [...marks].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Mark[] = []
  for (const mark of sorted) {
    const last = merged[merged.length - 1]
    if (last && mark.start <= last.end) {
      last.end = Math.max(last.end, mark.end)
      if (mark.className === 'is-sweeping') last.className = 'is-sweeping'
    } else {
      merged.push({ ...mark })
    }
  }
  return merged
}

/**
 * Every text node under the post, in reading order. Splitting the post into
 * paragraphs and marks never adds characters, so their lengths add up to
 * POST_TEXT - the coordinate space the leak anchors were resolved in.
 */
function textNodesIn(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text)
  return nodes
}

/** Where the finger is, as a caret. WebKit and Blink spell it one way, Gecko
    the other; both are hit tests, so neither needs a text selection to exist. */
function caretAt(x: number, y: number) {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const range = doc.caretRangeFromPoint?.(x, y)
  if (range) return { node: range.startContainer, offset: range.startOffset }
  const position = doc.caretPositionFromPoint?.(x, y)
  return position ? { node: position.offsetNode, offset: position.offset } : null
}

/** A caret's character offset inside the post, or null when it is not in it. */
function charOffsetAt(nodes: Text[], caret: { node: Node; offset: number }): number | null {
  const { node, offset } = caret
  let total = 0
  for (const text of nodes) {
    if (text === node) return total + Math.min(offset, text.length)
    if (node.nodeType === Node.ELEMENT_NODE) {
      // A caret between paragraphs or against a mark resolves to an element:
      // map it onto the first character that boundary points at.
      const child = node.childNodes[offset]
      if (child && (child === text || child.contains(text))) return total
    }
    total += text.length
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    // Past the element's last child, the caret sits at its end.
    let end = 0
    for (const text of nodes) {
      if (!node.contains(text)) break
      end += text.length
    }
    return end
  }
  return null
}

/** The reverse, so the bubble can be parked on the highlight. */
function rangeForOffsets(nodes: Text[], start: number, end: number) {
  const pointAt = (index: number) => {
    let total = 0
    for (const text of nodes) {
      if (index <= total + text.length) return { node: text, offset: index - total }
      total += text.length
    }
    return null
  }
  const from = pointAt(start)
  const to = pointAt(end)
  if (!from || !to) return null
  const range = document.createRange()
  range.setStart(from.node, from.offset)
  range.setEnd(to.node, to.offset)
  return range
}

/**
 * Whitespace at either end is not part of the sweep and can never be a leak.
 * Returns null once the sweep has been dragged back to nothing, which is how
 * taking a highlight off works.
 */
function trimSweep(start: number, end: number) {
  let from = start
  let to = end
  while (from < to && /\s/.test(POST_TEXT[from])) from += 1
  while (to > from && /\s/.test(POST_TEXT[to - 1])) to -= 1
  return to > from ? { start: from, end: to, length: to - from } : null
}

/**
 * The characters a sweep from `anchor` to `head` covers. A caret sits between
 * two characters, so a highlight drawn straight from it stops half a letter
 * short of the fingertip; the head char is included to fix that. Dragging back
 * onto the anchor covers nothing, which is how a sweep is taken off.
 */
function sweepBetween(anchor: number, head: number) {
  if (head === anchor) return null
  const forward = head > anchor
  const from = forward ? anchor : head - 1
  const to = forward ? head + 1 : anchor
  return trimSweep(Math.max(0, from), Math.min(POST_TEXT.length, to))
}

/** A block's text with the given marks wrapped, so highlights render in place. */
function renderBlock(blockIndex: number, marks: Mark[]) {
  const text = BLOCKS[blockIndex]
  const start = BLOCK_OFFSETS[blockIndex]
  const end = start + text.length

  const local = marks
    .filter((mark) => mark.start < end && mark.end > start)
    .map((mark) => ({ ...mark, start: Math.max(mark.start, start), end: Math.min(mark.end, end) }))
    .sort((a, b) => a.start - b.start)

  if (local.length === 0) return [text]

  const parts: Array<string | { text: string; className: string; key: string }> = []
  let cursor = start
  for (const mark of local) {
    if (mark.start > cursor) parts.push(POST_TEXT.slice(cursor, mark.start))
    parts.push({
      text: POST_TEXT.slice(mark.start, mark.end),
      className: mark.className,
      key: mark.key,
    })
    cursor = mark.end
  }
  if (cursor < end) parts.push(POST_TEXT.slice(cursor, end))
  return parts
}

export default function DataShadowGame({
  room,
  nodeIndex,
}: {
  room: string
  nodeIndex: number
}) {
  const [selections, setSelections] = useState<Selection[]>([])
  /** Image ids added to the report, kept apart from text ranges. */
  const [imageFlags, setImageFlags] = useState<string[]>([])
  /** The picture being looked at full size, if any. */
  const [zoomed, setZoomed] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [bubble, setBubble] = useState<{ x: number; y: number; below: boolean } | null>(null)
  /** The range under the finger right now, or the one waiting for its button. */
  const [sweep, setSweep] = useState<{ start: number; end: number } | null>(null)
  const [sweeping, setSweeping] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  /** The anchor the sweep is measured from, for as long as a finger is down. */
  const anchorRef = useRef<number | null>(null)
  /** Mirrors `sweep` for the release handler, which has to read it synchronously. */
  const sweepRef = useRef<{ start: number; end: number } | null>(null)
  const seq = useRef(0)
  const report = useScoreReport(room, nodeIndex)

  const elapsed = useNodeElapsed()
  const timeLeftMs = Math.max(0, ROUND_SECONDS * 1000 - elapsed)
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  const expired = timeLeftMs === 0
  // The result is shown only once the round's clock runs out, so a player who
  // submits early waits for everyone else. `locked` freezes the report once
  // submitted (or once time runs out); `done` is what publishes the verdict.
  const waiting = submitted && !expired
  const locked = submitted || expired
  const done = expired

  const result: Evaluation | null = useMemo(
    () => (done ? evaluate(selections, LEAK_SPANS, POST_TEXT.length, IMAGES, imageFlags) : null),
    [done, selections, imageFlags],
  )

  // The round is scored once, when it is submitted or when its clock runs out.
  // `useScoreReport` makes the second trigger harmless.
  useEffect(() => {
    if (result) report(null, result.score)
  }, [result, report])

  const marks: Mark[] = useMemo(() => {
    if (done) {
      const caught = new Set((result?.caught ?? []).map((leak) => leak.id))
      // A leak can name more than one anchor; both are revealed together, and
      // the key has to carry the offset because the id repeats.
      return LEAK_SPANS.map((leak) => ({
        start: leak.start,
        end: leak.end,
        className: caught.has(leak.id) ? 'is-hit' : 'is-missed',
        key: `${leak.id}-${leak.start}`,
      }))
    }
    // Before submitting, every flagged range is just "you picked this" - showing
    // anything more would leak the answer.
    const flagged = selections.map((item) => ({
      start: item.start,
      end: item.end,
      className: 'is-flagged',
      key: `f-${item.start}-${item.end}`,
    }))
    // A sweep cannot outlive the round: once the report is locked the highlight
    // that was waiting for its button goes with it.
    const live = sweep && !locked ? [{ ...sweep, className: 'is-sweeping', key: 'sweep' }] : []
    return mergeMarks([...flagged, ...live]).map((mark) => ({
      ...mark,
      key: `f-${mark.start}-${mark.end}`,
    }))
  }, [done, locked, selections, result, sweep])

  const showSweep = useCallback((next: { start: number; end: number } | null) => {
    sweepRef.current = next
    setSweep(next)
  }, [])

  /** Where a pointer sits in the post, as a character offset. Null when the
      finger is off the text, which keeps the sweep it already had. */
  const sweepAt = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const container = bodyRef.current
    if (!container) return null
    const caret = caretAt(event.clientX, event.clientY)
    if (!caret || !container.contains(caret.node)) return null
    return charOffsetAt(textNodesIn(container), caret)
  }, [])

  /** Where the button goes: centred on the highlight, flipped below when the
      highlight is near the top edge, and never off the side of the screen. */
  const placeBubble = useCallback((range: { start: number; end: number }) => {
    const container = bodyRef.current
    if (!container) return null
    const domRange = rangeForOffsets(textNodesIn(container), range.start, range.end)
    const rect = domRange?.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) return null
    const half = 78
    const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half)
    const below = rect.top < 72
    return { x, y: below ? rect.bottom + 10 : rect.top - 10, below }
  }, [])

  /** Down anchors the highlighter; a plain tap anchors and releases on the same
      character, which is a sweep of nothing and leaves nothing behind. */
  const onSweepDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (locked || event.button !== 0) return
    const at = sweepAt(event)
    if (at === null) return
    anchorRef.current = at
    // Capture keeps the moves coming when the finger drifts off the paragraph,
    // which is the whole point of a highlighter.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setSweeping(true)
    setBubble(null)
    showSweep(null)
  }

  const onSweepMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const anchor = anchorRef.current
    if (anchor === null) return
    const at = sweepAt(event)
    if (at === null) return
    // Dragging back towards the anchor shortens the highlight, and dragging all
    // the way back cancels it: the sweep is whatever is under the finger now.
    const range = sweepBetween(anchor, at)
    showSweep(range ? { start: range.start, end: range.end } : null)
  }

  const onSweepUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (anchorRef.current === null) return
    anchorRef.current = null
    setSweeping(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Whatever is highlighted when the finger lifts is what the button acts on:
    // re-reading the pointer here would move the end of the highlight by a
    // character and add the comma next to the phrase.
    const range = sweepRef.current
    if (range && range.end - range.start >= MIN_SELECTION_CHARS) {
      setBubble(placeBubble(range))
      return
    }
    showSweep(null)
  }

  const onSweepCancel = () => {
    anchorRef.current = null
    setSweeping(false)
    showSweep(null)
  }

  /** Put the swept words in the report. The highlight then stays, in the
      flagged colour, because that is what it has become. */
  const addSweep = () => {
    const range = sweepRef.current
    if (locked || !range) return
    const text = POST_TEXT.slice(range.start, range.end)
    setSelections((current) =>
      current.some((item) => item.start === range.start && item.end === range.end)
        ? current
        : [...current, { id: `sel-${seq.current++}`, text, start: range.start, end: range.end }],
    )
    showSweep(null)
  }

  // The button only follows the layout it was measured in: scrolling or resizing
  // moves the text out from under it.
  useEffect(() => {
    if (locked) return
    const remeasure = () => {
      const range = sweepRef.current
      setBubble(range ? placeBubble(range) : null)
    }
    window.addEventListener('scroll', remeasure, true)
    window.addEventListener('resize', remeasure)
    return () => {
      window.removeEventListener('scroll', remeasure, true)
      window.removeEventListener('resize', remeasure)
    }
  }, [locked, placeBubble])

  const remove = (id: string) => {
    if (locked) return
    setSelections((current) => current.filter((item) => item.id !== id))
  }

  /** Add or drop a picture from the report. The click target is small and
      separate from the picture itself, so looking at a photo never flags it. */
  const toggleImage = (id: string) => {
    if (locked) return
    setImageFlags((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  const flaggedCount = selections.length + imageFlags.length

  return (
    <div
      className="hud hud--game shadow"
      // Touching anywhere that is not the post or its button drops a sweep that
      // has not been added yet, so a stray highlight never lingers.
      onPointerDownCapture={(event) => {
        const target = event.target as Element | null
        if (target?.closest('.post__body, .bubble')) return
        if (sweepRef.current) showSweep(null)
      }}
    >
      <div className="hud__matrix" aria-hidden="true" />
      <div className="hud__frame shadow__frame">
        <div className="hud__inner shadow__inner">
          <span className="hud__corner hud__corner--tl" aria-hidden="true" />
          <span className="hud__corner hud__corner--tr" aria-hidden="true" />
          <span className="hud__corner hud__corner--bl" aria-hidden="true" />
          <span className="hud__corner hud__corner--br" aria-hidden="true" />

          {/* One row instead of a nameplate plus an event bar: on an iPad the
              post needs every pixel of height, and "find what leaked" was
              saying the same thing as the task line below it. */}
          <div className="shadow__head">
            <span className="hud__chevrons" aria-hidden="true" />
            <div className="hud__tab">Data Shadow</div>
            <div className="shadow__headright">
              {!done ? (
                <span className={`shadow__timer ${secondsLeft <= 10 ? 'is-urgent' : ''}`}>
                  {secondsLeft}s
                </span>
              ) : (
                result && (
                  <span className={`shadow__score ${result.score < 0 ? 'is-bad' : 'is-good'}`}>
                    {result.score > 0 ? '+' : ''}
                    {result.score}
                  </span>
                )
              )}
              <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
            </div>
          </div>

          <div className="hud__stage shadow__stage">
      <div className="shadow__main">
        <p className="shadow__task">
          Drag to select the words that should never have been posted.
        </p>
        {/* The light card is deliberate: it reads instantly as a social network,
            which is the context the player is being asked to judge in. */}
        <article className="post">
          <header className="post__head">
            <span className="post__avatar">{POST_META.initials}</span>
            <span className="post__who">
              <span className="post__name">{POST_META.author}</span>
              <span className="post__headline">{POST_META.headline}</span>
              <span className="post__time">
                {POST_META.ago} · <span className="post__globe">🌐</span>
              </span>
            </span>
          </header>

          <div
            className={`post__body ${done ? 'is-revealed' : ''} ${sweeping ? 'is-sweeping' : ''}`}
            ref={bodyRef}
            onPointerDown={onSweepDown}
            onPointerMove={onSweepMove}
            onPointerUp={onSweepUp}
            onPointerCancel={onSweepCancel}
          >
            {BLOCKS.map((_, index) => (
              <p className="post__para" key={index}>
                {renderBlock(index, marks).map((part, partIndex) =>
                  typeof part === 'string' ? (
                    <span key={`t-${partIndex}`}>{part}</span>
                  ) : (
                    <mark key={part.key} className={`post__mark ${part.className}`}>
                      {part.text}
                    </mark>
                  ),
                )}
              </p>
            ))}
          </div>

          {/* Screenshots leak more than sentences do, so they are judged the
              same way: tap to look at one, and use the corner button to put it
              in the report. The two actions are deliberately separate. */}
          <div className="post__gallery">
            {IMAGES.map((image) => {
              const flagged = imageFlags.includes(image.id)
              const verdict = result
                ? image.weight > 0
                  ? flagged
                    ? 'is-counted'
                    : 'is-missed'
                  : flagged
                    ? 'is-rejected'
                    : ''
                : flagged
                  ? 'is-flagged'
                  : ''
              return (
                <figure className={`post__shot ${verdict}`} key={image.id}>
                  <button
                    type="button"
                    className="post__shotview"
                    onClick={() => setZoomed((current) => (current === image.id ? null : image.id))}
                    aria-label={`${image.alt} — open full size`}
                  >
                    <img className="post__shotimg" src={image.src} alt="" loading="lazy" />
                  </button>
                  <button
                    type="button"
                    className="post__shotflag"
                    disabled={locked}
                    aria-pressed={flagged}
                    aria-label={flagged ? 'Remove picture from report' : 'Add picture to report'}
                    onClick={() => toggleImage(image.id)}
                  >
                    {flagged ? (
                      '✓'
                    ) : (
                      <svg
                        className="post__shoticon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M12 5.4v8.8" />
                        <circle cx="12" cy="18.5" r="1.4" />
                      </svg>
                    )}
                  </button>
                  <figcaption className="post__shotcap">{image.label}</figcaption>
                </figure>
              )
            })}
          </div>

          <footer className="post__foot">
            <span className="post__reactions">
              <span>👍</span>
              <span>❤️</span>
              <span>💡</span>
              <span className="post__count">{POST_META.reactions}</span>
            </span>
            <span className="post__count">{POST_META.comments} comments</span>
          </footer>
        </article>

        {done && result && (
          <section className="shadow__reveal">
            {result.missed.length + result.missedImages.length > 0 ? (
              <>
                <p className="shadow__revealtitle">What you let through</p>
                <ul className="shadow__missed">
                  {result.missed.map((leak) => (
                    <li key={leak.id}>
                      <span className="shadow__missedtext">“{leak.text}”</span>
                      <span className="shadow__why">{leak.why}</span>
                    </li>
                  ))}
                  {result.missedImages.map((image) => (
                    <li key={image.id}>
                      <span className="shadow__missedtext">[{image.label}]</span>
                      <span className="shadow__why">{image.why}</span>
                    </li>
                  ))}
                  {result.rejectedImages.map((image) => (
                    <li key={image.id}>
                      <span className="shadow__missedtext is-safe">[{image.label}] — safe</span>
                      <span className="shadow__why">{image.why}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="shadow__revealtitle is-good">You caught every leak in the post.</p>
            )}
            {expired && !submitted && (
              <p className="shadow__footnote">Time ran out — the report was scored as it stood.</p>
            )}
          </section>
        )}
      </div>

      <aside className="report">
        <header className="report__head">
          <h2 className="report__title">Your report</h2>
          {/* Out of the total to find, so the rail says how much work is left
              rather than just how much has been typed in so far. */}
          <span className="report__count">
            {flaggedCount}
            <span className="report__total">/{targetCount(LEAKS, IMAGES)}</span>
          </span>
        </header>

        <div className="report__list">
          {flaggedCount === 0 && (
            <p className="report__empty">
              Nothing flagged yet. Select a risky phrase, or use ＋ on a picture, then tap the
              button that appears beside the text.
            </p>
          )}
          {selections.map((item) => {
            const verdict = result
              ? result.counted.has(item.id)
                ? 'is-counted'
                : 'is-rejected'
              : ''
            return (
              <div className={`report__item ${verdict}`} key={item.id}>
                <ReportKindIcon kind="text" />
                <span className="report__text">“{item.text}”</span>
                {!locked ? (
                  <button
                    type="button"
                    className="report__remove"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.text}`}
                  >
                    ×
                  </button>
                ) : done ? (
                  <span className="report__mark" aria-hidden="true">
                    {result?.counted.has(item.id) ? '✓' : '✗'}
                  </span>
                ) : null}
              </div>
            )
          })}
          {IMAGES.filter((image) => imageFlags.includes(image.id)).map((image) => {
            const verdict = result
              ? image.weight > 0
                ? 'is-counted'
                : 'is-rejected'
              : ''
            return (
              <div className={`report__item report__item--shot ${verdict}`} key={image.id}>
                <ReportKindIcon kind="image" />
                <span className="report__text">{image.label}</span>
                {!locked ? (
                  <button
                    type="button"
                    className="report__remove"
                    onClick={() => toggleImage(image.id)}
                    aria-label={`Remove ${image.label}`}
                  >
                    ×
                  </button>
                ) : done ? (
                  <span className="report__mark" aria-hidden="true">
                    {image.weight > 0 ? '✓' : '✗'}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>

        <footer className="report__foot">
          {done && result ? (
            <>
              <p className="report__score">
                {result.score > 0 ? '+' : ''}
                {result.score}
              </p>
              <ul className="report__tally">
                <li>{`${result.caught.length + result.caughtImages.length} caught`}</li>
                <li>
                  {`${result.rejected.size + result.rejectedImages.length} false ${
                    result.rejected.size + result.rejectedImages.length === 1
                      ? 'alarm'
                      : 'alarms'
                  }`}
                </li>
                <li>{`${result.missed.length + result.missedImages.length} missed`}</li>
                <li className="report__best">best possible {maxScore(LEAKS, IMAGES)}</li>
              </ul>
            </>
          ) : waiting ? (
            <p className="report__waiting">Waiting for others to answer…</p>
          ) : (
            <>
              <button
                type="button"
                className="report__submit"
                disabled={flaggedCount === 0}
                onClick={() => setSubmitted(true)}
              >
                Submit report
              </button>
            </>
          )}
        </footer>
      </aside>

          </div>
        </div>
      </div>

      {/* Full size, and one tap anywhere closes it: the same gesture that
          opened it. */}
      {/* Portalled to the body: the chassis clips its own overflow, so a fixed
          overlay inside it would be cut off at the frame edge. */}
      {zoomed &&
        createPortal(
          <div
            className="shotzoom"
            role="dialog"
            aria-modal="true"
            onClick={() => setZoomed(null)}
          >
            <figure className="shotzoom__frame">
              <img
                className="shotzoom__img"
                src={IMAGES.find((image) => image.id === zoomed)?.src}
                alt={IMAGES.find((image) => image.id === zoomed)?.alt}
              />
              <figcaption className="shotzoom__hint">tap anywhere to close</figcaption>
            </figure>
          </div>,
          document.body,
        )}

      {/* Both, not either: the button belongs to a sweep, and a sweep that has
          been added no longer has a button. */}
      {!locked && !sweeping && sweep && bubble && (
        <button
          type="button"
          className={`bubble ${bubble.below ? 'is-below' : 'is-above'}`}
          style={{ left: bubble.x, top: bubble.y }}
          // Tapping the button must not start a sweep underneath it, and the
          // highlight it belongs to has to survive the tap.
          onPointerDown={(event) => event.preventDefault()}
          onClick={addSweep}
        >
          ＋ Add to report
        </button>
      )}
    </div>
  )
}
