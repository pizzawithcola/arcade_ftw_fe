import { useMemo, useState } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useScoreReport } from '../../hooks/useScoreReport'
import { optionsOf, QUIZ_QUESTIONS } from './content'
import { questionScore } from './scoring'
import './QuizGame.css'

type Picks = Record<string, string>

export default function QuizGame({ room, nodeIndex }: { room: string; nodeIndex: number }) {
  const [index, setIndex] = useState(0)
  const [picks, setPicks] = useState<Picks>({})
  const [finished, setFinished] = useState(false)
  const report = useScoreReport(room, nodeIndex)

  // Frozen while the operator has the show paused, so a pause stops the
  // questions too instead of letting them expire off-screen.
  const elapsed = useNodeElapsed()
  const [questionStart, setQuestionStart] = useState(elapsed)

  const question = QUIZ_QUESTIONS[index]
  const picked = picks[question.id]

  const timeLeftMs = Math.max(0, question.time_limit * 1000 - (elapsed - questionStart))
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  // Derived rather than stored, so expiry needs no effect and no extra render.
  const expired = picked === undefined && timeLeftMs === 0
  const revealed = picked !== undefined || expired

  const total = useMemo(
    () =>
      QUIZ_QUESTIONS.reduce(
        (sum, item) => sum + questionScore(picks[item.id], item.correct_option),
        0,
      ),
    [picks],
  )

  const isLast = index === QUIZ_QUESTIONS.length - 1

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
    const perfect = QUIZ_QUESTIONS.length * 20
    return (
      <div className="stage stage--quiz quiz">
        <span className="stage__kind">Quiz</span>
        <div className="quiz__final">
          <p className="quiz__finallabel">Final score</p>
          <p className="quiz__finalscore">
            {total} / {perfect}
          </p>
          <ul className="quiz__review">
            {QUIZ_QUESTIONS.map((item) => {
              const letter = picks[item.id]
              const correct = letter === item.correct_option
              const missed = letter === undefined
              return (
                <li key={item.id} className={correct ? 'is-good' : 'is-bad'}>
                  <span className="quiz__reviewmark">{correct ? '✓' : missed ? '—' : '✗'}</span>
                  <span>{item.text}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <div className="stage stage--quiz quiz">
      <header className="quiz__bar">
        <span className="stage__kind">Quiz</span>
        <span className="quiz__count">
          {index + 1} / {QUIZ_QUESTIONS.length}
        </span>
        {!revealed && (
          <span className={`quiz__timer ${secondsLeft <= 5 ? 'is-urgent' : ''}`}>{secondsLeft}s</span>
        )}
        <span className="quiz__score">{total}</span>
      </header>

      <div className="quiz__board">
        <p className="quiz__question">{question.text}</p>
        <div className="quiz__options">
          {optionsOf(question).map((option) => {
            const isPicked = picked === option.letter
            const isAnswer = revealed && option.letter === question.correct_option
            const isWrongPick = revealed && isPicked && option.letter !== question.correct_option
            const classes = [
              'quiz__option',
              isPicked ? 'is-picked' : '',
              isAnswer ? 'is-answer' : '',
              isWrongPick ? 'is-wrong' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button
                key={option.letter}
                type="button"
                className={classes}
                disabled={revealed}
                onClick={() => {
                  setPicks((current) => ({ ...current, [question.id]: option.letter }))
                  report(index, questionScore(option.letter, question.correct_option))
                }}
              >
                <span className="quiz__letter">{option.letter}</span>
                <span className="quiz__optiontext">{option.text}</span>
              </button>
            )
          })}
        </div>
      </div>

      {revealed && (
        <div className={`quiz__reveal ${picked === question.correct_option ? 'is-good' : 'is-bad'}`}>
          <p className="quiz__explain">{question.explain}</p>
          <p className="quiz__correct">
            {expired
              ? `Time's up — the answer was ${question.correct_option}.`
              : `The answer was ${question.correct_option}.`}
          </p>
          <button type="button" className="quiz__next" onClick={next}>
            {isLast ? 'See final score' : 'Next'}
          </button>
        </div>
      )}
    </div>
  )
}
