const TOKEN_KEY = 'arcade_ftw_token'

/**
 * The room is part of every URL even while only one show runs, so adding a
 * second one later is data rather than a protocol change.
 */
export const DEFAULT_ROOM = 'main'

export interface Session {
  subject: string
  isAdmin: boolean
  /** Full admin scope. A display token reads everything and controls nothing. */
  canControl: boolean
  scope: string
  /** Present when the token belongs to a player. */
  playerId?: number
  nickname?: string
  event?: string
}

export interface EventOption {
  key: string
  label: string
}

export interface PlayerSession extends Session {
  playerId: number
  nickname: string
  event: string
}

export interface RoomSnapshot {
  code: string
  state: {
    phase: 'idle' | 'playing' | 'paused' | 'finished'
    index: number
    node_count: number
    node: { type: string; title?: string; game?: string; duration_sec?: number } | null
    remaining_ms: number
    server_time_ms: number
  }
  /** Live websocket connections. */
  clients: number
  /** People who joined this room, whether or not they are connected now. */
  players: number
  /** Row metadata; null when the room has no event or label set. */
  event: string | null
  label: string | null
}

export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken()
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })

  const text = await response.text()
  if (!response.ok) {
    // FastAPI puts the reason in `detail`; surface it instead of "HTTP 401".
    let detail = text || `HTTP ${response.status}`
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed?.detail === 'string') detail = parsed.detail
    } catch {
      // Keep the raw body.
    }
    throw new Error(detail)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

// ─── auth ─────────────────────────────────────────────────────────────────────
export async function fetchEvents(): Promise<EventOption[]> {
  const body = await request<{ events: EventOption[] }>('/api/auth/events')
  return body.events
}

export async function loginPlayer(nickname: string, event: string): Promise<PlayerSession> {
  const body = await request<{
    token: string
    player_id: number
    nickname: string
    event: string
  }>('/api/auth/player', {
    method: 'POST',
    // Sending the old token is how a returning device proves it is the same
    // person and keeps its row when someone else has taken the nickname.
    body: JSON.stringify({ nickname, event, token: readToken() }),
  })
  saveToken(body.token)
  return {
    subject: `player:${body.player_id}`,
    isAdmin: false,
    canControl: false,
    scope: 'player',
    playerId: body.player_id,
    nickname: body.nickname,
    event: body.event,
  }
}

export async function loginAdmin(
  username: string,
  password: string,
  scope: 'full' | 'display' = 'full',
): Promise<Session> {
  const body = await request<{ token: string; subject: string; scope: string }>(
    '/api/auth/admin',
    { method: 'POST', body: JSON.stringify({ username, password, scope }) },
  )
  saveToken(body.token)
  return {
    subject: body.subject,
    isAdmin: true,
    canControl: body.scope === 'full',
    scope: body.scope,
  }
}

/** Returns null when there is no usable token, rather than throwing. */
export async function fetchSession(): Promise<Session | null> {
  if (!readToken()) return null
  try {
    const body = await request<{
      subject: string
      is_admin: boolean
      scope: string
      can_control: boolean
      player_id?: number
      nickname?: string
      event?: string
    }>('/api/auth/me')
    return {
      subject: body.subject,
      isAdmin: body.is_admin,
      canControl: body.can_control,
      scope: body.scope,
      playerId: body.player_id,
      nickname: body.nickname,
      event: body.event,
    }
  } catch {
    clearToken()
    return null
  }
}

// ─── rooms ────────────────────────────────────────────────────────────────────
export function roomState(code: string) {
  return request<RoomSnapshot['state']>(`/api/rooms/${code}/state`)
}

export function roomAction(code: string, action: string): Promise<unknown> {
  return request(`/api/rooms/${code}/${action}`, { method: 'POST' })
}

export interface ScoreBreakdown {
  player_id: number
  hallucination_score: number
  data_score: number
  sabotage_score: number
  ultimate_score: number
  total_score: number
}

export interface PlayerRow {
  player_id: number
  nickname: string
  event: string
  room_code: string | null
  created_at: string
  total_score: number
  /** Null until something writes a score - the games do not report yet. */
  score: ScoreBreakdown | null
}

export interface RosterEntry {
  nickname: string
  /** Only for admin/display tokens: a player sees the names and nothing else. */
  player_id?: number
  event?: string
  total_score?: number
}

/**
 * Record this device as a member of the room.
 *
 * Sent on every visit rather than once at login: the room lives in the URL, so a
 * player who opens a different room is genuinely in a different room now.
 */
export function joinRoom(code: string): Promise<{ room: string; nickname: string }> {
  return request(`/api/rooms/${code}/join`, { method: 'POST' })
}

export function roomRoster(code: string): Promise<RosterEntry[]> {
  return request<{ players: RosterEntry[] }>(`/api/rooms/${code}/players`).then(
    (body) => body.players,
  )
}

export function listPlayers(params: { room?: string; event?: string } = {}): Promise<PlayerRow[]> {
  const query = new URLSearchParams()
  if (params.room) query.set('room', params.room)
  if (params.event) query.set('event', params.event)
  const search = query.toString()
  return request<{ players: PlayerRow[] }>(`/api/players${search ? `?${search}` : ''}`).then(
    (body) => body.players,
  )
}

export function listRooms(): Promise<RoomSnapshot[]> {
  return request<{ rooms: RoomSnapshot[] }>('/api/rooms').then((body) => body.rooms)
}
