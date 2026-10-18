import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  clearToken,
  DEFAULT_ROOM,
  fetchSession,
  joinRoom,
  roomRoster,
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

/** How often the waiting room re-reads the roster. The socket carries the show,
 * not the guest list, so this is a plain poll. */
const ROSTER_POLL_MS = 3000

function WaitingRoom({ nickname, code }: { nickname: string; code: string }) {
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    let live = true
    const load = () => {
      void roomRoster(code)
        .then((entries) => {
          if (live) setNames(entries.map((entry) => entry.nickname))
        })
        .catch(() => {
          // A failed poll says nothing the connection dot is not already saying.
        })
    }
    load()
    const timer = setInterval(load, ROSTER_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [code])

  return (
    <div className="stage stage--waiting play__waiting">
      <span className="play__kicker">You're in</span>
      <h2 className="play__name">{nickname}</h2>
      <p className="play__note">Waiting for the host to start the show…</p>
      {names.length > 0 && (
        <div className="play__roster">
          <p className="play__roster-count">
            {names.length} {names.length === 1 ? 'player' : 'players'} in the room
          </p>
          {/* Nicknames are unique per room (duplicates are numbered), so the name
              is a stable key for the lifetime of the list. */}
          <ul className="play__roster-list">
            {names.map((name) => (
              <li key={name} className={name === nickname ? 'play__chip is-me' : 'play__chip'}>
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="play__hint">Keep this screen open. The round starts on its own.</p>
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

export default function PlayPage() {
  const { code = DEFAULT_ROOM } = useParams()
  useGameSocket(code)

  const navigate = useNavigate()
  const now = useTicker()
  const [session, setSession] = useState<PlayerSession | null>(null)
  const [checked, setChecked] = useState(false)

  const phase = useGameStore((state) => state.phase)
  const node = useGameStore((state) => state.node)
  const index = useGameStore((state) => state.index)
  const nodeCount = useGameStore((state) => state.nodeCount)
  const endsAt = useGameStore((state) => state.endsAt)
  const heldMs = useGameStore((state) => state.heldMs)
  const connection = useGameStore((state) => state.connection)

  useEffect(() => {
    void fetchSession().then(async (found) => {
      if (found && !found.isAdmin && found.nickname) {
        setSession(found as PlayerSession)
        // Membership is stored server-side, so the roster knows this device is
        // in the room before it has answered anything.
        try {
          await joinRoom(code)
        } catch {
          // A missing room is not fatal here: the socket reports the same
          // problem, and the player already sees the connection indicator.
        }
      }
      setChecked(true)
    })
  }, [code])

  if (!checked) return null
  if (!session) return <Navigate to="/" replace />

  const remaining = endsAt !== null ? Math.max(0, endsAt - now) : heldMs

  return (
    <main className="game">
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

      {phase === 'idle' ? (
        <WaitingRoom nickname={session.nickname} code={code} />
      ) : (
        <NodeStage node={node} nodeIndex={index} />
      )}
    </main>
  )
}
