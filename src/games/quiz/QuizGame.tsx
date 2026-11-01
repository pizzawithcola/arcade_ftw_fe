import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNodeElapsed } from '../../hooks/useNodeElapsed'
import { useScoreReport } from '../../hooks/useScoreReport'
import { useGameStore } from '../../store/gameStore'
import { bankOptions } from './bank'
import { BASE_POINTS, drawQuestions, perfectScore, pointsFor, slotAt, ULTIMATE_SLOTS } from './draw'
import { questionScore } from './scoring'
import { quizTimeline, sittingAt, timelineLength } from './timeline'
import './QuizGame.css'

type Picks = Record<string, string>

/** After the answer is shown the round moves on by itself - five seconds, no
 *  button, because half the room is still reading when the next one lands. */
const REVIEW_SECONDS = 5

/** One question's cycle, used only until the node arrives with its own figure. */
const FALLBACK_SECONDS_EACH = 20 + REVIEW_SECONDS

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
  // The schedule is the flow node's, not this screen's: it carries the bonus
  // cards' length and which questions they open, and the wall and the engine
  // read the same two fields. A disagreement would put the room a question
  // apart, so it is reported where a developer will see it.
  const node = useGameStore((state) => state.node)
  const segments = useMemo(() => {
    const bonusQuestions = node?.bonus_questions ?? []
    const fromSlots = ULTIMATE_SLOTS.map((slot, at) => (slot.multiplier > 1 ? at + 1 : 0))
      .filter((number) => number > 0)
    if (
      import.meta.env?.DEV &&
      bonusQuestions.length > 0 &&
      bonusQuestions.join(',') !== fromSlots.join(',')
    ) {
      console.error(
        `[quiz] bonus_questions ${bonusQuestions.join(',')} does not match the slots ${fromSlots.join(',')}`,
      )
    }
    return quizTimeline({
      count: node?.questions ?? questions.length,
      secondsEachMs: (node?.seconds_each ?? FALLBACK_SECONDS_EACH) * 1000,
      bonusIntroMs: (node?.bonus_intro_sec ?? 0) * 1000,
      bonusQuestions,
    })
  }, [node?.bonus_questions, node?.bonus_intro_sec, node?.seconds_each, node?.questions, questions.length])
  const totalMs = useMemo(() => timelineLength(segments), [segments])

  // Frozen while the operator has the show paused, so a pause stops the
  // questions too instead of letting them expire off-screen.
  const elapsed = useNodeElapsed()

  // Read off the node clock, exactly as the engine derives it for the big
  // screen: walk the schedule from the first second.
  const stageMs = elapsed
  const finished = stageMs >= totalMs

  const sitting = sittingAt(segments, stageMs)
  const index = sitting?.segment.index ?? 0
  // A bonus card is its own stretch of the round, not part of the question's
  // clock: the countdown has not started yet.
  const onBonusCard = sitting?.segment.kind === 'bonus'
  const inCycleMs = !onBonusCard && sitting ? sitting.inMs : 0

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
          <span className="hud__event">{onBonusCard ? 'Bonus' : 'Pick one'}</span>
          {slotAt(index).multiplier > 1 && !onBonusCard && (
            <span className="quiz__bonus">bonus ×{slotAt(index).multiplier}</span>
          )}
          <span className="quiz__count">
            {index + 1} / {questions.length}
          </span>
          {!revealed && !onBonusCard && (
            <span className={`quiz__timer ${secondsLeft <= 5 ? 'is-urgent' : ''}`}>
              {secondsLeft}s
            </span>
          )}
        </div>

        <div className="hud__stage quiz__stage">
          {onBonusCard ? (
            <BonusCard
              index={index}
              multiplier={slotAt(index).multiplier}
              seconds={node?.bonus_intro_sec ?? 3}
            />
          ) : (
            <>
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
                // The right answer opens: its explanation belongs under the
                // words it is about, not in a paragraph at the foot of the
                // screen that the player has to match back to a letter.
                <div key={option.letter} className={`quiz__slot${isAnswer ? ' is-open' : ''}`}>
                  <button
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
                    {isAnswer && (
                      <span className="quiz__verdict is-right" aria-hidden="true">
                        ✓
                      </span>
                    )}
                    {isWrongPick && (
                      <span className="quiz__verdict is-wrong" aria-hidden="true">
                        ✗
                      </span>
                    )}
                  </button>
                  {isAnswer && (
                    <div className="quiz__note">
                      <p className="quiz__explain">{question.explain}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {waiting && <p className="quiz__waiting">Waiting for others to answer…</p>}

          {revealed && (
            <div className="quiz__reveal">
              <p className="quiz__autonext">
                {/* A timeout still has to say so: with the answer line gone,
                    this word is the only reason nothing turned red. */}
                {picked === undefined ? "Time's up · " : ''}
                {index === questions.length - 1 ? 'Final score' : 'Next question'} in{' '}
                {reviewLeft}s
              </p>
            </div>
          )}
            </>
          )}
        </div>
      </div>
    </div>
  </div>
)
}

/** The digits a reel runs through before it lands. Two full turns, then the
 *  answer: a reel that only holds a few symbols reads as a counter, not as a
 *  machine. */
const REEL_DIGITS = 9

/** The three seconds in front of a bonus question.
 *
 * The badge in the bar says "bonus ×2" quietly, which nobody reads once they are
 * answering. This is the same fact at the size of the whole screen: a slot reel
 * spins through the digits and lands on the multiplier, so the room hears the
 * jump in stakes before the question arrives.
 */
function BonusCard({
  index,
  multiplier,
  seconds,
}: {
  index: number
  multiplier: number
  seconds: number
}) {
  // `--cells - 1` is how far the strip has to travel to put the last cell in
  // the window. The landed position is the strip's own transform, and the
  // animation only says where it starts, so a reduced-motion card that never
  // runs is already showing the right number.
  const cells = REEL_DIGITS * 2 + 1
  const strip = [
    ...Array.from({ length: REEL_DIGITS * 2 }, (_, at) => (at % REEL_DIGITS) + 1),
    multiplier,
  ]
  return (
    <section className="quiz__bonuscard" aria-live="polite">
      <div className="quiz__bonusgrid" aria-hidden="true" />
      <div className="quiz__bonusbulbs" aria-hidden="true">
        {Array.from({ length: 14 }, (_, at) => (
          <span key={at} style={{ '--bulb': at } as CSSProperties} />
        ))}
      </div>
      <p className="quiz__bonustag">Bonus round</p>
      <div className="quiz__reel">
        <span className="quiz__reeldial is-top" aria-hidden="true" />
        <div
          className="quiz__reelstrip"
          style={
            {
              '--cells': cells,
              transform: `translateY(calc(-1 * (${cells} - 1) * 1em))`,
            } as CSSProperties
          }
        >
          {strip.map((digit, at) => (
            <span key={at} className={at === strip.length - 1 ? 'is-landed' : ''}>
              {digit}
            </span>
          ))}
        </div>
        <span className="quiz__reeldial is-bottom" aria-hidden="true" />
      </div>
      <p className="quiz__bonusworth">
        Gain <b>{pointsFor(index)}</b> instead of {BASE_POINTS}
      </p>
      <div className="quiz__bonusmeter" aria-hidden="true">
        <span style={{ animationDuration: `${seconds}s` }} />
      </div>
    </section>
  )
}
