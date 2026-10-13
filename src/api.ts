const TOKEN_KEY = 'arcade_ftw_token'

export interface Session {
  subject: string
  isAdmin: boolean
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

/** The events the backend will accept. The dropdown is built from this. */
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
  }>('/api/auth/player', { method: 'POST', body: JSON.stringify({ nickname, event }) })
  saveToken(body.token)
  return {
    subject: `player:${body.player_id}`,
    isAdmin: false,
    playerId: body.player_id,
    nickname: body.nickname,
    event: body.event,
  }
}

export async function loginAdmin(username: string, password: string): Promise<Session> {
  const body = await request<{ token: string; subject: string }>('/api/auth/admin', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  saveToken(body.token)
  return { subject: body.subject, isAdmin: true }
}

/** Returns null when there is no usable token, rather than throwing. */
export async function fetchSession(): Promise<Session | null> {
  if (!readToken()) return null
  try {
    const body = await request<{ subject: string; is_admin: boolean }>('/api/auth/me')
    return { subject: body.subject, isAdmin: body.is_admin }
  } catch {
    clearToken()
    return null
  }
}

export function gameAction(action: string): Promise<unknown> {
  return request(`/api/game/${action}`, { method: 'POST' })
}
