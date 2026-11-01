import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useScoreReport } from '../../hooks/useScoreReport'
import { BLOCKS, IMAGES, LEAKS, POST_META, POST_TEXT } from './content'
import { ReportKindIcon } from './ReportKindIcon'
import {
  evaluate,
  maxScore,
  resolveLeaks,
  targetCount,
  type Evaluation,
  type LeakSpan,
  type Selection,
} from './scoring'
import './DataShadowGame.css'

/**
 * One post, one clock.
 *
 * The post is now read a paragraph at a time - a tap flags the whole paragraph,
 * not a drag over a few words - so the round is fifty seconds instead of eighty:
 * there is nothing left to aim at, only something to decide. The node's own
 * duration leaves ten seconds of verdict after this.
 */
const ROUND_SECONDS = 50

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

/** The character range one paragraph occupies in `POST_TEXT`. */
function blockRange(index: number) {
  const start = BLOCK_OFFSETS[index] ?? 0
  const raw = BLOCKS[index] ?? ''
  // Trailing whitespace belongs to no paragraph, and a range that ended on it
  // would read as a longer selection than the player made.
  const text = raw.trim()
  const lead = raw.length - raw.trimStart().length
  return { start: start + lead, end: start + lead + text.length, text }
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

  /** How a paragraph should be drawn: flagged, revealed right, or revealed wrong.
   *
   * The reveal is per paragraph now, because the choice was per paragraph: a
   * paragraph that held a leak nobody flagged is amber whatever else it said.
   */
  const verdictFor = (index: number) => {
    const here = blockRange(index)
    const flagged = selections.some((item) => item.start === here.start)
    if (!done) return flagged ? 'is-flagged' : ''
    const inside = LEAK_SPANS.filter((leak) => leak.start < here.end && leak.end > here.start)
    const caught = new Set((result?.caught ?? []).map((leak) => leak.id))
    if (inside.some((leak) => !caught.has(leak.id))) return 'is-missed'
    if (flagged) return 'is-hit'
    return ''
  }

  const isFlagged = (index: number) => {
    const here = blockRange(index)
    return selections.some((item) => item.start === here.start)
  }

  /** Tap a paragraph to put it in the report, tap it again to take it out. */
  const toggleBlock = (index: number) => {
    if (locked) return
    const here = blockRange(index)
    setSelections((current) =>
      current.some((item) => item.start === here.start)
        ? current.filter((item) => item.start !== here.start)
        : [...current, { id: `sel-${seq.current++}`, text: here.text, start: here.start, end: here.end }],
    )
  }

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
          Tap a paragraph that should never have been posted.
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

          {/* One button per paragraph. A whole paragraph is the unit of the
              decision now: no aiming, no handles, and nothing the browser can
              turn into a text selection. */}
          <div className="post__body">
            {BLOCKS.map((text, index) => {
              const verdict = verdictFor(index)
              const flagged = isFlagged(index)
              return (
                <button
                  type="button"
                  key={index}
                  className="post__para"
                  disabled={locked}
                  aria-pressed={flagged}
                  aria-label={`${flagged ? 'Remove from report' : 'Add to report'}: ${text}`}
                  onClick={() => toggleBlock(index)}
                >
                  <mark className={`post__mark ${verdict}`}>{text}</mark>
                </button>
              )
            })}
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
              Nothing flagged yet. Tap a paragraph, or use ＋ on a picture.
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

    </div>
  )
}
