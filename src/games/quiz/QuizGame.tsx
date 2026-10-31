import { useMemo, useState } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useScoreReport } from '../../hooks/useScoreReport'
import { bankOptions } from './bank'
import { drawQuestions, perfectScore, slotAt } from './draw'
import { questionScore } from './scoring'
import './QuizGame.css'

type Picks = Record<string, string>

/** After the answer is shown the round moves on by itself - five seconds, no
 *  button, because half the room is still reading when the next one lands. */
const REVIEW_SECONDS = 5

export default function QuizGame({ room, nodeIndex }: { room: string; nodeIndex: number }) {
  const [picks, setPicks] = useState<Picks>({})
  const report = useScoreReport(room, nodeIndex)

  // There is no intro card: the brief in front of the round already announced
  // it, so the node's first second is the first question. `intro_sec` is absent
  // from the flow node for the same reason - the engine and the wall both
  // subtract it, and a card here without it there would put them one question
  // apart.
  //
  // The five questions are drawn from the seed `room:node`, the same seed the
  // wall uses. `Math.random()` here would give every iPad its own round.
  const questions = useMemo(() => drawQuestions(`${room}:${nodeIndex}`), [room, nodeIndex])
  const { cycles, totalMs } = useMemo(
    () => ({
      cycles: questions.map((item) => (item.time_limit + REVIEW_SECONDS) * 1000),
      totalMs: questions.reduce(
        (sum, item) => sum + (item.time_limit + REVIEW_SECONDS) * 1000,
        0,
      ),
    }),
    [questions],
  )

  // Frozen while the operator has the show paused, so a pause stops the
  // questions too instead of letting them expire off-screen.
  const elapsed = useNodeElapsed()

  // Read off the node clock, exactly as the engine derives it for the big
  // screen: one cycle per question from the first second.
  const stageMs = elapsed
  const finished = stageMs >= totalMs

  const index = useMemo(() => {
    let end = 0
    for (let at = 0; at < cycles.length; at += 1) {
      end += cycles[at]
      if (stageMs < end) return at
    }
    return questions.length - 1
  }, [stageMs, cycles, questions.length])

  const cycleStart = cycles.slice(0, index).reduce((sum, cycle) => sum + cycle, 0)
  const inCycleMs = stageMs - cycleStart

  const question = questions[index]
  const picked = picks[question.id]

  const timeLeftMs = Math.max(0, question.time_limit * 1000 - inCycleMs)
  const secondsLeft = Math.ceil(timeLeftMs / 1000)
  // Reveal only once the question's clock runs out: an early answer sits in a
  // waiting state so everyone has their time. An unanswered question reads as
  // wrong when the clock hits zero (it simply scored nothing).
  const expired = timeLeftMs === 0
  const waiting = picked !== undefined && !expired
  const revealed = expired
  const reviewLeft = Math.max(
    0,
    Math.ceil((question.time_limit * 1000 + REVIEW_SECONDS * 1000 - inCycleMs) / 1000),
  )
  const total = useMemo(
    () =>
      questions.reduce(
        (sum, item, at) =>
          sum + questionScore(picks[item.id], item.correct_option, slotAt(at).multiplier),
        0,
      ),
    [picks, questions],
  )

  if (finished) {
    const perfect = perfectScore()
    return (
      <div className="hud hud--game quiz">
        <div className="hud__matrix" aria-hidden="true" />
        <div className="hud__frame">
          <div className="hud__inner">
            <span className="hud__corner hud__corner--tl" aria-hidden="true" />
            <span className="hud__corner hud__corner--tr" aria-hidden="true" />
            <span className="hud__corner hud__corner--bl" aria-hidden="true" />
            <span className="hud__corner hud__corner--br" aria-hidden="true" />
            <div className="hud__tab">Quiz</div>
            <div className="hud__bar">
              <span className="hud__chevrons" aria-hidden="true" />
              <span className="hud__event">Round complete</span>
              <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
            </div>
            <div className="hud__stage quiz__stage">
      <div className="quiz__final">
        <p className="quiz__finallabel">Final score</p>
        <p className="quiz__finalscore">
          {total} / {perfect}
        </p>
        <ul className="quiz__review">
          {questions.map((item, at) => {
            const letter = picks[item.id]
            const correct = letter === item.correct_option
            const missed = letter === undefined
            return (
              <li key={item.id} className={correct ? 'is-good' : 'is-bad'}>
                <span className="quiz__reviewmark">{correct ? '✓' : missed ? '—' : '✗'}</span>
                <span className="quiz__reviewmult">×{slotAt(at).multiplier}</span>
                <span>{item.text}</span>
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

return (
  <div className="hud hud--game quiz">
    <div className="hud__matrix" aria-hidden="true" />
    <div className="hud__frame">
      <div className="hud__inner">
        <span className="hud__corner hud__corner--tl" aria-hidden="true" />
        <span className="hud__corner hud__corner--tr" aria-hidden="true" />
        <span className="hud__corner hud__corner--bl" aria-hidden="true" />
        <span className="hud__corner hud__corner--br" aria-hidden="true" />

        <div className="hud__tab">Quiz</div>

        <div className="hud__bar">
          <span className="hud__chevrons" aria-hidden="true" />
          <span className="hud__event">Pick one</span>
          {slotAt(index).multiplier > 1 && (
            <span className="quiz__bonus">bonus ×{slotAt(index).multiplier}</span>
          )}
          <span className="quiz__count">
            {index + 1} / {questions.length}
          </span>
          {!revealed && (
            <span className={`quiz__timer ${secondsLeft <= 5 ? 'is-urgent' : ''}`}>
              {secondsLeft}s
            </span>
          )}
        </div>

        <div className="hud__stage quiz__stage">
          <p className="quiz__from">{slotAt(index).label}</p>
          <p className="quiz__question">{question.text}</p>
          <div className="quiz__options">
            {bankOptions(question).map((option) => {
              const isPicked = picked === option.letter
              const isAnswer = revealed && option.letter === question.correct_option
              const isWrongPick =
                revealed && isPicked && option.letter !== question.correct_option
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
                  disabled={waiting || revealed}
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

          {waiting && <p className="quiz__waiting">Waiting for others to answer…</p>}

          {revealed && (
            <div
              className={`quiz__reveal ${
                picked === question.correct_option ? 'is-good' : 'is-bad'
              }`}
            >
              <p className="quiz__explain">{question.explain}</p>
              <p className="quiz__correct">
                {picked === undefined
                  ? `Time's up — the answer was ${question.correct_option}.`
                  : `The answer was ${question.correct_option}.`}
              </p>
              <p className="quiz__autonext">
                {index === questions.length - 1 ? 'Final score' : 'Next question'} in{' '}
                {reviewLeft}s
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
)
}
