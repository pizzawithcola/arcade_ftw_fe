import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { DEFAULT_ROOM, fetchSession, type Session } from '../../api'
import { BLOCKS, POST_META } from '../../games/dataShadow/content'
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

export default function DisplayPage() {
  const { code = DEFAULT_ROOM } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)

  useGameSocket(code)
  const now = useTicker()

  const phase = useGameStore((state) => state.phase)
  const node = useGameStore((state) => state.node)
  const index = useGameStore((state) => state.index)
  const nodeCount = useGameStore((state) => state.nodeCount)
  const endsAt = useGameStore((state) => state.endsAt)
  const heldMs = useGameStore((state) => state.heldMs)
  const connection = useGameStore((state) => state.connection)

  useEffect(() => {
    void fetchSession().then((found) => {
      setSession(found && found.isAdmin ? found : null)
      setChecked(true)
    })
  }, [])

  if (!checked) return null
  if (!session) {
    return <StaffLogin scope="display" title="Arcade FTW" onSignedIn={setSession} />
  }

  const joinUrl = `${location.origin}/?room=${encodeURIComponent(code)}`
  const remaining = endsAt !== null ? Math.max(0, endsAt - now) : heldMs

  return (
    <main className={`display display--${phase}`}>
      <header className="display__bar">
        <span className="display__brand">Arcade FTW</span>
        <span className="display__room">room {code}</span>
        <span className={`dot dot--${connection}`} />
      </header>

      {phase === 'idle' ? (
        <section className="display__join">
          <div>
            <h1 className="display__joinTitle">Join the game</h1>
            <p className="display__joinNote">Scan the code with your iPad, or go to</p>
            <p className="display__url">{joinUrl.replace(/^https?:\/\//, '')}</p>
            <p className="display__joinNote">and pick a name. No password.</p>
          </div>
          <div className="display__qr">
            <QRCodeSVG value={joinUrl} size={260} bgColor="#ffffff" fgColor="#0b0f1a" />
          </div>
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
          <p className="display__clock">{formatClock(remaining)}</p>

          {node?.game === 'data_shadow' && <PostOnScreen />}

          {phase === 'playing' && (
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
