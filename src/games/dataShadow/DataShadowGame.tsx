import { Fragment, useMemo, useState } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { ALL_SEGMENTS, LEAKS, POST } from './content'
import { FALSE_ALARM_POINTS, FLAG_POINTS, scoreOf, verdictFor, type Verdict } from './scoring'
import './DataShadowGame.css'

/** One post, one clock. */
const ROUND_SECONDS = 45

export default function DataShadowGame() {
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [submitted, setSubmitted] = useState(false)

  const elapsed = useNodeElapsed()
  const timeLeftMs = Math.max(0, ROUND_SECONDS * 1000 - elapsed)
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  const expired = timeLeftMs === 0
  const done = submitted || expired

  const flagCount = Object.values(flagged).filter(Boolean).length
  const score = useMemo(
    () => ALL_SEGMENTS.reduce((sum, s) => sum + scoreOf(s, Boolean(flagged[s.id])), 0),
    [flagged],
  )

  const results = useMemo(
    () =>
      ALL_SEGMENTS.map((segment) => ({
        segment,
        verdict: verdictFor(segment, Boolean(flagged[segment.id])),
      })),
    [flagged],
  )
  const hits = results.filter((r) => r.verdict === 'hit').length
  const falseAlarms = results.filter((r) => r.verdict === 'false-alarm').length
  const missed = results.filter((r) => r.verdict === 'missed')

  const toggle = (id: string) => {
    if (done) return
    setFlagged((current) => ({ ...current, [id]: !current[id] }))
  }

  const best = LEAKS.length * FLAG_POINTS
  const verdictClass: Record<Verdict, string> = {
    hit: 'is-hit',
    'false-alarm': 'is-false',
    missed: 'is-missed',
    clean: '',
  }

  return (
    <div className="stage stage--game stage--data_shadow shadow">
      <header className="shadow__bar">
        <span className="stage__kind">Data Shadow</span>
        <span className="shadow__task">Click anything that should not be on LinkedIn</span>
        {!done && (
          <span className={`shadow__timer ${secondsLeft <= 10 ? 'is-urgent' : ''}`}>
            {secondsLeft}s
          </span>
        )}
        {done && (
          <span className={`shadow__score ${score < 0 ? 'is-bad' : score > 0 ? 'is-good' : ''}`}>
            {score > 0 ? '+' : ''}
            {score}
          </span>
        )}
      </header>

      {/* The light card is deliberate: it reads instantly as "a social network",
          which is the context the player is being asked to judge in. */}
      <article className="post">
        <header className="post__head">
          <span className="post__avatar">{POST.authorInitials}</span>
          <span className="post__who">
            <span className="post__name">{POST.author}</span>
            <span className="post__headline">{POST.authorHeadline}</span>
            <span className="post__time">
              {POST.postedAgo} · <span className="post__globe">🌐</span>
            </span>
          </span>
        </header>

        <div className="post__body">
          {POST.paragraphs.map((paragraph, index) => (
            <p className="post__para" key={index}>
              {paragraph.segments.map((segment, position) => {
                const isFlagged = Boolean(flagged[segment.id])
                const verdict = verdictFor(segment, isFlagged)
                const classes = [
                  'post__seg',
                  isFlagged ? 'is-flagged' : '',
                  done ? verdictClass[verdict] : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  // The space is explicit: the segments are inline buttons, so
                  // without it "Sarah Chen" and "and everyone" would run
                  // together as one word.
                  <Fragment key={segment.id}>
                    {position > 0 && ' '}
                    <button
                      type="button"
                      className={classes}
                      onClick={() => toggle(segment.id)}
                      disabled={done}
                      aria-pressed={isFlagged}
                    >
                      {segment.text}
                    </button>
                  </Fragment>
                )
              })}
            </p>
          ))}
          <p className="post__hashtags">{POST.hashtags}</p>
        </div>

        <footer className="post__foot">
          <span className="post__reactions">
            <span className="post__react">👍</span>
            <span className="post__react">❤️</span>
            <span className="post__react">💡</span>
            <span className="post__count">{POST.reactions}</span>
          </span>
          <span className="post__count">{POST.comments} comments</span>
        </footer>
      </article>

      {!done ? (
        <div className="shadow__actions">
          <button type="button" className="shadow__submit" onClick={() => setSubmitted(true)}>
            Submit {flagCount > 0 ? `(${flagCount} flagged)` : ''}
          </button>
          <p className="shadow__hint">
            {FLAG_POINTS} points per leak you catch, {FALSE_ALARM_POINTS} for flagging something
            that was fine. Passing on a sentence costs nothing.
          </p>
        </div>
      ) : (
        <div className="shadow__reveal">
          <div className="shadow__tally">
            <span className="shadow__stat is-good">
              {hits} caught
            </span>
            <span className="shadow__stat is-bad">
              {falseAlarms} false {falseAlarms === 1 ? 'alarm' : 'alarms'}
            </span>
            <span className="shadow__stat is-missed">
              {missed.length} missed
            </span>
            <span className="shadow__stat">
              best possible {best}
            </span>
            {expired && !submitted && <span className="shadow__stat is-bad">time ran out</span>}
          </div>

          {missed.length > 0 ? (
            <>
              <p className="shadow__revealtitle">What you let through</p>
              <ul className="shadow__missed">
                {missed.map(({ segment }) => (
                  <li key={segment.id}>
                    <span className="shadow__missedtext">“{segment.text}”</span>
                    <span className="shadow__why">{segment.why}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="shadow__revealtitle is-good">You caught every leak in the post.</p>
          )}

          {falseAlarms > 0 && (
            <p className="shadow__footnote">
              A false alarm is not harmless: it is the same reflex that makes people flag ordinary
              sentences and miss the ones that matter.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
