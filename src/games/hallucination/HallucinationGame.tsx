import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useScoreReport } from '../../hooks/useScoreReport'
import { HALLUCINATION_QUESTIONS } from './content'
import {
  gainIfCorrect,
  lossIfWrong,
  isCorrect,
  leanOf,
  MAX_TRUST,
  scoreFor,
  TRUST_STEP,
} from './scoring'
import './HallucinationGame.css'

type Picks = Record<string, number>

/** Each reply gets this long before the round moves on without an answer. */
const SELECT_SECONDS = 20

/**
 * The verdict then holds for five seconds and moves on by itself: a reader who
 * looks up mid-sentence must never be able to hold the room on one question.
 */
const REVIEW_SECONDS = 5
const CYCLE_MS = (SELECT_SECONDS + REVIEW_SECONDS) * 1000

export default function HallucinationGame({
  room,
  nodeIndex,
}: {
  room: string
  nodeIndex: number
}) {
  const [picks, setPicks] = useState<Picks>({})
  const report = useScoreReport(room, nodeIndex)

  // Frozen while the operator has the show paused, so a pause stops the
  // questions too instead of letting them expire off-screen.
  const elapsed = useNodeElapsed()

  // Which question is on screen is read off the node clock rather than kept in
  // state: the big screen derives the same index from the same clock, so the
  // room can never be looking at one question while a tablet answers another.
  const index = Math.min(
    HALLUCINATION_QUESTIONS.length - 1,
    Math.floor(elapsed / CYCLE_MS),
  )
  const inCycleMs = elapsed - index * CYCLE_MS

  const question = HALLUCINATION_QUESTIONS[index]

  // `undefined` means untouched, which is not the same as a deliberate "not
  // sure": both score nothing, but only one of them is an answer.
  const picked = picks[question.id]
  // What the slider shows while untouched: the middle, where nothing is risked.
  const trust = picked ?? 0
  const lean = leanOf(trust)

  const timeLeftMs = Math.max(0, SELECT_SECONDS * 1000 - inCycleMs)
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  // The reveal happens only when the question's clock runs out: an early answer
  // sits in a "waiting" state until everyone has had their time. A player who
  // never picks is simply scored zero when the clock hits zero.
  const expired = timeLeftMs === 0
  const revealed = expired
  // The verdict owns the last five seconds of the cycle, then the next question
  // takes over without anyone touching the screen.
  const reviewLeft = Math.max(0, Math.ceil((CYCLE_MS - inCycleMs) / 1000))

  // The answer is committed when the clock runs out, not when the slider is
  // first touched: a player who changes their mind before the timer ends must
  // keep the score for what they finally chose.
  const reported = useRef(new Set<string>())
  useEffect(() => {
    if (!revealed) return
    const value = picks[question.id]
    if (value === undefined || reported.current.has(question.id)) return
    reported.current.add(question.id)
    report(index, scoreFor(value, question.truth))
  }, [revealed, index, picks, question, report])

  const isLast = index === HALLUCINATION_QUESTIONS.length - 1

  const points = picked === undefined ? 0 : scoreFor(picked, question.truth)
  const right = picked === undefined ? false : isCorrect(picked, question.truth)
  const gain = gainIfCorrect(trust)
  const loss = lossIfWrong(trust)
  const intensity = Math.abs(trust) / MAX_TRUST
  const fillPct = Math.min(50, intensity * 50)

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
          <p className="hallu__question">
            Can you trust this AI response, or should you doubt it?
          </p>

          {/* One control, read left to right: the further you drag, the more you
              stand to win or lose. The old five buttons committed on the first
              tap; a slider should let you think, so the answer is locked in when
              the clock runs out, not when you first touch it. */}
          <div
            className={`hallu__slider is-${lean}`}
            style={{ '--intensity': intensity } as CSSProperties}
          >
            <div className="hallu__labels" aria-hidden="true">
              <span className={`hallu__label ${lean === 'doubt' ? 'is-on' : ''}`}>Doubt</span>
              <span className={`hallu__label ${lean === 'unsure' ? 'is-on' : ''}`}>Not sure</span>
              <span className={`hallu__label ${lean === 'trust' ? 'is-on' : ''}`}>Trust</span>
            </div>

            <div
              className="hallu__trackwrap"
              style={
                {
                  // The bar grows out of the middle, on the side you dragged
                  // towards: left of the notch for doubt, right of it for trust.
                  '--fill-left': `${trust > 0 ? 50 : 50 - fillPct}%`,
                  '--fill-width': `${fillPct}%`,
                } as CSSProperties
              }
            >
              <span className="hallu__track" aria-hidden="true">
                <span className="hallu__ticks" />
                <span className="hallu__fill" />
                <span className="hallu__notch" />
              </span>
              <input
                type="range"
                className="hallu__range"
                min={-MAX_TRUST}
                max={MAX_TRUST}
                step={TRUST_STEP}
                value={trust}
                aria-label="How much do you trust this answer: left is doubt, right is trust"
                aria-valuetext={
                  trust === 0
                    ? 'Not sure, scores nothing either way'
                    : `${lean === 'trust' ? 'Trust' : 'Doubt'} ${gain}, plus ${gain} if correct, minus ${loss} if wrong`
                }
                onChange={(event) => {
                  const value = Number(event.target.value)
                  setPicks((current) => ({ ...current, [question.id]: value }))
                }}
              />
            </div>

            <p className="hallu__readout">
              <span className="hallu__gain">{gain > 0 ? `+${gain}` : '0'}</span>
              <span className="hallu__gainnote">
                {gain > 0
                  ? `if you are correct · −${loss} if you are wrong`
                  : 'nothing either way'}
              </span>
            </p>
          </div>

          <p className="hallu__hint">
            Drag left if you think it is made up, right if you believe it. Every step is +10.
          </p>
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
                : lean === 'unsure'
                  ? 'you called it not sure'
                  : `you went ${lean} at ${gain}${
                      right ? '' : ` — a wrong read costs ${loss}`
                    }`}
            </span>
          </div>
          <p className="hallu__why">{question.reveal}</p>
          <p className="hallu__autonext">
            {isLast ? 'Final score' : 'Next question'} in {reviewLeft}s
          </p>
        </div>
      )}
          </div>
        </div>
      </div>
    </div>
  )
}
