/**
 * Shared plumbing for the end-to-end suite: one HTTP client, one room
 * lifecycle, one socket watcher.
 *
 * Everything goes through the frontend origin (`BASE`) and not the backend
 * port, because that is how production works: the site and the API are the same
 * origin behind CloudFront, and a test that talked to :5071 directly would miss
 * a broken proxy or a route that never made it under the `/api` prefix.
 *
 * The suite creates its own room and deletes it in an `after` hook. It never
 * touches `main`, so a rehearsal that is mid-show is not disturbed.
 */

export const BASE = process.env.E2E_BASE ?? 'http://localhost:5070'

/** How long a full show runs, from `flow.py`. The walk test asserts this. */
export const SHOW_SECONDS = 549

export class Api {
  constructor() {
    this.adminToken = null
    this.playerTokens = new Map()
  }

  async raw(path, { token, method = 'GET', body, expect } = {}) {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const contentType = res.headers.get('content-type') ?? ''
    const text = await res.text()
    let payload = text
    if (contentType.includes('application/json') && text) payload = JSON.parse(text)
    if (expect !== undefined && res.status !== expect) {
      throw new Error(`${method} ${path} -> ${res.status} (wanted ${expect}): ${text.slice(0, 300)}`)
    }
    // A 200 that is really the SPA fallback has bitten this project before, so
    // every /api call checks the content type as well as the status.
    if (path.startsWith('/api') && res.ok && text && !contentType.includes('application/json')) {
      throw new Error(`${method} ${path} -> 200 but content-type was ${contentType}, not JSON`)
    }
    return { status: res.status, payload, contentType }
  }

  async get(path, opts = {}) {
    return (await this.raw(path, opts)).payload
  }

  async post(path, opts = {}) {
    return (await this.raw(path, { ...opts, method: 'POST' })).payload
  }

  async delete(path, opts = {}) {
    await this.raw(path, { ...opts, method: 'DELETE', expect: opts.expect ?? 204 })
  }

  async loginAdmin() {
    const login = await this.post('/api/auth/admin', {
      body: { username: 'admin', password: 'admin' },
      expect: 200,
    })
    this.adminToken = login.token
    return login
  }

  /** A player token, cached per nickname so a test can reuse one device. */
  async loginPlayer(nickname, event = 'hk_fintech_week') {
    const key = `${event}:${nickname}`
    if (this.playerTokens.has(key)) return this.playerTokens.get(key)
    const login = await this.post('/api/auth/player', {
      body: { nickname, event },
      expect: 200,
    })
    this.playerTokens.set(key, login)
    return login
  }

  async join(code, nickname) {
    const { token } = await this.loginPlayer(nickname)
    return this.post(`/api/rooms/${code}/join`, { token, expect: 200 })
  }

  async createRoom(code) {
    return this.post('/api/rooms', {
      token: this.adminToken,
      body: { code },
      expect: 201,
    })
  }

  async finishRoom(code) {
    return this.post(`/api/rooms/${code}/finish`, { token: this.adminToken, expect: 200 })
  }

  async deleteRoom(code) {
    await this.delete(`/api/rooms/${code}`, { token: this.adminToken })
  }

  async start(code) {
    return this.post(`/api/rooms/${code}/start`, { token: this.adminToken, expect: 200 })
  }

  async pause(code) {
    return this.post(`/api/rooms/${code}/pause`, { token: this.adminToken, expect: 200 })
  }

  async resume(code) {
    return this.post(`/api/rooms/${code}/resume`, { token: this.adminToken, expect: 200 })
  }

  async reset(code) {
    return this.post(`/api/rooms/${code}/reset`, { token: this.adminToken, expect: 200 })
  }

  /** Jump to a node. Every jump restarts the destination, per the engine. */
  async jump(code, index) {
    return this.post(`/api/rooms/${code}/go/${index}`, { token: this.adminToken, expect: 200 })
  }

  async state(code) {
    return this.get(`/api/rooms/${code}/state`, { expect: 200 })
  }

  async players(code) {
    return this.get(`/api/rooms/${code}/players`, { token: this.adminToken, expect: 200 })
  }

  /**
   * The rows of one section's board. The endpoint answers
   * `{room, section, players: [...]}`; only the rows are ever asserted on.
   */
  async board(code, section, token = this.adminToken) {
    const payload = await this.get(`/api/rooms/${code}/leaderboard?section=${section}`, {
      token,
      expect: 200,
    })
    if (!Array.isArray(payload.players)) {
      throw new Error(`board ${section} has no players array: ${JSON.stringify(payload).slice(0, 200)}`)
    }
    return payload.players
  }

  async assignTeams(code) {
    return this.post(`/api/rooms/${code}/teams/assign`, {
      token: this.adminToken,
      expect: 200,
    })
  }

  /** Delete a player, so an E2E run leaves no roster behind. */
  async deletePlayer(id) {
    await this.delete(`/api/players/${id}`, { token: this.adminToken })
  }
}

/**
 * Collects `state` and `sabotage` frames for one room.
 *
 * A screen that falls behind is the failure this catches: every phase change is
 * broadcast, so a client that misses one disagrees with the engine for the rest
 * of the show.
 */
export async function watch(code) {
  const url = `${BASE.replace(/^http/, 'ws')}/api/ws?room=${encodeURIComponent(code)}`
  const frames = []
  const socket = new WebSocket(url)
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      frames.push(msg)
      if (msg.type === 'state') resolve(msg.payload)
    })
    socket.addEventListener('error', () => reject(new Error(`ws failed: ${url}`)))
    socket.addEventListener('close', (event) => {
      if (event.code !== 1000 && event.code !== 1005) {
        reject(new Error(`ws closed ${event.code}: ${event.reason}`))
      }
    })
    setTimeout(() => reject(new Error(`ws never sent state: ${url}`)), 8000)
  })
  const first = await ready
  return {
    frames,
    first,
    last: () => [...frames].reverse().find((m) => m.type === 'state')?.payload,
    lastSabotage: () => [...frames].reverse().find((m) => m.type === 'sabotage')?.payload,
    /** Wait for a state frame that satisfies `predicate`. */
    async until(predicate, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const hit = frames
          .filter((m) => m.type === 'state')
          .map((m) => m.payload)
          .find(predicate)
        if (hit) return hit
        await new Promise((r) => setTimeout(r, 100))
      }
      throw new Error('no matching state frame')
    },
    close: () => socket.close(1000),
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** A room code that cannot collide with a live one. */
export function e2eRoomCode(tag) {
  return `E2E-${tag}-${Date.now().toString(36).slice(-6)}`.toUpperCase()
}
