import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { BLOCKS, LEAKS, POST_META, POST_TEXT } from './content'
import {
  evaluate,
  MIN_SELECTION_CHARS,
  resolveLeaks,
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

/** The text of a block with each leak wrapped, so the reveal is readable in place. */
function renderBlock(blockIndex: number, caughtIds: Set<string>) {
  const text = BLOCKS[blockIndex]
  const start = BLOCK_OFFSETS[blockIndex]
  const end = start + text.length
  const overlapping = LEAK_SPANS.filter((leak) => leak.start < end && leak.end > start).sort(
    (a, b) => a.start - b.start,
  )
  if (overlapping.length === 0) return [text]

  const parts: Array<string | { text: string; caught: boolean; key: string }> = []
  let cursor = start
  for (const leak of overlapping) {
    if (leak.start > cursor) parts.push(POST_TEXT.slice(cursor, leak.start))
    parts.push({
      text: POST_TEXT.slice(leak.start, leak.end),
      caught: caughtIds.has(leak.id),
      key: leak.id,
    })
    cursor = leak.end
  }
  if (cursor < end) parts.push(POST_TEXT.slice(cursor, end))
  return parts
}

export default function DataShadowGame() {
  const [selections, setSelections] = useState<Selection[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [hasLiveSelection, setHasLiveSelection] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  const elapsed = useNodeElapsed()
  const timeLeftMs = Math.max(0, ROUND_SECONDS * 1000 - elapsed)
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  const expired = timeLeftMs === 0
  const done = submitted || expired

  const result: Evaluation | null = useMemo(
    () => (done ? evaluate(selections, LEAK_SPANS, POST_TEXT.length) : null),
    [done, selections],
  )
  const caughtIds = useMemo(
    () => new Set((result?.caught ?? []).map((leak) => leak.id)),
    [result],
  )

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
    // Clearing the native selection is the feedback that it was taken: the words
    // stop being highlighted in the post and appear in the panel instead.
    selection.removeAllRanges()
  }, [])

  // A live selection enables the "Add" button. On iPad this button is the way
  // in, because auto-capturing on touch would fight the selection handles.
  useEffect(() => {
    const onChange = () => {
      const container = bodyRef.current
      const selection = window.getSelection()
      const live =
        !!container &&
        !!selection &&
        selection.rangeCount > 0 &&
        !selection.isCollapsed &&
        container.contains(selection.getRangeAt(0).commonAncestorContainer)
      setHasLiveSelection(live)
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [])

  const remove = (id: string) => {
    if (done) return
    setSelections((current) => current.filter((item) => item.id !== id))
  }

  const tally = result
    ? [
        `${result.caught.length} caught`,
        `${result.rejected.size} false ${result.rejected.size === 1 ? 'alarm' : 'alarms'}`,
        `${result.missed.length} missed`,
      ]
    : []

  return (
    <div className="stage stage--game stage--data_shadow shadow">
      <header className="shadow__bar">
        <span className="stage__kind">Data Shadow</span>
        <span className="shadow__task">
          Drag to select the words that should never have been posted
        </span>
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
      </header>

      <div className="shadow__main">
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
                {done
                  ? renderBlock(index, caughtIds).map((part, partIndex) =>
                      typeof part === 'string' ? (
                        <span key={`t-${partIndex}`}>{part}</span>
                      ) : (
                        <mark
                          key={part.key}
                          className={`post__mark ${part.caught ? 'is-hit' : 'is-missed'}`}
                        >
                          {part.text}
                        </mark>
                      ),
                    )
                  : BLOCKS[index]}
              </p>
            ))}
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
            {result.missed.length > 0 ? (
              <>
                <p className="shadow__revealtitle">What you let through</p>
                <ul className="shadow__missed">
                  {result.missed.map((leak) => (
                    <li key={leak.id}>
                      <span className="shadow__missedtext">“{leak.text}”</span>
                      <span className="shadow__why">{leak.why}</span>
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
          <h2>Your report</h2>
          <span className="report__count">{selections.length}</span>
        </header>

        <div className="report__list">
          {selections.length === 0 && (
            <p className="report__empty">
              Nothing flagged yet. Drag across the post to pick out a risky phrase, then add it
              here.
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
                <span className="report__text">“{item.text}”</span>
                {!done ? (
                  <button
                    type="button"
                    className="report__remove"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.text}`}
                  >
                    ×
                  </button>
                ) : (
                  <span className="report__mark" aria-hidden="true">
                    {result?.counted.has(item.id) ? '✓' : '✗'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {!done ? (
          <footer className="report__foot">
            <button
              type="button"
              className="report__add"
              disabled={!hasLiveSelection}
              // Prevent the tap from clearing the selection we are about to read.
              onPointerDown={(event) => event.preventDefault()}
              onClick={captureSelection}
            >
              {hasLiveSelection ? 'Add selected text' : 'Drag over the post first'}
            </button>
            <button
              type="button"
              className="report__submit"
              disabled={selections.length === 0}
              onClick={() => setSubmitted(true)}
            >
              Submit report
            </button>
            <p className="report__hint">
              +10 per leak you catch. −10 for a flag that is mostly ordinary text, so select the
              risky words precisely.
            </p>
          </footer>
        ) : (
          result && (
            <footer className="report__foot report__foot--result">
              <p className="report__score">
                {result.score > 0 ? '+' : ''}
                {result.score}
              </p>
              <ul className="report__tally">
                {tally.map((line) => (
                  <li key={line}>{line}</li>
                ))}
                <li className="report__best">best possible {LEAK_SPANS.length * 10}</li>
              </ul>
            </footer>
          )
        )}
      </aside>
    </div>
  )
}
