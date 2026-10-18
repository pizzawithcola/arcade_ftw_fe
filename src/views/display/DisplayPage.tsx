import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { fetchSession, isAuthError, listRooms, type Session } from '../../api'
import { BLOCKS, POST_META } from '../../games/dataShadow/content'
import { HALLUCINATION_QUESTIONS } from '../../games/hallucination/content'
import { QUIZ_QUESTIONS } from '../../games/quiz/content'
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

export default function DisplayPage() {
  const { code: pinned } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)

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
        <section className="display__join">
          <h1 className="display__joinTitle">Waiting for the next round</h1>
          <p className="display__joinNote">The operator creates a room to begin.</p>
        </section>
      </main>
    )
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

          {phase === 'playing' && !question && (
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
