import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  clearToken,
  currentRoom,
  fetchEvents,
  fetchSession,
  joinRoom,
  type PlayerSession,
} from '../../api'
import DataShadowGame from '../../games/dataShadow/DataShadowGame'
import HallucinationGame from '../../games/hallucination/HallucinationGame'
import QuizGame from '../../games/quiz/QuizGame'
import { useGameSocket } from '../../hooks/useGameSocket'
import { useTicker } from '../../hooks/useTicker'
import { useGameStore, type FlowNode } from '../../store/gameStore'
import './PlayPage.css'

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Game screens that run their own countdown.
 *
 * The shell clock shows the node's remaining time, which for these screens is a
 * different number from the timer the player is acting on. Two disagreeing
 * countdowns on one screen is simply confusing.
 */
function ownsTimer(node: FlowNode): boolean {
  return node.game === 'hallucination' || node.game === 'data_shadow' || node.type === 'quiz'
}

/**
 * The player's waiting room. Three things, in this order: what this is, who they
 * are, and that nothing is expected of them yet. No roster, no clock, no chrome -
 * the screen is held for a minute at most.
 */
function WaitingRoom({ nickname, eventName }: { nickname: string; eventName: string }) {
  return (
    <div className="wait">
      <h1 className="wait__title">
        <span className="wait__brand">AI Cyber Arcade</span>
        <span className="wait__event">{eventName}</span>
      </h1>
      <p className="wait__hi">
        Hi, <strong>{nickname}</strong>
      </p>
      <p className="wait__note">Waiting for the host to start the show…</p>
    </div>
  )
}

function NodeStage({ node, nodeIndex }: { node: FlowNode | null; nodeIndex: number }) {
  if (!node) {
    return (
      <div className="stage stage--waiting">
        <p>Syncing…</p>
      </div>
    )
  }

  // The key remounts per node, so answers never carry into the next round.
  if (node.game === 'hallucination') return <HallucinationGame key={nodeIndex} />
  if (node.game === 'data_shadow') return <DataShadowGame key={nodeIndex} />
  if (node.type === 'quiz') return <QuizGame key={nodeIndex} />

  const kind = node.game ?? node.type
  const stageClass = node.game ? `stage--${node.type} stage--${node.game}` : `stage--${node.type}`
  return (
    <div className={`stage ${stageClass}`}>
      <span className="stage__kind">{kind}</span>
      <h2>{node.title ?? node.game ?? 'Untitled node'}</h2>
      <p className="stage__note">
        {node.type === 'game'
          ? `Placeholder for the ${node.game} game.`
          : node.type === 'quiz'
            ? 'Placeholder for a quiz round.'
            : 'Placeholder screen.'}
      </p>
    </div>
  )
}

/** How long a finished round keeps its closing screen before signing out. */
const WRAP_UP_MS = 8000

export default function PlayPage() {
  // A QR-scanned URL pins a device to a room; `/play` follows the current round.
  const { code: pinned } = useParams()
  const navigate = useNavigate()
  const now = useTicker()
  const [session, setSession] = useState<PlayerSession | null>(null)
  const [checked, setChecked] = useState(false)
  const [resolved, setResolved] = useState<string | null>(null)
  const [eventName, setEventName] = useState('')

  const code = pinned ?? resolved ?? ''

  useGameSocket(code)

  const phase = useGameStore((state) => state.phase)
  const node = useGameStore((state) => state.node)
  const index = useGameStore((state) => state.index)
  const nodeCount = useGameStore((state) => state.nodeCount)
  const endsAt = useGameStore((state) => state.endsAt)
  const heldMs = useGameStore((state) => state.heldMs)
  const connection = useGameStore((state) => state.connection)
  const sawPlaying = useGameStore((state) => state.sawPlaying)

  useEffect(() => {
    void fetchSession().then((found) => {
      setSession(found && !found.isAdmin && found.nickname ? (found as PlayerSession) : null)
      setChecked(true)
    })
  }, [])

  // The event name for the heading comes from the backend's own list, so it can
  // never disagree with the label they picked at sign-in.
  useEffect(() => {
    if (!session) return
    let live = true
    void fetchEvents()
      .then((events) => {
        const match = events.find((option) => option.key === session.event)
        if (live) setEventName(match?.label ?? '')
      })
      .catch(() => {
        // The heading degrades to the brand alone rather than blocking the screen.
      })
    return () => {
      live = false
    }
  }, [session])

  // Nobody scans anything: the device asks which round is current, and keeps
  // asking, so a new round picks everyone up where they are.
  useEffect(() => {
    if (!session || pinned) return
    let live = true
    const pull = () =>
      currentRoom()
        .then((found) => {
          if (live) setResolved(found.code)
        })
        .catch(() => {
          // No round exists yet; the connection dot already says so.
        })
    void pull()
    const id = window.setInterval(() => void pull(), 3000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [session, pinned])

  // Membership is stored server-side, so the roster knows this device is in the
  // room before it has answered anything.
  useEffect(() => {
    if (!session || !code) return
    void joinRoom(code).catch(() => {
      // A missing room is not fatal here: the socket reports the same problem.
    })
  }, [session, code])

  // The round is over: show the closing screen, then come back to login so the
  // next round starts from a clean device. A device that logs in *after* the
  // round ended did not play it, so it waits here instead of being bounced
  // straight back to the login page.
  useEffect(() => {
    if (phase !== 'finished' || !sawPlaying) return
    const id = window.setTimeout(() => {
      clearToken()
      navigate('/', { replace: true })
    }, WRAP_UP_MS)
    return () => window.clearTimeout(id)
  }, [phase, sawPlaying, navigate])

  if (!checked) return null
  if (!session) return <Navigate to="/" replace />

  const remaining = endsAt !== null ? Math.max(0, endsAt - now) : heldMs
  // A finished round is the signal that this device's round is over - the room
  // and the player are locked together.
  const roomMissing = !pinned && resolved === null

  return (
    <main className="game">
      {phase !== 'idle' && (
      <header className="game__bar">
        <span className={`dot dot--${connection}`} />
        <span className="game__conn">{connection}</span>
        {session.nickname && <span className="play__who">{session.nickname}</span>}
        <span className="game__progress">
          node {Math.min(index + 1, nodeCount)} / {nodeCount}
        </span>
        {node && !ownsTimer(node) && (
          <span className="game__clock">{formatClock(remaining)}</span>
        )}
        <button
          type="button"
          className="game__signout"
          onClick={() => {
            clearToken()
            navigate('/', { replace: true })
          }}
        >
          sign out
        </button>
      </header>
      )}

      {roomMissing || (phase === 'idle' && !code) ? (
        <div className="wait">
          <h1 className="wait__title">
            <span className="wait__brand">AI Cyber Arcade</span>
            <span className="wait__event">{eventName}</span>
          </h1>
          <p className="wait__hi">Between rounds</p>
          <p className="wait__note">Waiting for the host to open the next show…</p>
        </div>
      ) : phase === 'finished' && sawPlaying ? (
        <div className="wait">
          <h1 className="wait__title">
            <span className="wait__brand">AI Cyber Arcade</span>
            <span className="wait__event">{eventName}</span>
          </h1>
          <p className="wait__hi">Thanks for playing</p>
          <p className="wait__note">That's a wrap — signing you out…</p>
        </div>
      ) : phase === 'finished' ? (
        <div className="wait">
          <h1 className="wait__title">
            <span className="wait__brand">AI Cyber Arcade</span>
            <span className="wait__event">{eventName}</span>
          </h1>
          <p className="wait__hi">Between rounds</p>
          <p className="wait__note">Waiting for the host to open the next show…</p>
        </div>
      ) : phase === 'idle' ? (
        <WaitingRoom nickname={session.nickname} eventName={eventName} />
      ) : (
        <NodeStage node={node} nodeIndex={index} />
      )}
    </main>
  )
}
