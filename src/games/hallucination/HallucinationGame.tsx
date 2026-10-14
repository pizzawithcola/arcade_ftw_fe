import { useMemo, useState } from 'react'
import { HALLUCINATION_QUESTIONS } from './content'
import { isCorrect, levelByKey, scoreFor, TRUST_LEVELS } from './scoring'
import './HallucinationGame.css'

type Picks = Record<string, string>

export default function HallucinationGame() {
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<Picks>({})
  const [finished, setFinished] = useState(false)

  const question = HALLUCINATION_QUESTIONS[index]

  const total = useMemo(
    () =>
      HALLUCINATION_QUESTIONS.reduce((sum, item) => {
        const level = picks[item.id] ? levelByKey(picks[item.id]) : undefined
        return level ? sum + scoreFor(level, item.truth) : sum
      }, 0),
    [picks],
  )

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

  const pickKey = picks[question.id]
  const picked = pickKey ? levelByKey(pickKey) : undefined
  const revealed = picked !== undefined
  const points = picked ? scoreFor(picked, question.truth) : 0
  const right = picked ? isCorrect(picked, question.truth) : false
  const isLast = index === HALLUCINATION_QUESTIONS.length - 1

  return (
    <div className="stage stage--game stage--hallucination hallu">
      <header className="hallu__bar">
        <span className="stage__kind">Hallucination</span>
        <span className="hallu__count">
          {index + 1} / {HALLUCINATION_QUESTIONS.length}
        </span>
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
        <div className={`hallu__reveal ${right ? 'is-good' : 'is-bad'}`}>
          <div className="hallu__verdict">
            <span className="hallu__verdictkind">
              {question.truth === 'trust' ? 'This one held up' : 'This one was a hallucination'}
            </span>
            <span className="hallu__verdictpoints">
              {points > 0 ? '+' : ''}
              {points}
            </span>
            <span className="hallu__verdictpick">
              you chose {picked?.label}
              {right ? '' : ' — the sign flips when you read it backwards'}
            </span>
          </div>
          <p className="hallu__why">{question.reveal}</p>
          <button
            type="button"
            className="hallu__next"
            onClick={() => (isLast ? setFinished(true) : setIndex(index + 1))}
          >
            {isLast ? 'See final score' : 'Next'}
          </button>
        </div>
      )}
    </div>
  )
}
