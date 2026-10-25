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
  type EventOption,
  type FlowNode,
  type PlayerRow,
  type RoomSnapshot,
  type Session,
} from '../../api'
import StaffLogin from '../StaffLogin'
import './AdminPage.css'

const ACTIONS = ['start', 'pause', 'resume', 'finish', 'reset'] as const

interface JumpButton {
  index: number
  label: string
}

interface JumpGroup {
  key: string
  /** The part of the show: a section name, or the node's own title when standalone. */
  title: string
  buttons: JumpButton[]
}

/** The four scored sections, in the order the show runs them. */
const SECTION_TITLES: Record<string, string> = {
  hallucination: 'Hallucination',
  data: 'Data',
  sabotage: 'Sabotage',
  ultimate: 'Ultimate',
  total: 'Activity',
}

/** What a node is inside its section. */
function nodeKind(node: FlowNode): string {
  if (node.type === 'leaderboard') return 'ranking'
  if (node.type === 'quiz') return 'quiz'
  if (node.type === 'game') return 'challenge'
  return node.title?.toLowerCase() ?? node.type
}

/** A node's section: leaderboards name it, games and quizzes score into it. */
function sectionOf(node: FlowNode): string | null {
  return node.section ?? node.score ?? null
}

/**
 * Groups the rundown into sections, so the operator reads
 * `Hallucination → challenge / quiz / ranking` instead of "node 1, 2, 3".
 * Consecutive nodes in the same section share one box; intro and outro get
 * a box of their own.
 */
function jumpGroups(flow: FlowNode[]): JumpGroup[] {
  const groups: JumpGroup[] = []
  flow.forEach((node, index) => {
    const section = sectionOf(node)
    const last = groups[groups.length - 1]
    const joinable = section !== null && last !== undefined && last.key === section
    if (!joinable) {
      groups.push({
        key: section ?? `standalone-${index}`,
        title: section ? (SECTION_TITLES[section] ?? section) : (node.title ?? 'Show'),
        buttons: [],
      })
    }
    groups[groups.length - 1].buttons.push({ index, label: nodeKind(node) })
  })
  return groups
}

type Section = 'console' | 'data' | 'settings'
type DataTab = 'rooms' | 'players'

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
  const [playerDraft, setPlayerDraft] = useState<PlayerDraft | null>(null)
  // The room the operator is running: always the newest still-open room. There
  // is nothing to choose - rooms are one-shot.
  const [current, setCurrent] = useState<string>('')
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
          // The operator always works on the newest still-open room.
          setCurrent(loaded.current ?? '')
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
      listPlayers({ room: current })
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
  }, [session, section, current])

  useEffect(() => {
    // Switching panels can otherwise leave the console shifted sideways, because
    // the click that opened the next panel may have scrolled to reach a button.
    shell.current?.scrollTo({ left: 0 })
  }, [section, tab, current])

  if (!checked) return null
  if (!session) {
    return <StaffLogin scope="full" title="Operator" onSignedIn={setSession} />
  }

  const startRound = async () => {
    setBusy(true)
    try {
      const created = await createRoom()
      await load()
      setCurrent(created.code)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const removeRoom = async (code: string) => {
    if (!window.confirm(`Delete room ${code}? Its history and participants go with it.`)) return
    setBusy(true)
    try {
      await deleteRoom(code)
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
        await addPlayer(draft.room || current, {
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
      setPlayers(await listPlayers({ room: current }))
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
      setPlayers(await listPlayers({ room: current }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const run = async (action: string) => {
    setBusy(true)
    try {
      await roomAction(current, action)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const room = rooms.find((item) => item.code === current)

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
              room={room}
              onAction={run}
              onStartRound={startRound}
              busy={busy}
            />
          )}
          {section === 'data' && (
            <DataView
              rooms={rooms}
              current={current}
              players={players}
              events={events}
              tab={tab}
              onTab={setTab}
              busy={busy}
              playerDraft={playerDraft}
              onPlayerDraft={setPlayerDraft}
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
  room,
  onAction,
  onStartRound,
  busy,
}: {
  room: RoomSnapshot | undefined
  onAction: (action: string) => void
  onStartRound: () => void
  busy: boolean
}) {
  const phase = room?.state.phase ?? 'waiting'
  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>Show control</h2>
        <div className="admin__head-tools">
          <span className="admin__current">
            {room ? (
              <>
                room <strong>{room.code}</strong>
              </>
            ) : (
              <>no room yet</>
            )}
          </span>
          <button type="button" className="admin__new-round" disabled={busy} onClick={onStartRound}>
            new room
          </button>
        </div>
      </div>

      {room ? (
        <>
          <div className="admin__stage">
            <div className="admin__state">
              <p className="admin__node">{room.state.node?.title ?? '—'}</p>
              <p className="admin__hint">
                <span className={`admin__phase is-${phase}`}>{phase}</span> · node{' '}
                {room.state.index + 1} / {room.state.node_count} ·{' '}
                {room.players} joined · {room.clients} online
              </p>

              <div className="admin__controls admin__controls--stacked">
                {ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(action)}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>

            {/* The actual big screen, live: seeing it beside the controls is how
                the operator catches a screen that is out of step without walking
                over to it. The iframe has its own socket and state. */}
            <div className="admin__tv">
              <iframe src={`/display/${room.code}`} title="Big screen preview" />
            </div>
          </div>

          <div className="admin__progress">
            <p className="admin__hint">
              Jump straight to a node instead of waiting for the clock:
            </p>
            <div className="admin__jumps">
              {(room.state.flow ? jumpGroups(room.state.flow) : []).map((group) => (
                <div key={group.key} className="admin__jumpgroup">
                  <span className="admin__jumpgroup-title">{group.title}</span>
                  <div className="admin__jumpgroup-buttons">
                    {group.buttons.map((button) => (
                      <button
                        key={button.index}
                        type="button"
                        disabled={busy}
                        className={button.index === room.state.index ? 'is-current' : ''}
                        onClick={() => onAction(`go/${button.index}`)}
                      >
                        {button.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="admin__hint">
          No room is open. Create one to start the next round.
        </p>
      )}
    </section>
  )
}

function DataView({
  rooms,
  current,
  players,
  events,
  tab,
  onTab,
  busy,
  playerDraft,
  onPlayerDraft,
  onDeleteRoom,
  onSavePlayer,
  onDeletePlayer,
}: {
  rooms: RoomSnapshot[]
  current: string
  players: PlayerRow[]
  events: EventOption[]
  tab: DataTab
  onTab: (next: DataTab) => void
  busy: boolean
  playerDraft: PlayerDraft | null
  onPlayerDraft: (draft: PlayerDraft | null) => void
  onDeleteRoom: (code: string) => void
  onSavePlayer: (draft: PlayerDraft) => void
  onDeletePlayer: (player: PlayerRow) => void
}) {
  const openNewPlayer = () =>
    onPlayerDraft({
      isNew: true,
      playerId: null,
      nickname: '',
      event: events[0]?.key ?? '',
      room: current,
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
          {tab === 'players' && (
            <button
              type="button"
              className="admin__create"
              disabled={busy}
              onClick={openNewPlayer}
            >
              + new player
            </button>
          )}
        </div>
      </div>

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
        <RoomsTable rooms={rooms} current={current} busy={busy} onDelete={onDeleteRoom} />
      ) : (
        <PlayersTable
          players={players}
          room={current}
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
          {rooms
            .filter((room) => room.closedAt === null)
            .map((room) => (
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
  current,
  busy,
  onDelete,
}: {
  rooms: RoomSnapshot[]
  current: string
  busy: boolean
  onDelete: (code: string) => void
}) {
  if (rooms.length === 0) return <p className="admin__hint">No rooms yet.</p>
  const formatWhen = (iso: string) => {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
  }
  return (
    <>
      <p className="admin__table-note">
        {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} · newest first · a room is one-shot:
        it records who joined, then closes when finished
      </p>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th scope="col">Room</th>
              <th scope="col">Created</th>
              <th scope="col">Players</th>
              <th scope="col">Status</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rooms.map((item) => (
              <tr key={item.code} className={item.code === current ? 'is-current' : ''}>
                <td>
                  {item.code}
                  {item.code === current && <span className="admin__current">current</span>}
                </td>
                <td className="admin__dim">{formatWhen(item.createdAt)}</td>
                <td>{item.players}</td>
                <td>{item.closedAt ? 'closed' : 'open'}</td>
                <td className="admin__row-actions">
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
