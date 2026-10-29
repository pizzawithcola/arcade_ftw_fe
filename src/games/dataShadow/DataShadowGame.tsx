import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** One post, one clock. */
const ROUND_SECONDS = 45

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
 * words would emit two nested marks.
 */
function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const merged: Array<{ start: number; end: number }> = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else merged.push({ ...range })
  }
  return merged
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
  const bodyRef = useRef<HTMLDivElement>(null)
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
    return mergeRanges(selections).map((range) => ({
      ...range,
      className: 'is-flagged',
      key: `f-${range.start}-${range.end}`,
    }))
  }, [done, selections, result])

  /** Turn the browser's current selection into a panel entry. */
  const captureSelection = useCallback(() => {
    const container = bodyRef.current
    const selection = window.getSelection()
    if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) return

    const range = selection.getRangeAt(0)
    if (!container.contains(range.commonAncestorContainer)) return

    // Character offsets relative to the post body, which is the same coordinate
    // space the leak anchors were resolved in.
    const prefix = document.createRange()
    prefix.selectNodeContents(container)
    prefix.setEnd(range.startContainer, range.startOffset)
    const rawStart = prefix.toString().length
    const rawText = range.toString()

    const text = rawText.trim()
    if (text.length < MIN_SELECTION_CHARS) return

    // Trimming shifts the start; keep the range aligned with the kept text.
    const leading = rawText.length - rawText.trimStart().length
    const start = rawStart + leading
    const end = start + text.length

    setSelections((current) =>
      current.some((item) => item.start === start && item.end === end)
        ? current
        : [...current, { id: `sel-${seq.current++}`, text, start, end }],
    )
    // Clearing the selection is the feedback that it was taken: the highlight
    // moves from the browser's own selection to the marker in the post.
    selection.removeAllRanges()
    setBubble(null)
  }, [])

  // Park a small button next to the selection, so the next action is where the
  // player is already looking rather than across the screen.
  useEffect(() => {
    // Nothing to attach the bubble to once the report is locked; the render
    // also stops showing it, so the effect just stops listening.
    if (locked) return
    const update = () => {
      const container = bodyRef.current
      const selection = window.getSelection()
      if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setBubble(null)
        return
      }
      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) {
        setBubble(null)
        return
      }
      if (range.toString().trim().length < MIN_SELECTION_CHARS) {
        setBubble(null)
        return
      }
      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        setBubble(null)
        return
      }
      const half = 78
      const x = Math.min(Math.max(rect.left + rect.width / 2, half), window.innerWidth - half)
      // Flip below when the selection is near the top edge, where the bubble
      // would otherwise sit off-screen.
      const below = rect.top < 72
      setBubble({ x, y: below ? rect.bottom + 10 : rect.top - 10, below })
    }
    document.addEventListener('selectionchange', update)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [locked])

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
    <div className="hud hud--game shadow">
      <div className="hud__matrix" aria-hidden="true" />
      <div className="hud__frame">
        <div className="hud__inner">
          <span className="hud__corner hud__corner--tl" aria-hidden="true" />
          <span className="hud__corner hud__corner--tr" aria-hidden="true" />
          <span className="hud__corner hud__corner--bl" aria-hidden="true" />
          <span className="hud__corner hud__corner--br" aria-hidden="true" />

          <div className="hud__tab">Data Shadow</div>

          <div className="hud__bar">
            <span className="hud__chevrons" aria-hidden="true" />
            <span className="hud__event">Find what leaked</span>
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

          <div className={`post__body ${done ? 'is-revealed' : ''}`} ref={bodyRef}>
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

      {!locked && bubble && (
        <button
          type="button"
          className={`bubble ${bubble.below ? 'is-below' : 'is-above'}`}
          style={{ left: bubble.x, top: bubble.y }}
          // Keeping the selection alive is the whole point: a plain tap would
          // collapse it before the click handler runs.
          onPointerDown={(event) => event.preventDefault()}
          onClick={captureSelection}
        >
          ＋ Add to report
        </button>
      )}
    </div>
  )
}
