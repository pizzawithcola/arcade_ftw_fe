import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchSession, isAuthError, listRooms, roomRoster, type Session } from '../../api'
import { BLOCKS, POST_META } from '../../games/dataShadow/content'
import { HALLUCINATION_QUESTIONS } from '../../games/hallucination/content'
import { QUIZ_QUESTIONS } from '../../games/quiz/content'
import RoomLeaderboard from '../../components/RoomLeaderboard'
import { useGameSocket } from '../../hooks/useGameSocket'
import { useTicker } from '../../hooks/useTicker'
import { useGameStore } from '../../store/gameStore'
import StaffLogin from '../StaffLogin'
import './DisplayPage.css'

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** The Data Shadow post is one static page, so the big screen can show it whole. */
function PostOnScreen() {
  return (
    <article className="display__post">
      <header className="display__posthead">
        <span className="display__avatar">{POST_META.initials}</span>
        <span>
          <strong>{POST_META.author}</strong>
          <em>{POST_META.headline}</em>
        </span>
      </header>
      {BLOCKS.slice(0, -1).map((block, index) => (
        <p key={index}>{block}</p>
      ))}
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
 * The question the whole room is answering.
 *
 * The engine says which one is current, so the screen and the iPads cannot
 * disagree. Options stay on the iPad: the screen is there to be read from six
 * metres away, and four options are not.
 */
function QuestionOnScreen({ kind, index }: { kind: 'hallucination' | 'quiz'; index: number }) {
  if (kind === 'hallucination') {
    const question = HALLUCINATION_QUESTIONS[index]
    if (!question) return null
    return (
      <article className="display__question">
        <p className="display__prompt">{question.prompt}</p>
        <p className="display__reply">{question.reply}</p>
        <p className="display__look">Trust it, or doubt it — on your iPad.</p>
      </article>
    )
  }

  const question = QUIZ_QUESTIONS[index]
  if (!question) return null
  return (
    <article className="display__question">
      <p className="display__prompt">{question.text}</p>
      <p className="display__look">Pick A, B, C or D on your iPad.</p>
    </article>
  )
}

/** The Sabotage big-screen view: scenario, hidden votes, the spent wall, result. */
function SabotageOnScreen() {
  const sabotage = useGameStore((state) => state.sabotage)
  if (!sabotage || !sabotage.scenario) return null

  const scenario = sabotage.scenario
  const votePhase =
    sabotage.phase === 'attack' || sabotage.phase === 'defend' || sabotage.phase === 'tie_break'

  if (sabotage.phase === 'team_reveal') {
    return (
      <article className="display__question">
        <p className="display__prompt">Look at your tablet. Find your team.</p>
        <p className="display__look">Shared team budget: $100,000 each.</p>
      </article>
    )
  }

  if (votePhase) {
    const attacking = sabotage.phase === 'attack'
    return (
      <article className="display__question">
        <p className="display__prompt">
          {attacking ? scenario.attack_title : scenario.defence_title}
        </p>
        <p className="display__reply">
          {attacking ? scenario.attack_prompt : scenario.defence_prompt}
        </p>
        <p className="display__look">
          {attacking ? 'Choose one AI capability on your iPad.' : 'Choose your response on your iPad.'}
        </p>
        {sabotage.spent.length > 0 && (
          <p className="display__look">
            Spent: {sabotage.spent.map((id) => sabotage.cards.attack[id]?.name ?? id).join(' · ')}
          </p>
        )}
      </article>
    )
  }

  if (sabotage.phase === 'resolve' && sabotage.last_result) {
    const r = sabotage.last_result
    return (
      <article className="display__question">
        <p className="display__prompt">
          {r.outcome === 'blocked'
            ? `${r.defender.toUpperCase()} WINS THE ROUND`
            : r.outcome === 'failed'
              ? `${r.attacker.toUpperCase()} WINS THE ROUND`
              : 'STANDOFF'}
        </p>
        <p className="display__reply">
          {sabotage.cards.attack[r.attack_card]?.name ?? r.attack_card} vs{' '}
          {sabotage.cards.defence[r.defence_card]?.name ?? r.defence_card}
        </p>
        <p className="display__look">
          Red {sabotage.scores.red} · Blue {sabotage.scores.blue}
        </p>
      </article>
    )
  }

  return (
    <article className="display__question">
      <p className="display__prompt">
        {sabotage.last_result?.winner
          ? `${sabotage.last_result.winner.toUpperCase()} TEAM WINS`
          : 'Sabotage complete'}
      </p>
      <p className="display__look">
        Red {sabotage.scores.red} · Blue {sabotage.scores.blue}
      </p>
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
  const index = useGameStore((state) => state.index)
  const nodeCount = useGameStore((state) => state.nodeCount)
  const endsAt = useGameStore((state) => state.endsAt)
  const heldMs = useGameStore((state) => state.heldMs)
  const connection = useGameStore((state) => state.connection)
  const question = useGameStore((state) => state.question)
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
        <section className="display__lobby">
          <p className="display__kicker">Get ready</p>
          <h1 className="display__lobbyTitle">Waiting Room</h1>
          <p className="display__lobbyEmpty">The host opens the round shortly.</p>
        </section>
      </main>
    )
  }

  const remaining = endsAt !== null ? Math.max(0, endsAt - now) : heldMs
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
      <header className="display__bar">
        <span className="display__brand">Arcade FTW</span>
        <span className={`dot dot--${connection}`} />
      </header>

      {phase === 'waiting' ? (
        <section className="display__lobby">
          <p className="display__kicker">Get ready</p>
          <h1 className="display__lobbyTitle">Waiting Room</h1>

          <p className="display__lobbyCount">
            <span className="display__pulse" />
            <strong>{joined.length}</strong>
            {joined.length === 1 ? ' player joined' : ' players joined'}
          </p>

          {joined.length > 0 ? (
            <ul className="display__names">
              {joined.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <p className="display__lobbyEmpty">Sign in on your iPad to join.</p>
          )}

          <p className="display__lobbyNote">
            The round starts on its own — keep the iPad awake.
          </p>
        </section>
      ) : (
        <section className="display__stage">
          <p className="display__kicker">
            node {Math.min(index + 1, nodeCount)} / {nodeCount}
            {phase === 'paused' && ' · paused'}
            {phase === 'finished' && ' · finished'}
          </p>
          <h1 className="display__title">{node?.title ?? '—'}</h1>

          {/* The display only ever has one clock, so it always shows the node's
              remaining time - unlike the player screen, where the game's own
              timer would otherwise compete with it. */}
          <p className="display__clock">
            {formatClock(node?.game === 'sabotage' ? sabotageRemaining : remaining)}
          </p>

          {node?.game === 'data_shadow' && <PostOnScreen />}

          {node?.game === 'sabotage' && <SabotageOnScreen />}

          {node?.type === 'leaderboard' && (
            <RoomLeaderboard key={node.section} code={code} section={node.section} />
          )}

          {question &&
            (node?.game === 'hallucination' || node?.type === 'quiz') && (
              <QuestionOnScreen
                kind={node?.game === 'hallucination' ? 'hallucination' : 'quiz'}
                index={question.index}
              />
            )}

          {question && (node?.game === 'hallucination' || node?.type === 'quiz') && (
            <p className="display__kicker">
              question {question.index + 1} / {question.count}
            </p>
          )}

          {phase === 'playing' && !question && node?.type !== 'leaderboard' && (
            <p className="display__look">Answer on your iPad →</p>
          )}
          {phase === 'finished' && (
            <p className="display__look">That's the show. Thank you for playing.</p>
          )}
        </section>
      )}
    </main>
  )
}
