import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addPlayer,
  clearToken,
  createRoom,
  deletePlayer,
  deleteRoom,
  fetchEvents,
  fetchSession,
  isAuthError,
  listPlayers,
  listRooms,
  roomAction,
  updatePlayer,
  updateRoom,
  type EventOption,
  type PlayerRow,
  type RoomSnapshot,
  type Session,
} from '../../api'
import StaffLogin from '../StaffLogin'
import './AdminPage.css'

const ACTIONS = ['start', 'pause', 'resume', 'finish', 'reset'] as const

type Section = 'console' | 'data' | 'settings'
type DataTab = 'rooms' | 'players'

interface RoomDraft {
  /** A new room has no code yet; the server names it `round-N`. */
  isNew: boolean
  code: string
  label: string
  event: string
}

interface PlayerDraft {
  isNew: boolean
  playerId: number | null
  nickname: string
  event: string
  room: string
}

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
  const [tab, setTab] = useState<DataTab>('rooms')
  const shell = useRef<HTMLElement | null>(null)
  const [rooms, setRooms] = useState<RoomSnapshot[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [roomDraft, setRoomDraft] = useState<RoomDraft | null>(null)
  const [playerDraft, setPlayerDraft] = useState<PlayerDraft | null>(null)
  // Empty until the room list arrives: the operator works on the current round.
  const [selected, setSelected] = useState<string>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void fetchSession().then((found) => {
      setSession(found && found.canControl ? found : null)
      setChecked(true)
    })
  }, [])

  useEffect(() => {
    void fetchEvents().then(setEvents).catch(() => setEvents([]))
  }, [])

  const load = useCallback(
    () =>
      listRooms()
        .then((loaded) => {
          setRooms(loaded.rooms)
          // Follow the newest round, but never yank the operator off a room they
          // picked by hand.
          setSelected((chosen) =>
            chosen && loaded.rooms.some((room) => room.code === chosen)
              ? chosen
              : (loaded.current ?? loaded.rooms[0]?.code ?? ''),
          )
          setError('')
        })
        .catch((caught: unknown) => {
          // Signed out from elsewhere (or an expired token): back to the login
          // form rather than a console that silently stops updating.
          if (isAuthError(caught)) {
            setSession(null)
            return
          }
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

  useEffect(() => {
    // Switching panels can otherwise leave the console shifted sideways, because
    // the click that opened the next panel may have scrolled to reach a button.
    shell.current?.scrollTo({ left: 0 })
  }, [section, tab, selected])

  if (!checked) return null
  if (!session) {
    return <StaffLogin scope="full" title="Operator" onSignedIn={setSession} />
  }

  const startRound = async (label: string) => {
    setBusy(true)
    try {
      const created = await createRoom({ label: label.trim() || undefined })
      await load()
      setSelected(created.code)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const saveRoom = async (draft: RoomDraft) => {
    setBusy(true)
    try {
      if (draft.isNew) {
        await createRoom({
          code: draft.code.trim() || undefined,
          label: draft.label.trim() || undefined,
          event: draft.event || undefined,
        })
      } else {
        await updateRoom(draft.code, {
          ...(draft.label ? { label: draft.label } : {}),
          ...(draft.event ? { event: draft.event } : {}),
        })
      }
      setRoomDraft(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const removeRoom = async (code: string) => {
    if (!window.confirm(`Delete room ${code}? Players stay, their membership is cleared.`)) return
    setBusy(true)
    try {
      await deleteRoom(code)
      setRoomDraft(null)
      await load()
    } catch (caught) {
      // A running room refuses to be deleted, which is worth reading out loud.
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const savePlayer = async (draft: PlayerDraft) => {
    setBusy(true)
    try {
      if (draft.isNew) {
        await addPlayer(draft.room || selected, {
          nickname: draft.nickname,
          event: draft.event,
        })
      } else if (draft.playerId !== null) {
        await updatePlayer(draft.playerId, {
          nickname: draft.nickname,
          event: draft.event,
          room_code: draft.room || null,
        })
      }
      setPlayerDraft(null)
      setPlayers(await listPlayers({ room: selected }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const removePlayer = async (player: PlayerRow) => {
    if (!window.confirm(`Delete ${player.nickname}? Their score goes with them.`)) return
    setBusy(true)
    try {
      await deletePlayer(player.player_id)
      setPlayerDraft(null)
      setPlayers(await listPlayers({ room: selected }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
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
    <main className="admin" ref={shell}>
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
              onStartRound={startRound}
              busy={busy}
            />
          )}
          {section === 'data' && (
            <DataView
              rooms={rooms}
              selected={selected}
              onSelect={setSelected}
              players={players}
              events={events}
              tab={tab}
              onTab={setTab}
              busy={busy}
              roomDraft={roomDraft}
              playerDraft={playerDraft}
              onRoomDraft={setRoomDraft}
              onPlayerDraft={setPlayerDraft}
              onSaveRoom={(draft) => void saveRoom(draft)}
              onDeleteRoom={(code) => void removeRoom(code)}
              onSavePlayer={(draft) => void savePlayer(draft)}
              onDeletePlayer={(player) => void removePlayer(player)}
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
  onStartRound,
  busy,
}: {
  rooms: RoomSnapshot[]
  room: RoomSnapshot | undefined
  selected: string
  onSelect: (code: string) => void
  onAction: (action: string) => void
  onStartRound: (label: string) => void
  busy: boolean
}) {
  const phase = room?.state.phase ?? 'idle'
  const [label, setLabel] = useState('')
  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Show control</h2>
        <div className="admin__head-tools">
          <label className="admin__select">
            <span>room</span>
            {/* One room per round, newest first, so the top of the list is the
                round people are about to play. */}
            <select value={selected} onChange={(event) => onSelect(event.target.value)}>
              {rooms.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.code}
                  {item.label ? ` · ${item.label}` : ''}
                </option>
              ))}
            </select>
          </label>
          <span className="admin__new-round">
            <input
              value={label}
              placeholder="label (optional)"
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !busy) {
                  onStartRound(label)
                  setLabel('')
                }
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onStartRound(label)
                setLabel('')
              }}
            >
              new room
            </button>
          </span>
        </div>
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

function DataView({
  rooms,
  selected,
  onSelect,
  players,
  events,
  tab,
  onTab,
  busy,
  roomDraft,
  playerDraft,
  onRoomDraft,
  onPlayerDraft,
  onSaveRoom,
  onDeleteRoom,
  onSavePlayer,
  onDeletePlayer,
}: {
  rooms: RoomSnapshot[]
  selected: string
  onSelect: (code: string) => void
  players: PlayerRow[]
  events: EventOption[]
  tab: DataTab
  onTab: (next: DataTab) => void
  busy: boolean
  roomDraft: RoomDraft | null
  playerDraft: PlayerDraft | null
  onRoomDraft: (draft: RoomDraft | null) => void
  onPlayerDraft: (draft: PlayerDraft | null) => void
  onSaveRoom: (draft: RoomDraft) => void
  onDeleteRoom: (code: string) => void
  onSavePlayer: (draft: PlayerDraft) => void
  onDeletePlayer: (player: PlayerRow) => void
}) {
  // A room's event is optional, so a new one starts blank rather than guessing.
  const openNewRoom = () => onRoomDraft({ isNew: true, code: '', label: '', event: '' })
  const openNewPlayer = () =>
    onPlayerDraft({
      isNew: true,
      playerId: null,
      nickname: '',
      event: events[0]?.key ?? '',
      room: selected,
    })

  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Arcade Data</h2>
        <div className="admin__head-tools">
          <div className="admin__toggle" role="tablist" aria-label="Data view">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'rooms'}
              className={tab === 'rooms' ? 'is-active' : ''}
              onClick={() => onTab('rooms')}
            >
              Rooms
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'players'}
              className={tab === 'players' ? 'is-active' : ''}
              onClick={() => onTab('players')}
            >
              Players
            </button>
          </div>
          <button
            type="button"
            className="admin__create"
            disabled={busy}
            onClick={tab === 'rooms' ? openNewRoom : openNewPlayer}
          >
            {tab === 'rooms' ? '+ new room' : '+ new player'}
          </button>
        </div>
      </div>

      {tab === 'rooms' && roomDraft && (
        <RoomForm
          draft={roomDraft}
          events={events}
          busy={busy}
          onChange={onRoomDraft}
          onCancel={() => onRoomDraft(null)}
          onSave={onSaveRoom}
        />
      )}
      {tab === 'players' && playerDraft && (
        <PlayerForm
          draft={playerDraft}
          rooms={rooms}
          events={events}
          busy={busy}
          onChange={onPlayerDraft}
          onCancel={() => onPlayerDraft(null)}
          onSave={onSavePlayer}
        />
      )}

      {tab === 'rooms' ? (
        <RoomsTable
          rooms={rooms}
          selected={selected}
          busy={busy}
          onOpenPlayers={(code) => {
            onSelect(code)
            onTab('players')
          }}
          onEdit={(room) =>
            onRoomDraft({
              isNew: false,
              code: room.code,
              label: room.label ?? '',
              event: room.event ?? '',
            })
          }
          onDelete={onDeleteRoom}
        />
      ) : (
        <PlayersTable
          players={players}
          room={selected}
          busy={busy}
          onEdit={(player) =>
            onPlayerDraft({
              isNew: false,
              playerId: player.player_id,
              nickname: player.nickname,
              event: player.event,
              room: player.room_code ?? '',
            })
          }
          onDelete={onDeletePlayer}
        />
      )}
    </section>
  )
}

function RoomForm({
  draft,
  events,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: RoomDraft
  events: EventOption[]
  busy: boolean
  onChange: (draft: RoomDraft) => void
  onCancel: () => void
  onSave: (draft: RoomDraft) => void
}) {
  return (
    <form
      className="admin__editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) onSave(draft)
      }}
    >
      <span className="admin__editor-title">{draft.isNew ? 'New room' : `Edit ${draft.code}`}</span>
      {draft.isNew && (
        <label>
          code
          <input
            value={draft.code}
            placeholder="round-1 (blank = next)"
            onChange={(event) => onChange({ ...draft, code: event.target.value })}
          />
        </label>
      )}
      <label>
        label
        <input
          value={draft.label}
          maxLength={80}
          placeholder="optional"
          onChange={(event) => onChange({ ...draft, label: event.target.value })}
        />
      </label>
      <label>
        event
        <select
          value={draft.event}
          onChange={(event) => onChange({ ...draft, event: event.target.value })}
        >
          <option value="">—</option>
          {events.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <span className="admin__editor-actions">
        <button type="submit" disabled={busy}>
          save
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          cancel
        </button>
      </span>
    </form>
  )
}

function PlayerForm({
  draft,
  rooms,
  events,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: PlayerDraft
  rooms: RoomSnapshot[]
  events: EventOption[]
  busy: boolean
  onChange: (draft: PlayerDraft) => void
  onCancel: () => void
  onSave: (draft: PlayerDraft) => void
}) {
  return (
    <form
      className="admin__editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy && draft.nickname.trim()) onSave(draft)
      }}
    >
      <span className="admin__editor-title">
        {draft.isNew ? 'New player' : `Edit ${draft.nickname}`}
      </span>
      <label>
        name
        <input
          value={draft.nickname}
          maxLength={64}
          placeholder="nickname"
          onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
        />
      </label>
      <label>
        event
        <select
          value={draft.event}
          onChange={(event) => onChange({ ...draft, event: event.target.value })}
        >
          {events.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        room
        <select
          value={draft.room}
          onChange={(event) => onChange({ ...draft, room: event.target.value })}
        >
          <option value="">— none —</option>
          {rooms.map((room) => (
            <option key={room.code} value={room.code}>
              {room.code}
            </option>
          ))}
        </select>
      </label>
      <span className="admin__editor-actions">
        <button type="submit" disabled={busy}>
          save
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          cancel
        </button>
      </span>
    </form>
  )
}

function RoomsTable({
  rooms,
  selected,
  busy,
  onOpenPlayers,
  onEdit,
  onDelete,
}: {
  rooms: RoomSnapshot[]
  selected: string
  busy: boolean
  onOpenPlayers: (code: string) => void
  onEdit: (room: RoomSnapshot) => void
  onDelete: (code: string) => void
}) {
  if (rooms.length === 0) return <p className="admin__hint">No rooms yet.</p>
  return (
    <>
      <p className="admin__table-note">
        {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} · newest first · view opens that
        room's players
      </p>
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
              <th scope="col" aria-label="Actions" />
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
                <td className="admin__row-actions">
                  <button type="button" onClick={() => onOpenPlayers(item.code)}>
                    view
                  </button>
                  <button type="button" disabled={busy} onClick={() => onEdit(item)}>
                    edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDelete(item.code)}>
                    delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PlayersTable({
  players,
  room,
  busy,
  onEdit,
  onDelete,
}: {
  players: PlayerRow[]
  room: string
  busy: boolean
  onEdit: (player: PlayerRow) => void
  onDelete: (player: PlayerRow) => void
}) {
  if (players.length === 0) {
    return <p className="admin__hint">Nobody has joined {room} yet.</p>
  }
  return (
    <>
      <p className="admin__table-note">
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
              <th scope="col" aria-label="Actions" />
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
                <td className="admin__row-actions">
                  <button type="button" disabled={busy} onClick={() => onEdit(player)}>
                    edit
                  </button>
                  <button type="button" disabled={busy} onClick={() => onDelete(player)}>
                    delete
                  </button>
                </td>
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
