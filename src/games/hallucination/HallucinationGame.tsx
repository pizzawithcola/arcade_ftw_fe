import { useMemo, useState } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { HALLUCINATION_QUESTIONS } from './content'
import { isCorrect, levelByKey, scoreFor, TRUST_LEVELS } from './scoring'
import './HallucinationGame.css'

type Picks = Record<string, string>

/** Each reply gets this long before the round moves on without an answer. */
const QUESTION_SECONDS = 30

export default function HallucinationGame() {
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<Picks>({})
  const [finished, setFinished] = useState(false)

  // Frozen while the operator has the show paused, so a pause stops the
  // questions too instead of letting them expire off-screen.
  const elapsed = useNodeElapsed()
  const [questionStart, setQuestionStart] = useState(elapsed)

  const question = HALLUCINATION_QUESTIONS[index]

  const pickKey = picks[question.id]
  const picked = pickKey ? levelByKey(pickKey) : undefined

  const timeLeftMs = Math.max(0, QUESTION_SECONDS * 1000 - (elapsed - questionStart))
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  // Derived, not stored: a show must not stall waiting for a kiosk that never
  // picked, and the clock already lives in `elapsed`.
  const expired = picked === undefined && timeLeftMs === 0
  const revealed = picked !== undefined || expired

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
      <div className="stage stage--game stage--hallucination hallu">
        <span className="stage__kind">Hallucination</span>
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
    )
  }

  const points = picked ? scoreFor(picked, question.truth) : 0
  const right = picked ? isCorrect(picked, question.truth) : false

  return (
    <div className="stage stage--game stage--hallucination hallu">
      <header className="hallu__bar">
        <span className="stage__kind">Hallucination</span>
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
      </header>

      <div className="hallu__board">
        <p className="hallu__ask">You asked the AI:</p>
        <p className="hallu__prompt">{question.prompt}</p>
        <p className="hallu__replylabel">It answered:</p>
        <blockquote className="hallu__reply">{question.reply}</blockquote>
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
                onClick={() => setPicks((current) => ({ ...current, [question.id]: level.key }))}
              >
                {level.label}
              </button>
            ))}
          </div>
          <p className="hallu__hint">Not Sure scores nothing either way. The rest are symmetric — you gain and lose the same amount.</p>
        </div>
      ) : (
        <div className={`hallu__reveal ${expired ? '' : right ? 'is-good' : 'is-bad'}`}>
          <div className="hallu__verdict">
            <span className="hallu__verdictkind">
              {expired
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
              {expired
                ? 'you did not pick in time'
                : `you chose ${picked?.label}${
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
  )
}
