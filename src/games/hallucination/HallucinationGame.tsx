import { useMemo, useState } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useScoreReport } from '../../hooks/useScoreReport'
import { HALLUCINATION_QUESTIONS } from './content'
import { isCorrect, levelByKey, scoreFor, TRUST_LEVELS } from './scoring'
import './HallucinationGame.css'

type Picks = Record<string, string>

/** Each reply gets this long before the round moves on without an answer. */
const QUESTION_SECONDS = 30

export default function HallucinationGame({
  room,
  nodeIndex,
}: {
  room: string
  nodeIndex: number
}) {
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<Picks>({})
  const [finished, setFinished] = useState(false)
  const report = useScoreReport(room, nodeIndex)

  // Frozen while the operator has the show paused, so a pause stops the
  // questions too instead of letting them expire off-screen.
  const elapsed = useNodeElapsed()
  const [questionStart, setQuestionStart] = useState(elapsed)

  const question = HALLUCINATION_QUESTIONS[index]

  const pickKey = picks[question.id]
  const picked = pickKey ? levelByKey(pickKey) : undefined

  const timeLeftMs = Math.max(0, QUESTION_SECONDS * 1000 - (elapsed - questionStart))
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  // The reveal happens only when the question's clock runs out: an early answer
  // sits in a "waiting" state until everyone has had their time. A player who
  // never picks is simply scored zero when the clock hits zero.
  const expired = timeLeftMs === 0
  const waiting = picked !== undefined && !expired
  const revealed = expired

  const total = useMemo(
    () =>
      HALLUCINATION_QUESTIONS.reduce((sum, item) => {
        const level = picks[item.id] ? levelByKey(picks[item.id]) : undefined
        return level ? sum + scoreFor(level, item.truth) : sum
      }, 0),
    [picks],
  )

  const isLast = index === HALLUCINATION_QUESTIONS.length - 1

  const next = () => {
    if (isLast) {
      setFinished(true)
      return
    }
    setIndex((current) => current + 1)
    // Anchor to the node clock, so a question started while paused keeps its
    // full time until the show resumes.
    setQuestionStart(elapsed)
  }

  if (finished) {
    // Derived, not assumed: the best a doubt sentence can pay is 10, so the
    // ceiling is not simply 20 per question.
    const best = HALLUCINATION_QUESTIONS.reduce(
      (sum, item) => sum + Math.max(...TRUST_LEVELS.map((level) => scoreFor(level, item.truth))),
      0,
    )
    return (
      <div className="hud hud--game hallu">
        <div className="hud__matrix" aria-hidden="true" />
        <div className="hud__frame">
          <div className="hud__inner">
            <span className="hud__corner hud__corner--tl" aria-hidden="true" />
            <span className="hud__corner hud__corner--tr" aria-hidden="true" />
            <span className="hud__corner hud__corner--bl" aria-hidden="true" />
            <span className="hud__corner hud__corner--br" aria-hidden="true" />
            <div className="hud__tab">Hallucination</div>
            <div className="hud__bar">
              <span className="hud__chevrons" aria-hidden="true" />
              <span className="hud__event">Round complete</span>
              <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
            </div>
            <div className="hud__stage hallu__stage">
        <div className="hallu__final">
          <p className="hallu__finallabel">Final score</p>
          <p className="hallu__finalscore">
            {total > 0 ? '+' : ''}
            {total}
          </p>
          <p className="hallu__finalnote">
            {total === best
              ? 'A perfect read. You trusted exactly what held up and doubted exactly what did not.'
              : total > 0
                ? 'You read more of it correctly than not — which is roughly the best anyone manages without checking.'
                : 'A negative score means the confident answers got you. That is the point of the round: fluency is not evidence.'}
          </p>
          <ul className="hallu__review">
            {HALLUCINATION_QUESTIONS.map((item) => {
              const level = picks[item.id] ? levelByKey(picks[item.id]) : undefined
              const points = level ? scoreFor(level, item.truth) : 0
              return (
                <li key={item.id} className={points < 0 ? 'is-bad' : points > 0 ? 'is-good' : ''}>
                  <span className="hallu__reviewpoints">
                    {points > 0 ? '+' : ''}
                    {points}
                  </span>
                  <span>{item.prompt}</span>
                </li>
              )
            })}
          </ul>
        </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const points = picked ? scoreFor(picked, question.truth) : 0
  const right = picked ? isCorrect(picked, question.truth) : false

  return (
    <div className="hud hud--game hallu">
      <div className="hud__matrix" aria-hidden="true" />
      <div className="hud__frame">
        <div className="hud__inner">
          <span className="hud__corner hud__corner--tl" aria-hidden="true" />
          <span className="hud__corner hud__corner--tr" aria-hidden="true" />
          <span className="hud__corner hud__corner--bl" aria-hidden="true" />
          <span className="hud__corner hud__corner--br" aria-hidden="true" />

          <div className="hud__tab">Hallucination</div>

          <div className="hud__bar">
            <span className="hud__chevrons" aria-hidden="true" />
            <span className="hud__event">Ask the model</span>
            <span className="hallu__count">
              {index + 1} / {HALLUCINATION_QUESTIONS.length}
            </span>
            {!revealed && (
              <span className={`hallu__timer ${secondsLeft <= 5 ? 'is-urgent' : ''}`}>
                {secondsLeft}s
              </span>
            )}
            <span className={`hallu__score ${total < 0 ? 'is-bad' : total > 0 ? 'is-good' : ''}`}>
              {total > 0 ? '+' : ''}
              {total}
            </span>
          </div>

          <div className="hud__stage hallu__stage">
            <div className="chat">
              {/* A normal transcript: your message on the right with the avatar,
                  the model's reply on the left without one, newest at the
                  bottom. Two columns looked like a comparison; this reads as a
                  conversation. */}
              <div className="chat__row chat__row--user">
                <div className="chat__bubble">
                  <span className="chat__who">You asked</span>
                  <p className="chat__text">{question.prompt}</p>
                </div>
                <span className="chat__avatar" aria-hidden="true">
                  <span className="chat__avatar-head" />
                  <span className="chat__avatar-body" />
                </span>
              </div>

              <div className="chat__row chat__row--ai">
              <div className="chat__answer">
                <div className="chat__aihead">
                  <span className="chat__aibadge" aria-hidden="true" />
                  <span className="chat__ainame">Assistant</span>
                  <span className="chat__aistamp">generated · unverified</span>
                </div>
                <p className="chat__text chat__text--ai">{question.reply}</p>
                <div className="chat__actions">
                  <button type="button" className="chat__action" title="Good answer">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3z" />
                      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                    </svg>
                  </button>
                  <button type="button" className="chat__action" title="Bad answer">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9a2 2 0 0 0 2 2.3z" />
                      <path d="M17 2h2.3A2.3 2.3 0 0 1 22 4.3v7A2.3 2.3 0 0 1 19.3 14H17" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="chat__action"
                    title="Copy the answer"
                    onClick={() => void navigator.clipboard?.writeText(question.reply)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="9" y="9" width="12" height="12" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>
              </div>
            </div>

      {!revealed ? (
        <div className="hallu__choices">
          <p className="hallu__question">How much do you trust this answer?</p>
          <div className="hallu__buttons">
            {TRUST_LEVELS.map((level) => (
              <button
                key={level.key}
                type="button"
                className={`hallu__button hallu__button--${level.key}`}
                disabled={waiting}
                onClick={() => {
                  setPicks((current) => ({ ...current, [question.id]: level.key }))
                  report(index, scoreFor(level, question.truth))
                }}
              >
                {level.label}
              </button>
            ))}
          </div>
          {waiting ? (
            <p className="hallu__waiting">Waiting for others to answer…</p>
          ) : (
            <p className="hallu__hint">Not Sure scores nothing either way. The rest are symmetric — you gain and lose the same amount.</p>
          )}
        </div>
      ) : (
        <div className={`hallu__reveal ${right ? 'is-good' : 'is-bad'}`}>
          <div className="hallu__verdict">
            <span className="hallu__verdictkind">
              {picked === undefined
                ? "Time's up"
                : question.truth === 'trust'
                  ? 'This one held up'
                  : 'This one was a hallucination'}
            </span>
            <span className="hallu__verdictpoints">
              {points > 0 ? '+' : ''}
              {points}
            </span>
            <span className="hallu__verdictpick">
              {picked === undefined
                ? 'you did not pick in time'
                : `you chose ${picked.label}${
                    right ? '' : ' — the sign flips when you read it backwards'
                  }`}
            </span>
          </div>
          <p className="hallu__why">{question.reveal}</p>
          <button type="button" className="hallu__next" onClick={next}>
            {isLast ? 'See final score' : 'Next'}
          </button>
        </div>
      )}
          </div>
        </div>
      </div>
    </div>
  )
}
