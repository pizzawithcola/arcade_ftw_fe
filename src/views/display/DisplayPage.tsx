import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchSession, isAuthError, listRooms, roomRoster, type Session } from '../../api'
import { BLOCKS, IMAGES, POST_META } from '../../games/dataShadow/content'
import { HALLUCINATION_QUESTIONS } from '../../games/hallucination/content'
import { bankOptions } from '../../games/quiz/bank'
import { drawQuestions, slotAt } from '../../games/quiz/draw'
import { theBet } from '../../games/sabotage/revealCopy'
import Welcome from '../../games/Welcome'
import Opening from '../../games/Opening'
import RoomLeaderboard from '../../components/RoomLeaderboard'
import '../../games/hallucination/HallucinationGame.css'
import '../hud.css'
import { useGameSocket } from '../../hooks/useGameSocket'
import { useTicker } from '../../hooks/useTicker'
import { useGameStore, type FlowNode, type QuestionState } from '../../store/gameStore'
import StaffLogin from '../StaffLogin'
import './DisplayPage.css'

/**
 * The wall screen's waiting room: the same notched panel as the iPad, but the
 * ring stack carries the player count and the roster sits under it. Built once
 * so the "no room yet" and "room open" states cannot drift apart.
 */
function LobbyPanel({
  count,
  names,
  note,
}: {
  count?: number
  names: string[]
  note: string
}) {
  return (
    <div className="hud hud--display">
      <div className="hud__matrix" aria-hidden="true" />
      <div className="hud__frame">
        <div className="hud__inner">
          <span className="hud__corner hud__corner--tl" aria-hidden="true" />
          <span className="hud__corner hud__corner--tr" aria-hidden="true" />
          <span className="hud__corner hud__corner--bl" aria-hidden="true" />
          <span className="hud__corner hud__corner--br" aria-hidden="true" />

          <div className="hud__tab">Waiting Room</div>

          <div className="hud__bar">
            <span className="hud__chevrons" aria-hidden="true" />
            <span className="hud__event">Arcade FTW</span>
            <span className="hud__status">
              <span className="hud__dot" aria-hidden="true" />
              get ready
            </span>
            <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
          </div>

          <div className="hud__stage">
            <div className="hud__rings" aria-hidden="true">
              <span className="hud__ring hud__ring--outer" />
              <span className="hud__ring hud__ring--mid" />
              <span className="hud__ring hud__ring--inner" />
              {count !== undefined && <span className="hud__count">{count}</span>}
            </div>
            <p className="hud__label">
              {count === undefined
                ? 'stand by'
                : count === 1
                  ? 'player joined'
                  : 'players joined'}
            </p>

            {names.length > 0 ? (
              <ul className="display__names">
                {names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className="hud__empty">{note}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** The 15s rules card: the iPad's words, sized for the back row. */
/** The wall's version of the fifteen seconds that open a game: name, then rules. */
function OpeningOnScreen({ node, remainingMs }: { node: FlowNode; remainingMs: number }) {
  // Same derivation the player screen uses: elapsed is what the wall has already
  // burned of the node, which is the clock the opening is paced by.
  const elapsedMs = Math.max(0, (node.duration_sec ?? 0) * 1000 - remainingMs)
  return <Opening node={node} elapsedMs={elapsedMs} size="display" />
}

/** The Data Shadow post is one static page, so the big screen can show it whole.
 *
 *  There is no report panel on the wall - reporting happens on the iPad - so the
 *  right-hand column that the tablets give to that panel is free. The pictures
 *  move into it and the copy gets the width, which is what lets the type be
 *  readable from the back of the room. */
function PostOnScreen() {
  return (
    <article className="display__post display__post--split">
      <div className="display__posttext">
        <header className="display__posthead">
          <span className="display__avatar">{POST_META.initials}</span>
          <span>
            <strong>{POST_META.author}</strong>
            <em>{POST_META.headline}</em>
          </span>
        </header>
        {BLOCKS.map((block, index) => (
          <p key={index}>{block}</p>
        ))}
      </div>
      {/* The wall shows the same pictures the players are judging. Read-only:
          nobody taps a projector, and the flag control stays on the iPad. */}
      <div className="display__postshots">
        {IMAGES.map((image) => (
          <figure className="display__postshot" key={image.id}>
            <img src={image.src} alt={image.alt} loading="lazy" />
          </figure>
        ))}
      </div>
    </article>
  )
}

/**
 * The big screen.
 *
 * With a `:code` in the URL it is pinned to that room (useful for a test screen).
 * Without one - the way it runs at an event - it follows the newest room, so the
 * operator starting a new round is all it takes for the screen and its join QR
 * to move on. The URL never changes.
 */
/**
 * Which question is on screen right now, derived from the node clock.
 *
 * The broadcast carries the question only at the moment it changes, so a wall
 * that trusted the last message sat on question one for the whole node - and,
 * with a title card in front of a quiz, never left the card at all. Both sides
 * run the same arithmetic, so a screen that derives it still cannot disagree
 * with the engine.
 */
function questionOnScreen(
  node: FlowNode | null,
  remainingMs: number,
): QuestionState | null {
  const count = node?.questions
  const each = node?.seconds_each
  if (!count || !each) return null
  const durationMs = (node?.duration_sec ?? 0) * 1000
  const elapsed = Math.max(0, durationMs - remainingMs)
  const introMs = (node?.intro_sec ?? 0) * 1000
  const stage = Math.max(0, elapsed - introMs)
  const eachMs = each * 1000
  return {
    index: Math.min(count - 1, Math.floor(stage / eachMs)),
    count,
    seconds_each: each,
    remaining_ms: Math.max(0, Math.round(eachMs - (stage % eachMs))),
    intro_ms: Math.max(0, Math.round(introMs - elapsed)),
  }
}

/** Where in a question's own cycle we are, in milliseconds.
 *
 *  A quiz question is twenty seconds of answering and five of verdict, the same
 *  split the iPad runs. The wall uses it to swap the options for the standings
 *  once the answers are closed. */
function inQuestionMs(question: QuestionState): number {
  return question.seconds_each * 1000 - question.remaining_ms
}

/**
 * The question the whole room is answering.
 *
 * The engine says which one is current, so the screen and the iPads cannot
 * disagree.
 *
 * Options belong on the iPad for a game the room plays at once, but the Ultimate
 * round is the one people want to read along with, so its four answers are on the
 * wall too - lettered, so the host can say "B" and everyone looks at the same box.
 */
function QuestionOnScreen({
  kind,
  index,
  seed,
}: {
  kind: 'hallucination' | 'quiz'
  index: number
  /** `room:node` - the wall draws the same questions as the iPads. */
  seed: string
}) {
  if (kind === 'hallucination') {
    const question = HALLUCINATION_QUESTIONS[index]
    if (!question) return null
    // The wall shows the same conversation the iPads do, so an audience member
    // looking up mid-answer does not have to re-find their place.
    return (
      <article className="display__conversation">
        <div className="chat">
          <div className="chat__row chat__row--user">
            <div className="chat__bubble">
              <span className="chat__who">Asked the model</span>
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
            </div>
          </div>
        </div>
        {/* The two answers, in the colours the iPad's scale uses: green is
            trust, amber is doubt. A reader at the back sees which way the room
            is being asked to push before reading a single word. */}
        <p className="display__choice">
          <span className="display__choicetrust">Trust</span>
          <span className="display__choiceor">or</span>
          <span className="display__choicedoubt">Doubt</span>
        </p>
      </article>
    )
  }

  const question = drawQuestions(seed)[index]
  if (!question) return null
  const slot = slotAt(index)
  return (
    <article className="display__quiz">
      <p className="display__prompt">{question.text}</p>
      <ol className="display__options">
        {bankOptions(question).map((option) => (
          <li key={option.letter} className="display__option">
            <span className="display__optionletter">{option.letter}</span>
            <span className="display__optiontext">{option.text}</span>
          </li>
        ))}
      </ol>
      <p className="display__look">
        {slot.multiplier > 1 ? `BONUS ×${slot.multiplier} · ` : ''}Answer on your iPad.
      </p>
    </article>
  )
}

/** The Sabotage wall: the target, the clock, and nothing that would tell
 *  either team what the other is buying. */
const SAB_DOMAIN: Record<string, string> = { data: 'Data', people: 'People', infra: 'Infra' }

/** Money as the room reads it: $27,000, never 27000. */
function sabMoney(amount: number): string {
  return `$${Math.max(0, amount).toLocaleString('en-US')}`
}

/** Side names as the room reads them. The engine still calls them red and blue;
 *  the room never does, because the tablet draws them as TEAM A and TEAM B. */
const SAB_TEAM: Record<string, string> = { red: 'TEAM A', blue: 'TEAM B' }

function sabTeam(key: string): string {
  return SAB_TEAM[key] ?? key.toUpperCase()
}

function SabotageOnScreen() {
  const sabotage = useGameStore((state) => state.sabotage)
  if (!sabotage) return null

  if (sabotage.phase === 'team_reveal') {
    // The colour does the naming here: this round one whole team is purple and
    // the other is blue, so the tablet in your hand matches the table to walk to.
    const attacking = sabotage.teams[sabotage.attacker]?.length ?? 0
    const defending = sabotage.teams[sabotage.attacker === 'red' ? 'blue' : 'red']?.length ?? 0
    return (
      <article className="display__question">
        <p className="display__prompt">Find the screen in your colour, and regroup.</p>
        <p className="display__look">
          <span className="display__atk">{attacking} on Purple</span> ·{' '}
          <span className="display__def">{defending} on Blue</span>
        </p>
      </article>
    )
  }

  if (sabotage.phase === 'brief') {
    return (
      <article className="display__question">
        <p className="display__prompt">Four rounds. One budget.</p>
        <p className="display__reply">
          Each team has {sabMoney(sabotage.total_budget)} for all four rounds. What you
          spend now is gone in round four.
        </p>
        <p className="display__look">
          Every card scores in Data, People and Infra · only the round's target decides who
          wins · the dearest card is not the strongest
        </p>
      </article>
    )
  }

  if (sabotage.phase === 'select') {
    return (
      <article className="display__question">
        <p className="display__prompt">
          Round {sabotage.round} · {sabotage.theme}
        </p>
        <p className="display__reply">
          TARGET · {SAB_DOMAIN[sabotage.target]?.toUpperCase()} — {sabTeam(sabotage.attacker)}{' '}
          attacks
        </p>
        <p className="display__look">
          {sabotage.attacker === 'red' ? sabotage.attack_brief : sabotage.defence_brief}
        </p>
        <p className="display__look">
          Left to spend — {sabTeam('red')} {sabMoney(sabotage.budget.red ?? 0)} ·{' '}
          {sabTeam('blue')} {sabMoney(sabotage.budget.blue ?? 0)}
        </p>
      </article>
    )
  }

  if (sabotage.phase === 'reveal' && sabotage.last_result) {
    const r = sabotage.last_result
    return (
      <article className="display__question">
        <p className="display__prompt">
          Round {r.round} · {r.outcome.toUpperCase()}
        </p>
        <ul className="display__dims">
          {r.dims.map((dim) => (
            <li key={dim.domain} className={`is-${dim.result} ${dim.target ? 'is-target' : ''}`}>
              <span>{SAB_DOMAIN[dim.domain]}</span>
              <b>{dim.attack}</b>
              <span>vs</span>
              <b>{dim.defence}</b>
              <em>{dim.result === 'break' ? 'BREACH' : dim.result === 'tie' ? 'TIE' : 'HELD'}</em>
            </li>
          ))}
        </ul>
        <p className="display__look">
          {sabTeam('red')} {sabotage.scores.red} · {sabTeam('blue')} {sabotage.scores.blue}
        </p>
        <p className="display__look">
          {sabTeam(r.attacker)} spent {sabMoney(r.attack_cost)} · {sabTeam(r.defender)} spent{' '}
          {sabMoney(r.defence_cost)} · left {sabTeam('red')}{' '}
          {sabMoney(sabotage.budget.red ?? 0)} / {sabTeam('blue')}{' '}
          {sabMoney(sabotage.budget.blue ?? 0)}
        </p>
        {/* The phone tells each side what happened to them; the wall says what
            the round was about, so both rooms leave with one line to remember. */}
        {theBet(r.round) && <p className="display__bet">{theBet(r.round)}</p>}
      </article>
    )
  }

  const red = sabotage.scores.red ?? 0
  const blue = sabotage.scores.blue ?? 0
  const leader = red === blue ? null : sabTeam(red > blue ? 'red' : 'blue')
  return (
    <article className="display__question">
      <p className="display__prompt">{leader ? `${leader} WINS` : 'DRAWN'}</p>
      <p className="display__reply">
        {sabTeam('red')} {red} · {sabTeam('blue')} {blue}
      </p>
      <p className="display__look">{sabotage.rounds} rounds played</p>
    </article>
  )
}

export default function DisplayPage() {
  const { code: pinned } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [joined, setJoined] = useState<string[]>([])

  const code = pinned ?? current ?? ''

  useGameSocket(code)
  const now = useTicker()

  const phase = useGameStore((state) => state.phase)
  const node = useGameStore((state) => state.node)
  // The node index is half the draw seed for the Ultimate round: the wall and
  // the iPads must derive the same five questions from the same pair.
  const nodeIndex = useGameStore((state) => state.index)
  const endsAt = useGameStore((state) => state.endsAt)
  const heldMs = useGameStore((state) => state.heldMs)
  const broadcast = useGameStore((state) => state.question)
  const sabotage = useGameStore((state) => state.sabotage)

  useEffect(() => {
    void fetchSession().then((found) => {
      setSession(found && found.isAdmin ? found : null)
      setChecked(true)
    })
  }, [])

  // Only the unpinned screen needs to look for the current round.
  useEffect(() => {
    if (!session || pinned) return
    let live = true
    const pull = () =>
      listRooms()
        .then((list) => {
          if (live) setCurrent(list.current)
        })
        .catch((caught: unknown) => {
          // A dead token must not leave the screen frozen on a stale round: the
          // operator signs in again instead. Anything else is a blip the socket
          // is already reporting.
          if (isAuthError(caught) && live) setSession(null)
        })
    void pull()
    const id = window.setInterval(() => void pull(), 3000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [session, pinned])

  // Who is in the room, for the lobby. Cheap enough to poll, and it is the one
  // thing the audience looks at before the show starts.
  useEffect(() => {
    if (!session || !code) return
    let live = true
    const pull = () =>
      roomRoster(code)
        .then((entries) => {
          if (live) setJoined(entries.map((entry) => entry.nickname))
        })
        .catch(() => {
          // The roster is decoration; a blip just leaves the last list on screen.
        })
    void pull()
    const id = window.setInterval(() => void pull(), 2000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [session, code])

  if (!checked) return null
  if (!session) {
    return <StaffLogin scope="display" title="Arcade FTW" onSignedIn={setSession} />
  }

  if (!pinned && !current) {
    return (
      <main className="display display--idle">
        <header className="display__bar">
          <span className="display__brand">Arcade FTW</span>
        </header>
        <LobbyPanel names={[]} note="The host opens the round shortly." />
      </main>
    )
  }

  const remaining = endsAt !== null ? Math.max(0, endsAt - now) : heldMs
  const question = questionOnScreen(node, remaining) ?? broadcast
  // The Ultimate wall shows the four options while the room is answering, then
  // swaps them for the standings once the answers close - the same five seconds
  // the iPads hold a verdict for.
  const quizReviewing =
    node?.type === 'quiz' &&
    question !== null &&
    inQuestionMs(question) >= (node.seconds_each ?? 0) * 1000 - 5_000
  // Sabotage has its own per-phase countdown; show that instead of the node's
  // 170-second slot, which only matters for when the flow moves on.
  const sabotageRemaining = sabotage
    ? sabotage.paused
      ? sabotage.heldMs
      : sabotage.endsAt !== null
        ? Math.max(0, sabotage.endsAt - now)
        : sabotage.remaining_ms
    : 0

  return (
    <main className={`display display--${phase}`}>
      {phase === 'waiting' ? (
        <LobbyPanel
          count={joined.length}
          names={joined}
          note="Sign in on your iPad to join."
        />
      ) : (
        <div className="hud hud--display hud--stage">
          <div className="hud__matrix" aria-hidden="true" />
          <div className="hud__frame">
            <div className="hud__inner">
              <span className="hud__corner hud__corner--tl" aria-hidden="true" />
              <span className="hud__corner hud__corner--tr" aria-hidden="true" />
              <span className="hud__corner hud__corner--bl" aria-hidden="true" />
              <span className="hud__corner hud__corner--br" aria-hidden="true" />

              <div className="hud__tab">Arcade FTW</div>

              <div className="hud__bar">
                <span className="hud__chevrons" aria-hidden="true" />
                <span className="hud__event">{node?.title ?? '—'}</span>
                <span className="hud__status">
                  <span className="hud__dot" aria-hidden="true" />
                  {phase === 'paused' ? 'paused' : phase === 'finished' ? 'finished' : 'live'}
                </span>
                {/* The display only ever has one clock, so it always shows the
                    node's remaining time - unlike the player screen, where the
                    game's own timer would otherwise compete with it. */}
                <span className="display__clock">
                  {formatClock(node?.game === 'sabotage' ? sabotageRemaining : remaining)}
                </span>
                <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
              </div>

              <div className="hud__stage display__stage" data-screen={node?.game ?? node?.type ?? 'none'}>

          {node?.type === 'game' && node?.game === 'data_shadow' && <PostOnScreen />}

          {node?.game === 'sabotage' && <SabotageOnScreen />}

          {node?.type === 'leaderboard' && (
            <RoomLeaderboard key={node.section} code={code} section={node.section} />
          )}

          {node?.type === 'opening' && <OpeningOnScreen node={node} remainingMs={remaining} />}

          {node?.type === 'intro' && (
            <Welcome
              elapsedMs={Math.max(0, (node.duration_sec ?? 0) * 1000 - remaining)}
              size="display"
            />
          )}

          {question && (node?.game === 'hallucination' || node?.type === 'quiz') && (
            <>
              {quizReviewing ? (
                // The answer is closed: the room gets the standings for the five
                // seconds the iPads spend on the verdict.
                <div className="display__liveboard">
                  <p className="display__liveboardhead">Standings</p>
                  <RoomLeaderboard key={`live-${question.index}`} code={code} section="ultimate" />
                </div>
              ) : (
                <QuestionOnScreen
                  kind={node?.game === 'hallucination' ? 'hallucination' : 'quiz'}
                  index={question.index}
                  seed={`${code}:${nodeIndex}`}
                />
              )}
              <p className="display__kicker">
                question {question.index + 1} / {question.count}
              </p>
            </>
          )}

          {phase === 'playing' &&
            !question &&
            !['leaderboard', 'opening', 'intro'].includes(node?.type ?? '') && (
            <p className="display__look">Answer on your iPad →</p>
          )}
          {phase === 'finished' && (
            <p className="display__look">That's the show. Thank you for playing.</p>
          )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
