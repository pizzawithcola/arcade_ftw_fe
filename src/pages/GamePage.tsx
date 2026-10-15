import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken, fetchSession, gameAction, type Session } from '../api'
import DataShadowGame from '../games/dataShadow/DataShadowGame'
import HallucinationGame from '../games/hallucination/HallucinationGame'
import QuizGame from '../games/quiz/QuizGame'
import { useGameSocket } from '../hooks/useGameSocket'
import { useTicker } from '../hooks/useTicker'
import { useGameStore, type FlowNode, type Phase } from '../store/gameStore'
import './GamePage.css'

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** What the audience sees while a node is running. Real screens replace this. */
function NodeStage({ node, phase, nodeIndex }: { node: FlowNode | null; phase: Phase; nodeIndex: number }) {
  // IDLE is the hand-over state: nothing has run yet, or the operator reset
  // back to the top. Showing node 1 at 0:00 there would look like a stalled
  // show, so the waiting screen stands in for both cases.
  if (!node || phase === 'idle') {
    return (
      <div className="stage stage--waiting">
        <p>Waiting for the show to start…</p>
      </div>
    )
  }

  // A real game owns its whole screen; only the placeholder screens use the
  // shared category layout below. The key remounts the screen per node, so a
  // quiz round cannot carry its answers into the next one.
  if (node.game === 'hallucination') {
    return <HallucinationGame key={nodeIndex} />
  }
  if (node.game === 'data_shadow') {
    return <DataShadowGame key={nodeIndex} />
  }
  if (node.type === 'quiz') {
    return <QuizGame key={nodeIndex} />
  }

  // Games share one category, so keying the styling off the category alone
  // would give all three games the same hook. Keep the category class for the
  // shared look and add the game as a second class for per-game screens.
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

export default function GamePage() {
  useGameSocket()

  const phase = useGameStore((state) => state.phase)
  const node = useGameStore((state) => state.node)
  const index = useGameStore((state) => state.index)
  const nodeCount = useGameStore((state) => state.nodeCount)
  const endsAt = useGameStore((state) => state.endsAt)
  const heldMs = useGameStore((state) => state.heldMs)
  const connection = useGameStore((state) => state.connection)

  const navigate = useNavigate()
  const now = useTicker()
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void fetchSession().then((found) => {
      if (!found) navigate('/login', { replace: true })
      else setSession(found)
    })
  }, [navigate])

  const remaining = endsAt !== null ? Math.max(0, endsAt - now) : heldMs

  const run = async (action: string) => {
    setError('')
    try {
      await gameAction(action)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  return (
    <main className="game">
      <header className="game__bar">
        <span className={`dot dot--${connection}`} />
        <span className="game__conn">{connection}</span>
        <span className="game__phase">{phase}</span>
        <span className="game__progress">
          node {Math.min(index + 1, nodeCount)} / {nodeCount}
        </span>
        <span className="game__clock">{formatClock(remaining)}</span>
        <button
          type="button"
          className="game__signout"
          onClick={() => {
            clearToken()
            navigate('/login', { replace: true })
          }}
        >
          sign out
        </button>
      </header>

      <NodeStage node={node} phase={phase} nodeIndex={index} />

      {session?.isAdmin && (
        <section className="controls">
          <h3>Operator</h3>
          <div className="controls__row">
            <button
              type="button"
              onClick={() => void run('start')}
              // start rewinds to the first node, so it only means "begin the
              // show" before the show has begun. Mid-show the operator wants
              // resume; leaving start enabled there silently teleports the
              // whole show back to node 1.
              disabled={phase !== 'idle' && phase !== 'finished'}
            >
              start
            </button>
            <button type="button" onClick={() => void run('pause')} disabled={phase !== 'playing'}>pause</button>
            <button type="button" onClick={() => void run('resume')} disabled={phase !== 'paused'}>resume</button>
            <button type="button" onClick={() => void run('finish')}>finish</button>
            <button type="button" onClick={() => void run('reset')} disabled={phase === 'idle'}>reset</button>
          </div>
          {nodeCount > 0 && (
            <div className="controls__row controls__row--jump">
              <span>jump to</span>
              {Array.from({ length: nodeCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === index ? 'is-current' : ''}
                  onClick={() => void run(`go/${i}`)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
          {error && <p className="controls__error">{error}</p>}
        </section>
      )}
    </main>
  )
}
