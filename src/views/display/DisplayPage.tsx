import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { fetchSession, isAuthError, listRooms, roomRoster, type Session } from '../../api'
import { BLOCKS, IMAGES, POST_META } from '../../games/dataShadow/content'
import { HALLUCINATION_QUESTIONS } from '../../games/hallucination/content'
import { bankOptions } from '../../games/quiz/bank'
import { BASE_POINTS, drawQuestions, pointsFor, slotAt } from '../../games/quiz/draw'
import { quizTimeline, sittingAt } from '../../games/quiz/timeline'
import Welcome from '../../games/Welcome'
import WrapUp from '../../games/WrapUp'
import Opening from '../../games/Opening'
import { BattleRules } from '../../games/sabotage/SabotageGame'
import { outcomeLabel } from '../../games/sabotage/revealCopy'
import RoomLeaderboard from '../../components/RoomLeaderboard'
import '../../games/hallucination/HallucinationGame.css'
import '../hud.css'
import { useGameSocket } from '../../hooks/useGameSocket'
import { useTicker } from '../../hooks/useTicker'
import {
  useGameStore,
  type FlowNode,
  type QuestionState,
  type SabotageState,
  type SabotageTeam,
} from '../../store/gameStore'
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
  // The round is a line of segments, not a division: a bonus question opens
  // with a three second card. Walking the same schedule the iPads walk is the
  // only way the wall and the tablets cannot end up a question apart.
  const sitting = sittingAt(
    quizTimeline({
      count,
      secondsEachMs: eachMs,
      bonusIntroMs: (node?.bonus_intro_sec ?? 0) * 1000,
      bonusQuestions: node?.bonus_questions ?? [],
    }),
    stage,
  )
  if (!sitting) return null
  const { kind, index, ms } = sitting.segment
  const leftMs = Math.max(0, Math.round(ms - sitting.inMs))
  return {
    index,
    count,
    seconds_each: each,
    // A bonus card is not question time, so the question's own clock has not
    // started: report it full, and nothing thinks the answers have closed.
    remaining_ms: kind === 'bonus' ? eachMs : leftMs,
    intro_ms: Math.max(0, Math.round(introMs - elapsed)),
    bonus_ms: kind === 'bonus' ? leftMs : 0,
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
/** The digits a reel runs through before it lands, same count as the tablet's. */
const BONUS_REEL_DIGITS = 9

/** The bonus card, sized for a projector rather than a tablet.
 *
 * Same machine as the iPad's card, scaled up: the reel is the only thing moving
 * on screen, so it has to be legible from the back of the room.
 */
function BonusOnScreen({ index, multiplier }: { index: number; multiplier: number }) {
  const cells = BONUS_REEL_DIGITS * 2 + 1
  const strip = [
    ...Array.from({ length: BONUS_REEL_DIGITS * 2 }, (_, at) => (at % BONUS_REEL_DIGITS) + 1),
    multiplier,
  ]
  return (
    <article className="display__bonus">
      <div className="display__bonusgrid" aria-hidden="true" />
      <div className="display__bonusbulbs" aria-hidden="true">
        {Array.from({ length: 18 }, (_, at) => (
          <span key={at} style={{ '--bulb': at } as CSSProperties} />
        ))}
      </div>
      <p className="display__bonustag">Bonus round</p>
      <div className="display__reel">
        <span className="display__reeldial is-top" aria-hidden="true" />
        <div
          className="display__reelstrip"
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
        <span className="display__reeldial is-bottom" aria-hidden="true" />
      </div>
      <p className="display__bonusworth">
        Gain <b>{pointsFor(index)}</b> instead of {BASE_POINTS}
      </p>
    </article>
  )
}

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

/** One round of the match, for the rail across the top of every battle screen. */
function RoundRail({ sabotage }: { sabotage: SabotageState }) {
  return (
    <ol className="battle__rail" aria-hidden="true">
      {Array.from({ length: sabotage.rounds }, (_, at) => {
        const number = at + 1
        const played = sabotage.history.find((result) => result.round === number)
        const state =
          number === sabotage.round && sabotage.phase !== 'final'
            ? 'is-now'
            : played
              ? played.winner
                ? 'is-done'
                : 'is-void'
              : ''
        return (
          <li key={number} className={`battle__railstep ${state}`}>
            R{number}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One team, named in its own colour, with what it has left to spend.
 *
 * When the round names a job the chip takes the job's colour instead of the
 * side's: purple is what attacks and blue is what defends, on every panel, and a
 * defender drawn in the attacker's purple is the one thing a viewer reads wrong.
 */
function TeamChip({
  sabotage,
  team,
  role,
  spent,
}: {
  sabotage: SabotageState
  team: SabotageTeam
  role?: 'attacks' | 'defends'
  /** What this round cost the side, for the panel under the hands. */
  spent?: number
}) {
  const left = sabotage.budget[team] ?? 0
  const share = sabotage.total_budget > 0 ? left / sabotage.total_budget : 0
  const tone = role === 'attacks' ? 'is-atk' : role === 'defends' ? 'is-def' : ''
  return (
    <div className={`battle__team is-${team} ${tone}`.trim()}>
      <span className="battle__teamname">{sabTeam(team)}</span>
      {role && <span className="battle__teamrole">{role.toUpperCase()}</span>}
      {spent !== undefined && (
        <span className="battle__teamspent">{sabMoney(spent)} spent this round</span>
      )}
      <span className="battle__teammoney">{sabMoney(left)}</span>
      <span className="battle__teambar" aria-hidden="true">
        <span style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
      </span>
      <span className="battle__teamcount">{sabotage.teams[team]?.length ?? 0} players</span>
    </div>
  )
}

/** The one thing moving while the room buys: the attack going in and the
 *  defence taking it, three lanes, one per column. No card is public yet, so
 *  this is the whole of what the wall can honestly show. */
function Clash({ sabotage }: { sabotage: SabotageState }) {
  return (
    <div className="battle__clash" aria-hidden="true">
      <div className="battle__clashhead">
        <span className="battle__brieftag is-atk">{sabTeam(sabotage.attacker)} ATTACKS</span>
        <span className="battle__brieftag is-def">{sabTeam(sabotage.defender)} DEFENDS</span>
      </div>
      <ul className="battle__lanes">
        {sabotage.domains.map((domain, at) => (
          <li
            key={domain}
            className="battle__lane"
            style={{ '--lane': at } as CSSProperties}
          >
            <span className="battle__lanename">{SAB_DOMAIN[domain]}</span>
            <span className="battle__lanetrack">
              <span className="battle__lanebolt" />
              <span className="battle__lanehit" />
              <span className="battle__laneshield" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The wall of the whole round: who is on it, what is at stake, what is left. */
function BattleBoard({ sabotage }: { sabotage: SabotageState }) {
  if (sabotage.phase === 'team_reveal') {
    return (
      <article className="battle">
        <p className="battle__eyebrow">Two sides · one budget</p>
        <p className="battle__headline">Find your colour</p>
        <div className="battle__teams">
          <TeamChip sabotage={sabotage} team="red" />
          <TeamChip sabotage={sabotage} team="blue" />
        </div>
      </article>
    )
  }

  if (sabotage.phase === 'brief') {
    return (
      <article className="battle">
        <RoundRail sabotage={sabotage} />
        <BattleRules sabotage={sabotage} size="display" />
      </article>
    )
  }

  if (sabotage.phase === 'select') {
    return (
      <article className="battle">
        <RoundRail sabotage={sabotage} />
        <p className="battle__eyebrow">
          Round {sabotage.round} of {sabotage.rounds}
        </p>
        <p className="battle__headline">{sabotage.theme}</p>
        <Clash sabotage={sabotage} />
        <div className="battle__teams">
          <TeamChip sabotage={sabotage} team="red" />
          <TeamChip sabotage={sabotage} team="blue" />
        </div>
      </article>
    )
  }

  if (sabotage.phase === 'reveal' && sabotage.last_result) {
    const r = sabotage.last_result
    const won = r.winner ? sabTeam(r.winner) : null
    return (
      <article className="battle">
        <RoundRail sabotage={sabotage} />
        <p className="battle__eyebrow">Round {r.round} · {r.theme}</p>
        <p className={`battle__outcome${won ? '' : ' is-draw'}`}>{outcomeLabel(r)}</p>

        {/* Three columns, drawn as the two hands that met in each one. */}
        <ul className="battle__dims">
          {r.dims.map((dim) => (
            <li
              key={dim.domain}
              className={`battle__dim is-${dim.result}${dim.target ? ' is-target' : ''}`}
            >
              <span className="battle__dimname">{SAB_DOMAIN[dim.domain]}</span>
              <span className="battle__dimbar is-atk" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.round((dim.attack / Math.max(1, dim.attack, dim.defence)) * 100)}%`,
                  }}
                />
              </span>
              <b className="battle__dimatk">{dim.attack}</b>
              <b className="battle__dimdef">{dim.defence}</b>
              <span className="battle__dimbar is-def" aria-hidden="true">
                <span
                  style={{
                    width: `${Math.round((dim.defence / Math.max(1, dim.attack, dim.defence)) * 100)}%`,
                  }}
                />
              </span>
              <span className="battle__dimword">
                {dim.result === 'break' ? 'BREACH' : dim.result === 'tie' ? 'TIE' : 'HELD'}
              </span>
            </li>
          ))}
        </ul>

        {/* Both hands are public once the round is scored, so the room gets to
            see what was actually played rather than a summary of it. */}
        <div className="battle__hands">
          <div className="battle__hand is-atk">
            <span className="battle__brieftag">
              {sabTeam(r.attacker)} · {sabMoney(r.attack_cost)}
            </span>
            <ul>
              {r.attack.length === 0 ? (
                <li className="is-none">no cards played</li>
              ) : (
                r.attack.map((id) => <li key={id}>{sabotage.cards[id]?.name ?? id}</li>)
              )}
            </ul>
          </div>
          <div className="battle__hand is-def">
            <span className="battle__brieftag">
              {sabTeam(r.defender)} · {sabMoney(r.defence_cost)}
            </span>
            <ul>
              {r.defence.length === 0 ? (
                <li className="is-none">no cards played</li>
              ) : (
                r.defence.map((id) => <li key={id}>{sabotage.cards[id]?.name ?? id}</li>)
              )}
            </ul>
          </div>
        </div>

        {/* In the order the hands were played, and in the job's colours: the
            left panel is always the attack, whichever side made it. */}
        <div className="battle__teams is-tight">
          <TeamChip
            sabotage={sabotage}
            team={r.attacker}
            role="attacks"
            spent={r.attack_cost}
          />
          <TeamChip
            sabotage={sabotage}
            team={r.defender}
            role="defends"
            spent={r.defence_cost}
          />
        </div>
      </article>
    )
  }

  const red = sabotage.scores.red ?? 0
  const blue = sabotage.scores.blue ?? 0
  const winner = red === blue ? null : red > blue ? 'red' : 'blue'
  return (
    <article className="battle">
      <p className="battle__eyebrow">{sabotage.rounds} rounds played</p>
      <p className={`battle__outcome${winner ? '' : ' is-draw'}`}>
        {winner ? `${sabTeam(winner)} WINS` : 'DRAWN'}
      </p>
      <div className="battle__scoreline">
        {(['red', 'blue'] as const).map((team) => (
          <div key={team} className={`battle__score is-${team}`}>
            <span className="battle__teamname">{sabTeam(team)}</span>
            <b>{sabotage.scores[team] ?? 0}</b>
            <span className="battle__teambar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.round(((sabotage.scores[team] ?? 0) / Math.max(1, red, blue)) * 100)}%`,
                }}
              />
            </span>
            <span className="battle__teamcount">
              {sabotage.rounds_won[team] ?? 0} rounds won
            </span>
          </div>
        ))}
      </div>
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

              <div className="hud__tab">Arcade Fintech Week</div>

              <div className="hud__bar">
                <span className="hud__chevrons" aria-hidden="true" />
                <span className="hud__event">{node?.title ?? '—'}</span>
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

          {node?.game === 'sabotage' && sabotage && <BattleBoard sabotage={sabotage} />}

          {node?.type === 'leaderboard' && (
            <RoomLeaderboard key={node.section} code={code} section={node.section} />
          )}

          {node?.type === 'opening' && <OpeningOnScreen node={node} remainingMs={remaining} />}

          {node?.type === 'outro' && (
            <WrapUp
              elapsedMs={Math.max(0, (node.duration_sec ?? 0) * 1000 - remaining)}
              size="display"
            />
          )}

          {node?.type === 'intro' && (
            <Welcome
              elapsedMs={Math.max(0, (node.duration_sec ?? 0) * 1000 - remaining)}
              size="display"
            />
          )}

          {question && (node?.game === 'hallucination' || node?.type === 'quiz') && (
            <>
              {question.bonus_ms ? (
                // The card that opens a bonus question. The tablets are showing
                // the same thing, so the room and the screens agree on why the
                // next answer is worth more.
                <BonusOnScreen index={question.index} multiplier={slotAt(question.index).multiplier} />
              ) : quizReviewing ? (
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
            !['leaderboard', 'opening', 'intro', 'outro'].includes(node?.type ?? '') &&
            // In the battle only the picking phase is answered on the iPad; under
            // the draw, the rules and the result it was a line of noise.
            (node?.game !== 'sabotage' || sabotage?.phase === 'select') && (
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
