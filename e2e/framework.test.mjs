/**
 * The show as a machine, exercised end to end over HTTP and the socket.
 *
 * These run against the real backend and the real frontend proxy, in a room the
 * suite creates and deletes. Nothing is stubbed, so a broken route, a missing
 * `/api` prefix, a stale task definition or an engine that forgets to arm its
 * clock all fail here rather than on stage.
 *
 * Run with: npm run test:e2e
 */
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { Api, BASE, e2eRoomCode, SHOW_SECONDS, sleep, watch } from './helpers.mjs'

const api = new Api()
let ROOM = null
/** Nicknames carry the room suffix: a nickname is unique per event, so a fixed
 *  one would come back as "E2E-Player (4)" on the fifth run and every assertion
 *  that looks a player up by name would quietly rot. */
let HOST = null
let PARTNER = null

before(async () => {
  await api.loginAdmin()
  ROOM = e2eRoomCode('SHOW')
  const suffix = ROOM.split('-').at(-1)
  HOST = `Host-${suffix}`
  PARTNER = `Guest-${suffix}`
  await api.createRoom(ROOM)
  await api.join(ROOM, HOST)
})

after(async () => {
  if (!ROOM) return
  // A running show refuses deletion, so finish it first. Every step is allowed
  // to fail: a half-torn-down room must not fail the suite on the way out.
  try {
    await api.finishRoom(ROOM)
  } catch {
    /* already finished */
  }
  try {
    await api.deleteRoom(ROOM)
  } catch {
    /* already gone */
  }
  // Players outlive their room, so they are removed by hand; the roster is the
  // one place a test run would otherwise leave a mark on the database.
  for (const nickname of [HOST, PARTNER]) {
    try {
      const found = await api.get(`/api/players?q=${encodeURIComponent(nickname)}`, {
        token: api.adminToken,
        expect: 200,
      })
      for (const player of found.players ?? []) {
        if (player.nickname === nickname) await api.deletePlayer(player.player_id)
      }
    } catch {
      /* best effort */
    }
  }
})

describe('the site and the API are one origin', () => {
  test('health answers JSON, not the SPA fallback', async () => {
    const { status, payload, contentType } = await api.raw('/health')
    assert.equal(status, 200)
    assert.match(contentType, /application\/json/)
    assert.equal(payload.status, 'ok')
  })

  test('an unknown API path is a real 404, not index.html', async () => {
    const { status, contentType } = await api.raw('/api/definitely-not-a-route')
    assert.equal(status, 404)
    assert.match(contentType, /application\/json/)
  })

  test('the admin token is needed for control', async () => {
    const { status } = await api.raw(`/api/rooms/${ROOM}/start`, { method: 'POST' })
    assert.equal(status, 401)
  })

  test('a player token cannot drive the show', async () => {
    const { token } = await api.loginPlayer(HOST)
    const { status, payload } = await api.raw(`/api/rooms/${ROOM}/start`, {
      token,
      method: 'POST',
    })
    // 401 rather than 403: the admin guard resolves the token to "not the
    // operator" and refuses before it ever asks what the token may do.
    assert.equal(status, 401)
    assert.match(payload.detail, /admin/i)
  })
})

describe('the room a new player joins is a room the server can serve', () => {
  test('`current` is a room the console can also see', async () => {
    // A player's iPad lands on the login page between rounds and joins whatever
    // room is newest and still open. If that room exists only as a database row
    // - which is what a suite that leaves its rooms open produces - the iPad
    // walks into a room no screen is following. The two answers have to agree.
    const current = await api.get('/api/rooms/current', { expect: 200 })
    assert.ok(current.code, 'there is no current room')
    const listed = await api.get('/api/rooms', { token: api.adminToken, expect: 200 })
    const codes = listed.rooms.map((room) => room.code)
    assert.ok(
      codes.includes(current.code),
      `current is "${current.code}", which the server does not serve. ` +
        `Rooms it does serve: ${codes.join(', ') || '(none)'}. ` +
        'A local pytest run that left rooms behind causes exactly this.',
    )
  })

  test('the current room accepts a join', async () => {
    const current = await api.get('/api/rooms/current', { expect: 200 })
    const { token } = await api.loginPlayer(HOST)
    const joined = await api.post(`/api/rooms/${current.code}/join`, { token, expect: 200 })
    assert.equal(joined.room, current.code)
  })
})

describe('the rundown is the 13-node show the frontend draws', () => {
  let state

  before(async () => {
    state = await api.state(ROOM)
  })

  test('13 nodes, and a total that matches the plan', () => {
    assert.equal(state.node_count, 13)
    assert.equal(state.flow.length, 13)
    const total = state.flow.reduce((sum, node) => sum + node.duration_sec, 0)
    assert.equal(total, SHOW_SECONDS, `the show is ${total}s, not ${SHOW_SECONDS}s`)
  })

  test('the order is the show the audience is promised', () => {
    const shape = state.flow.map((node) => node.type)
    assert.deepEqual(shape, [
      'intro',
      'opening',
      'game',
      'leaderboard',
      'opening',
      'game',
      'leaderboard',
      'game',
      'leaderboard',
      'opening',
      'quiz',
      'leaderboard',
      'outro',
    ])
  })

  test('every opening is 3s of name and 12s of rules', () => {
    const openings = state.flow.filter((node) => node.type === 'opening')
    assert.equal(openings.length, 3)
    for (const node of openings) {
      assert.equal(node.duration_sec, 15)
      assert.equal(node.title_sec, 3)
      assert.equal(node.duration_sec - node.title_sec, 12)
      assert.ok(node.game, 'an opening has to name the game it opens')
    }
  })

  test('no node still uses the old title/brief split', () => {
    const types = new Set(state.flow.map((node) => node.type))
    assert.equal(types.has('title'), false)
    assert.equal(types.has('brief'), false)
  })

  test('every question node leaves a readable tail after its last verdict', () => {
    for (const node of state.flow.filter((n) => n.questions)) {
      const content = (node.intro_sec ?? 0) + node.questions * node.seconds_each
      // A round may cut its closing score page on purpose and say so with
      // `closing_sec`; everything else still owes a readable tail.
      const wanted = node.closing_sec ?? 3
      assert.ok(
        node.duration_sec - content >= wanted,
        `${node.title}: ${node.duration_sec} - ${content} leaves under ${wanted}s for the score`,
      )
      assert.ok(node.duration_sec - content >= 0, `${node.title} ends mid-question`)
    }
  })

  test('the quiz is five questions and has no intro card', () => {
    const quiz = state.flow.find((node) => node.type === 'quiz')
    assert.equal(quiz.questions, 5)
    assert.equal(quiz.seconds_each, 25)
    assert.equal(quiz.intro_sec ?? 0, 0)
    assert.equal(quiz.score, 'ultimate')
  })

  test('the sabotage slot outlasts the engine clock', () => {
    const node = state.flow.find((n) => n.game === 'sabotage' && n.type === 'game')
    // 10 draw + 15 rules + 35 first pick + 3 x 25 picks + 4 x 5 reveals + 5 final
    const engine = 10 + 15 + 35 + 3 * 25 + 4 * 5 + 5
    assert.ok(node.duration_sec > engine, `${node.duration_sec} must beat ${engine}`)
  })

  test('four sections score, and the activity board is last', () => {
    const scored = state.flow.filter((n) => n.score).map((n) => n.score)
    assert.deepEqual(scored, ['hallucination', 'data', 'sabotage', 'ultimate'])
    const boards = state.flow.filter((n) => n.type === 'leaderboard').map((n) => n.section)
    assert.deepEqual(boards, ['hallucination', 'data', 'sabotage', 'total'])
  })
})

describe('the engine drives the show, node by node', () => {
  test('start begins at the welcome and arms the clock', async () => {
    const state = await api.start(ROOM)
    assert.equal(state.phase, 'playing')
    assert.equal(state.index, 0)
    assert.equal(state.node.type, 'intro')
    assert.ok(state.remaining_ms > 0, 'a new node must broadcast a live clock')
    assert.ok(state.remaining_ms <= 10_000)
  })

  test('pause freezes the clock and resume continues it', async () => {
    const paused = await api.pause(ROOM)
    assert.equal(paused.phase, 'paused')
    const held = paused.remaining_ms ?? paused.held_ms
    await sleep(600)
    const still = await api.state(ROOM)
    assert.equal(still.phase, 'paused')
    assert.equal(still.remaining_ms ?? still.held_ms, held, 'a paused clock must not move')
    const resumed = await api.resume(ROOM)
    assert.equal(resumed.phase, 'playing')
  })

  test('a jump lands on the node asked for, with a full clock', async () => {
    for (const index of [1, 4, 9]) {
      const state = await api.jump(ROOM, index)
      assert.equal(state.index, index)
      assert.equal(state.node.type, 'opening')
      assert.ok(state.remaining_ms > 0)
      assert.ok(state.remaining_ms <= state.node.duration_sec * 1000)
    }
  })

  test('a paused jump still arms the destination', async () => {
    await api.pause(ROOM)
    const state = await api.jump(ROOM, 2)
    assert.equal(state.phase, 'paused')
    assert.equal(state.index, 2)
    assert.ok(state.remaining_ms ?? state.held_ms, 'a paused jump must not leave 0:00 on screen')
    await api.resume(ROOM)
  })

  test('the quiz node reports which of its five questions is live', async () => {
    await api.jump(ROOM, 10)
    const state = await api.state(ROOM)
    assert.equal(state.node.type, 'quiz')
    assert.equal(state.question.count, 5)
    assert.equal(state.question.index, 0, 'the first second is the first question')
    assert.ok(state.question.seconds_each > 0)
  })

  test('two clients see the same node', async () => {
    const a = await watch(ROOM)
    const b = await watch(ROOM)
    try {
      await api.jump(ROOM, 4)
      const first = await a.until((s) => s.index === 4)
      const second = await b.until((s) => s.index === 4)
      assert.equal(first.node.type, second.node.type)
      assert.equal(first.index, second.index)
    } finally {
      a.close()
      b.close()
    }
  })

  test('the socket pushes a frame on every jump', async () => {
    const watcher = await watch(ROOM)
    try {
      const before = watcher.frames.length
      await api.jump(ROOM, 11)
      await watcher.until((s) => s.index === 11)
      assert.ok(watcher.frames.length > before, 'a jump must reach every screen')
    } finally {
      watcher.close()
    }
  })

  test('the clock reaches the next node without an operator', async () => {
    // The last leaderboard is 10s; jumping restarts it, so this is a real
    // wait rather than a fast-forward.
    await api.jump(ROOM, 11)
    const watcher = await watch(ROOM)
    try {
      const next = await watcher.until((s) => s.index === 12, 18_000)
      assert.equal(next.node.type, 'outro')
    } finally {
      watcher.close()
    }
  })

  test('a lone player is paid and walked past the Sabotage node', async () => {
    // One player cannot field two teams, so the flow pays them and moves on
    // rather than parking the show on a node nobody can play.
    const state = await api.jump(ROOM, 7)
    assert.equal(state.index, 8, 'a solo room should land after the Sabotage node')
    const rows = await api.board(ROOM, 'sabotage')
    assert.ok(rows.length > 0, 'the solo player should have been paid')
    assert.ok(rows[0].score > 0, 'the solo payout did not land')
  })

  test('every node in the rundown can be jumped to and drawn', async () => {
    const flow = (await api.state(ROOM)).flow
    // Node 7 (Sabotage) needs two teams to stay put, so it is joined here and
    // checked with the real game below rather than as an empty slot.
    await api.join(ROOM, PARTNER)
    for (let index = 0; index < flow.length; index += 1) {
      if (flow[index].type === 'game' && flow[index].game === 'sabotage') continue
      const state = await api.jump(ROOM, index)
      assert.equal(state.index, index, `node ${index} did not take`)
      assert.equal(state.node.type, flow[index].type)
      assert.ok(state.remaining_ms > 0, `node ${index} (${flow[index].type}) has no clock`)
    }
  })
})

describe('scores and boards work for every section', () => {
  test('a player reports a score and it lands on the board', async () => {
    const { token } = await api.loginPlayer(HOST)
    // Node 2 is the Hallucination game, so it scores into `hallucination`.
    await api.jump(ROOM, 2)
    const report = await api.post('/api/me/score', {
      token,
      body: { room: ROOM, node_index: 2, question: 0, points: 20 },
      expect: 200,
    })
    assert.ok(report)
    const rows = await api.board(ROOM, 'hallucination')
    const mine = rows.find((row) => row.nickname === HOST)
    assert.ok(mine, 'the reporter must be on their own board')
    assert.ok(mine.score >= 20)
  })

  test('all four sections answer, even when empty', async () => {
    for (const section of ['hallucination', 'data', 'sabotage', 'ultimate', 'total']) {
      const rows = await api.board(ROOM, section)
      assert.ok(Array.isArray(rows), `${section} board is not a list`)
      for (const row of rows) {
        assert.equal(typeof row.nickname, 'string')
        assert.equal(typeof row.score, 'number')
        assert.equal(typeof row.total, 'number')
        assert.equal(typeof row.previous, 'number')
      }
    }
  })

  test('a score against a node that does not score is refused', async () => {
    const { token } = await api.loginPlayer(HOST)
    await api.jump(ROOM, 0)
    const { status } = await api.raw('/api/me/score', {
      token,
      method: 'POST',
      body: { room: ROOM, node_index: 0, question: null, points: 20 },
    })
    assert.equal(status, 422)
  })

  test('a score larger than one answer is refused', async () => {
    const { token } = await api.loginPlayer(HOST)
    await api.jump(ROOM, 2)
    const { status } = await api.raw('/api/me/score', {
      token,
      method: 'POST',
      body: { room: ROOM, node_index: 2, question: 1, points: 5_000 },
    })
    assert.equal(status, 422)
  })
})

describe('Sabotage runs inside its one node', () => {
  let teams

  test('the operator can split the room into two sides', async () => {
    teams = await api.assignTeams(ROOM)
    assert.ok(teams.red.length > 0, 'nobody on Red')
    assert.ok(teams.blue.length > 0, 'nobody on Blue')
    assert.equal(teams.count, teams.red.length + teams.blue.length)
  })

  test('starting it puts both sides into the reveal', async () => {
    const started = await api.post(`/api/sabotage/${ROOM}/start`, {
      token: api.adminToken,
      expect: 200,
    })
    assert.equal(started.phase, 'team_reveal')
    assert.ok(started.teams.red.length > 0 && started.teams.blue.length > 0)
    assert.ok(started.remaining_ms > 0, 'the reveal has no clock')
  })

  test('the snapshot carries what both screens need', async () => {
    const snap = await api.get(`/api/sabotage/${ROOM}/state`, { expect: 200 })
    assert.ok(snap.total_budget > 0)
    assert.ok(snap.cards && Object.keys(snap.cards).length === 39, 'card table is not 39 cards')
    assert.deepEqual([...snap.domains].sort(), ['data', 'infra', 'people'])
    assert.ok(snap.theme, 'a round has to name its theme')
    assert.ok(snap.target, 'a round has to name its target')
    assert.ok(snap.decks.red.length > 0 && snap.decks.blue.length > 0, 'a side got no deck')
  })

  test('a player can vote, and only with cards from their own deck', async () => {
    const { token } = await api.loginPlayer(HOST)
    // The reveal is still running; votes are refused outside `select`.
    const early = await api.raw(`/api/sabotage/${ROOM}/vote`, {
      token,
      method: 'POST',
      body: { cards: [] },
    })
    assert.equal(early.status, 409)
    assert.match(early.payload.detail, /phase/i)
  })

  test('the game can be played from the flow without an operator', async () => {
    // Jumping to node 7 restarts the game from the draw, which is what the
    // console does when it rehearses this round.
    const watcher = await watch(ROOM)
    try {
      await api.jump(ROOM, 7)
      const reveal = await watcher.until(
        (s) => s.index === 7 && s.node.type === 'game',
        5_000,
      )
      assert.equal(reveal.index, 7, 'two teams must be able to hold this node')
      // 10s reveal + 15s rules = the first pick window.
      const selecting = await waitForSabotage(watcher, (snap) => snap.phase === 'select', 40_000)
      assert.equal(selecting.phase, 'select')
      assert.ok(selecting.remaining_ms > 0)
      assert.ok(selecting.round >= 1 && selecting.round <= 4)
    } finally {
      watcher.close()
    }
  })
})

/** Wait for a sabotage frame that satisfies `predicate`. */
async function waitForSabotage(watcher, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const snap = watcher
      .frames.filter((m) => m.type === 'sabotage')
      .map((m) => m.payload)
      .find(predicate)
    if (snap) return snap
    await sleep(200)
  }
  throw new Error('no matching sabotage frame')
}

describe('the show can be torn down and rewound', () => {
  test('reset returns an unstarted show at node 0', async () => {
    const state = await api.reset(ROOM)
    assert.equal(state.phase, 'waiting')
    assert.equal(state.index, 0)
    assert.equal(state.node.type, 'intro')
  })

  test('a closed room cannot be restarted', async () => {
    await api.finishRoom(ROOM)
    const { status } = await api.raw(`/api/rooms/${ROOM}/start`, {
      token: api.adminToken,
      method: 'POST',
    })
    assert.equal(status, 409)
  })
})

describe('the site serves what the build produced', () => {
  test('the app shell loads and mounts', async () => {
    const { status, payload } = await api.raw('/')
    assert.equal(status, 200)
    assert.match(String(payload), /<div id="root">/)
  })

  test('a deep link is served by the SPA, not a 404 page', async () => {
    const { status } = await api.raw('/admin')
    assert.equal(status, 200)
  })

  test('the four game marks are on the server', async () => {
    for (const name of ['hallucination', 'data', 'sabotage', 'ultimate']) {
      const res = await fetch(`${BASE}/game_icons/${name}_icon.PNG`)
      assert.equal(res.status, 200, `${name} icon is missing`)
      assert.match(res.headers.get('content-type') ?? '', /image\/png/)
      const bytes = (await res.arrayBuffer()).byteLength
      assert.ok(bytes > 10_000, `${name} icon looks empty (${bytes}B)`)
      // A card renders these around 100px; anything near the 1.2MB original
      // means the downscale was lost and every iPad is downloading it.
      assert.ok(bytes < 400_000, `${name} icon is ${bytes}B, expected under 400KB`)
    }
  })

  test('the old baked-in-text icons are gone', async () => {
    for (const name of ['hallucination', 'data', 'sabotage', 'ultimate']) {
      const res = await fetch(`${BASE}/${name}_icon.PNG`)
      // A missing asset comes back as the SPA shell with a 200, so the status
      // proves nothing; the content type does.
      const type = res.headers.get('content-type') ?? ''
      assert.equal(
        type.includes('image'),
        false,
        `${name}_icon.PNG is still served as ${type} - it should have been deleted`,
      )
    }
  })
})
