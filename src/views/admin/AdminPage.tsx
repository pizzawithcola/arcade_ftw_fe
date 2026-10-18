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
  const phase = room?.state.phase ?? 'idle'
  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Show control</h2>
        <label className="admin__select">
          <span>room</span>
          {/* A one-option list today; the picker exists so a second room does
              not need this screen rewritten. */}
          <select value={selected} onChange={(event) => onSelect(event.target.value)}>
            {rooms.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="admin__node">{room?.state.node?.title ?? '—'}</p>
      <p className="admin__hint">
        <span className={`admin__phase is-${phase}`}>{phase}</span> · node{' '}
        {room ? room.state.index + 1 : 0} / {room?.state.node_count ?? 0} ·{' '}
        {room?.players ?? 0} joined · {room?.clients ?? 0} online
      </p>

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
  )
}

type DataTab = 'rooms' | 'players'

function DataView({
  rooms,
  selected,
  onSelect,
  players,
}: {
  rooms: RoomSnapshot[]
  selected: string
  onSelect: (code: string) => void
  players: PlayerRow[]
}) {
  const [tab, setTab] = useState<DataTab>('rooms')

  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Arcade Data</h2>
        <div className="admin__toggle" role="tablist" aria-label="Data view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'rooms'}
            className={tab === 'rooms' ? 'is-active' : ''}
            onClick={() => setTab('rooms')}
          >
            Rooms
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'players'}
            className={tab === 'players' ? 'is-active' : ''}
            onClick={() => setTab('players')}
          >
            Players
          </button>
        </div>
      </div>

      {tab === 'rooms' ? (
        <RoomsTable
          rooms={rooms}
          selected={selected}
          onOpenPlayers={(code) => {
            onSelect(code)
            setTab('players')
          }}
        />
      ) : (
        <PlayersTable players={players} room={selected} />
      )}
    </section>
  )
}

function RoomsTable({
  rooms,
  selected,
  onOpenPlayers,
}: {
  rooms: RoomSnapshot[]
  selected: string
  onOpenPlayers: (code: string) => void
}) {
  if (rooms.length === 0) return <p className="admin__hint">No rooms yet.</p>
  return (
    <div className="admin__table-wrap">
      <table className="admin__table">
        <thead>
          <tr>
            <th scope="col">Room</th>
            <th scope="col">Label</th>
            <th scope="col">Event</th>
            <th scope="col">Phase</th>
            <th scope="col">Node</th>
            <th scope="col">Joined</th>
            <th scope="col">Online</th>
            <th scope="col">Players</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((item) => (
            <tr key={item.code} className={item.code === selected ? 'is-current' : ''}>
              <td>{item.code}</td>
              <td className="admin__dim">{item.label ?? '—'}</td>
              <td className="admin__dim">{item.event ?? '—'}</td>
              <td className={`admin__phase is-${item.state.phase}`}>{item.state.phase}</td>
              <td>
                {item.state.index + 1} / {item.state.node_count}
              </td>
              <td>{item.players}</td>
              <td>{item.clients}</td>
              {/* Opening the roster is the only reason to pick a room here, so it
                  is a column rather than a whole row that reacts to a click. */}
              <td>
                <button type="button" onClick={() => onOpenPlayers(item.code)}>
                  view
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayersTable({ players, room }: { players: PlayerRow[]; room: string }) {
  if (players.length === 0) {
    return <p className="admin__hint">Nobody has joined {room} yet.</p>
  }
  return (
    <>
      <p className="admin__hint">
        Room · {room} · {players.length} {players.length === 1 ? 'player' : 'players'}, best score
        first
      </p>
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
                {/* A missing score row means no game has written one yet, which
                    reads as zero rather than as a blank cell. */}
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
    </>
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
