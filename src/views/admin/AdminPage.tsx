import { useCallback, useEffect, useState } from 'react'
import {
  clearToken,
  fetchSession,
  listRooms,
  roomAction,
  type RoomSnapshot,
  type Session,
} from '../../api'
import StaffLogin from '../StaffLogin'
import './AdminPage.css'

const ACTIONS = ['start', 'pause', 'resume', 'finish', 'reset'] as const

/**
 * The operator console.
 *
 * Controls used to live inside the player page, which meant any screen holding
 * an admin token could drive the show - including the big screen. They belong
 * here and nowhere else.
 */
export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState(false)
  const [rooms, setRooms] = useState<RoomSnapshot[]>([])
  const [selected, setSelected] = useState<string>('main')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetchSession().then((found) => {
      setSession(found && found.canControl ? found : null)
      setChecked(true)
    })
  }, [])

  const load = useCallback(
    () =>
      listRooms()
        .then((loaded) => {
          setRooms(loaded)
          setError('')
        })
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : String(caught))
        }),
    [],
  )

  useEffect(() => {
    if (!session) return
    void load()
    // Polling is enough here: this screen is about the room, not a 60fps feed.
    const id = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(id)
  }, [session, load])

  if (!checked) return null
  if (!session) {
    return <StaffLogin scope="full" title="Operator" onSignedIn={setSession} />
  }

  const run = async (action: string) => {
    setBusy(true)
    try {
      await roomAction(selected, action)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const room = rooms.find((item) => item.code === selected)

  return (
    <main className="admin">
      <header className="admin__bar">
        <h1>Arcade FTW · Operator</h1>
        <button
          type="button"
          onClick={() => {
            clearToken()
            location.assign('/')
          }}
        >
          sign out
        </button>
      </header>

      <div className="admin__grid">
        <section className="admin__panel">
          <h2>Rooms</h2>
          <ul className="admin__rooms">
            {rooms.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  className={item.code === selected ? 'is-current' : ''}
                  onClick={() => setSelected(item.code)}
                >
                  <span className="admin__code">{item.code}</span>
                  <span className={`admin__phase is-${item.state.phase}`}>{item.state.phase}</span>
                  <span className="admin__meta">
                    node {item.state.index + 1}/{item.state.node_count} · {item.clients} online
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="admin__panel admin__panel--wide">
          <h2>{selected}</h2>
          <p className="admin__node">{room?.state.node?.title ?? '—'}</p>

          <div className="admin__controls">
            {ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                disabled={busy}
                onClick={() => void run(action)}
              >
                {action}
              </button>
            ))}
          </div>

          <p className="admin__hint">
            Jump straight to a node instead of waiting for the clock:
          </p>
          <div className="admin__jumps">
            {Array.from({ length: room?.state.node_count ?? 0 }, (_, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                className={i === room?.state.index ? 'is-current' : ''}
                onClick={() => void run(`go/${i}`)}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {error && <p className="admin__error">{error}</p>}
        </section>
      </div>
    </main>
  )
}
