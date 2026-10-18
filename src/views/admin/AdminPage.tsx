import { useCallback, useEffect, useState } from 'react'
import {
  clearToken,
  fetchSession,
  listPlayers,
  listRooms,
  roomAction,
  type PlayerRow,
  type RoomSnapshot,
  type Session,
} from '../../api'
import StaffLogin from '../StaffLogin'
import './AdminPage.css'

const ACTIONS = ['start', 'pause', 'resume', 'finish', 'reset'] as const

type Section = 'console' | 'data' | 'settings'

const SECTIONS: { key: Section; label: string; note: string }[] = [
  { key: 'console', label: 'Arcade Console', note: 'Run the show' },
  { key: 'data', label: 'Arcade Data', note: 'Rooms and players' },
  { key: 'settings', label: 'Game Setting', note: 'Coming later' },
]

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
  const [section, setSection] = useState<Section>('console')
  const [rooms, setRooms] = useState<RoomSnapshot[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
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

  // Players are only pulled while the data section is open: a roster nobody is
  // looking at would be a query every few seconds for nothing.
  useEffect(() => {
    if (!session || section !== 'data') return
    let live = true
    const pull = () =>
      listPlayers({ room: selected })
        .then((rows) => {
          if (live) {
            setPlayers(rows)
            setError('')
          }
        })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof Error ? caught.message : String(caught))
        })
    void pull()
    const id = window.setInterval(() => void pull(), 3000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [session, section, selected])

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

      <div className="admin__shell">
        <nav className="admin__side" aria-label="Admin sections">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-current={section === item.key ? 'page' : undefined}
              className={section === item.key ? 'is-active' : ''}
              onClick={() => setSection(item.key)}
            >
              <span className="admin__side-label">{item.label}</span>
              <span className="admin__side-note">{item.note}</span>
            </button>
          ))}
        </nav>

        <div className="admin__content">
          {section === 'console' && (
            <ConsoleView
              rooms={rooms}
              room={room}
              selected={selected}
              onSelect={setSelected}
              onAction={run}
              busy={busy}
            />
          )}
          {section === 'data' && (
            <DataView
              rooms={rooms}
              room={room}
              selected={selected}
              onSelect={setSelected}
              players={players}
            />
          )}
          {section === 'settings' && <SettingsView />}
          {error && <p className="admin__error">{error}</p>}
        </div>
      </div>
    </main>
  )
}

function RoomsList({
  rooms,
  selected,
  onSelect,
}: {
  rooms: RoomSnapshot[]
  selected: string
  onSelect: (code: string) => void
}) {
  return (
    <ul className="admin__rooms">
      {rooms.map((item) => (
        <li key={item.code}>
          <button
            type="button"
            className={item.code === selected ? 'is-current' : ''}
            onClick={() => onSelect(item.code)}
          >
            <span className="admin__code">{item.code}</span>
            <span className={`admin__phase is-${item.state.phase}`}>{item.state.phase}</span>
            <span className="admin__meta">
              node {item.state.index + 1}/{item.state.node_count} · {item.players} joined ·{' '}
              {item.clients} online
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ConsoleView({
  rooms,
  room,
  selected,
  onSelect,
  onAction,
  busy,
}: {
  rooms: RoomSnapshot[]
  room: RoomSnapshot | undefined
  selected: string
  onSelect: (code: string) => void
  onAction: (action: string) => void
  busy: boolean
}) {
  return (
    <div className="admin__two">
      <section className="admin__panel">
        <h2>Rooms</h2>
        <RoomsList rooms={rooms} selected={selected} onSelect={onSelect} />
      </section>

      <section className="admin__panel admin__panel--wide">
        <h2>{selected}</h2>
        <p className="admin__node">{room?.state.node?.title ?? '—'}</p>

        <div className="admin__controls">
          {ACTIONS.map((action) => (
            <button key={action} type="button" disabled={busy} onClick={() => onAction(action)}>
              {action}
            </button>
          ))}
        </div>

        <p className="admin__hint">Jump straight to a node instead of waiting for the clock:</p>
        <div className="admin__jumps">
          {Array.from({ length: room?.state.node_count ?? 0 }, (_, i) => (
            <button
              key={i}
              type="button"
              disabled={busy}
              className={i === room?.state.index ? 'is-current' : ''}
              onClick={() => onAction(`go/${i}`)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function DataView({
  rooms,
  room,
  selected,
  onSelect,
  players,
}: {
  rooms: RoomSnapshot[]
  room: RoomSnapshot | undefined
  selected: string
  onSelect: (code: string) => void
  players: PlayerRow[]
}) {
  const phase = room?.state.phase ?? 'idle'
  return (
    <div className="admin__two">
      <section className="admin__panel">
        <h2>Rooms</h2>
        <RoomsList rooms={rooms} selected={selected} onSelect={onSelect} />
      </section>

      <div className="admin__stack">
        <section className="admin__panel">
          <h2>Room data · {selected}</h2>
          <dl className="admin__facts">
            <div>
              <dt>phase</dt>
              <dd className={`admin__phase is-${phase}`}>{phase}</dd>
            </div>
            <div>
              <dt>node</dt>
              <dd>
                {room ? `${room.state.index + 1} / ${room.state.node_count}` : '—'}
                {room?.state.node?.title ? ` · ${room.state.node.title}` : ''}
              </dd>
            </div>
            <div>
              <dt>joined</dt>
              <dd>{room?.players ?? 0}</dd>
            </div>
            <div>
              <dt>online</dt>
              <dd>{room?.clients ?? 0}</dd>
            </div>
          </dl>
          <p className="admin__hint">
            Joined is what the database holds for this room; online is live connections. A
            sleeping iPad drops the second and keeps the first.
          </p>
        </section>

        <section className="admin__panel">
          <h2>Players · {players.length}</h2>
          {players.length === 0 ? (
            <p className="admin__hint">Nobody has joined this room yet.</p>
          ) : (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Event</th>
                    <th scope="col">Hallu</th>
                    <th scope="col">Data</th>
                    <th scope="col">Sabotage</th>
                    <th scope="col">Ultimate</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.player_id}>
                      <td>{player.nickname}</td>
                      <td className="admin__dim">{player.event}</td>
                      {/* A missing score row means no game has written one yet,
                          which reads as zero rather than as a blank cell. */}
                      <td>{player.score?.hallucination_score ?? 0}</td>
                      <td>{player.score?.data_score ?? 0}</td>
                      <td>{player.score?.sabotage_score ?? 0}</td>
                      <td>{player.score?.ultimate_score ?? 0}</td>
                      <td className="admin__total">{player.total_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SettingsView() {
  return (
    <section className="admin__panel admin__panel--wide">
      <h2>Game Setting</h2>
      <p className="admin__placeholder">
        Room setup, node durations and event defaults will live here.
      </p>
      <p className="admin__hint">
        Nothing is wired up yet - the flow and its timings are still in
        <code> arcade_ftw_be/app/flow.py</code>.
      </p>
    </section>
  )
}
