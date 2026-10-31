/**
 * The same show, but through a real browser: what a person actually sees.
 *
 * The API suite proves the engine and the routes; this one proves the screens
 * that read them, which is where the failures that matter on stage live - a
 * node type that falls through to the placeholder, a wall and an iPad that draw
 * different questions, an opening that never hands over to its rules.
 *
 * It drives the installed Chrome through `playwright-core` (no browser download)
 * and takes a screenshot into `e2e/artifacts/` for anything that fails.
 *
 * Run with: npm run test:e2e
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { after, before, describe, test } from 'node:test'

import { chromium } from 'playwright-core'

import { Api, BASE, e2eRoomCode } from './helpers.mjs'

const ARTIFACTS = new URL('./artifacts/', import.meta.url)

/** The wall is a 16:9 projector; the iPad is a 4:3 classroom tablet held up. */
const WALL = { width: 1600, height: 900 }
const IPAD = { width: 1180, height: 820 }

const api = new Api()
let ROOM = null
let HOST = null
let browser = null

before(async () => {
  await mkdir(ARTIFACTS, { recursive: true })
  await api.loginAdmin()
  ROOM = e2eRoomCode('UI')
  HOST = `Ui-${ROOM.split('-').at(-1)}`
  await api.createRoom(ROOM)
  await api.join(ROOM, HOST)
  browser = await chromium.launch({ channel: 'chrome' })
})

after(async () => {
  await browser?.close()
  if (!ROOM) return
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
  try {
    const found = await api.get(`/api/players?q=${encodeURIComponent(HOST)}`, {
      token: api.adminToken,
      expect: 200,
    })
    for (const player of found.players ?? []) {
      if (player.nickname === HOST) await api.deletePlayer(player.player_id)
    }
  } catch {
    /* best effort */
  }
})

/**
 * A page that signs itself in before it loads, then lands on `path`.
 *
 * `as` matters: the wall runs on a display-scope token, the console needs the
 * full operator scope, and a player screen needs a player token. Signing in as
 * the wrong one produces a page that renders but has nothing on it.
 */
async function stage(viewport, { path, as = 'display', onError } = {}) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.on('pageerror', (error) => onError?.(String(error)))
  // Sign in through the API and drop the token into sessionStorage before any
  // app code runs: the app reads it synchronously on mount.
  const login =
    as === 'player'
      ? await api.loginPlayer(HOST)
      : await api.post('/api/auth/admin', {
          body: {
            username: 'admin',
            password: 'admin',
            scope: as === 'operator' ? 'full' : 'display',
          },
          expect: 200,
        })
  await page.addInitScript((token) => {
    sessionStorage.setItem('arcade_ftw_token', token)
  }, login.token)
  await page.goto(`${BASE}${path}`)
  return { context, page }
}

async function snap(page, name) {
  await page.screenshot({ path: new URL(name, ARTIFACTS).pathname, fullPage: false })
}

/**
 * Jumps to a node and waits for the screen to settle on it.
 *
 * A jump restarts the node, so the clock is fresh; 700ms is enough for the
 * socket frame and the first paint without ever reaching the next node.
 */
async function gotoNode(page, index) {
  await api.jump(ROOM, index)
  await page.waitForTimeout(700)
  return page
}

describe('the wall draws every node in the show', () => {
  test('all 13 nodes render, none falls through to the placeholder', async () => {
    const errors = []
    const { context, page } = await stage(WALL, {
      path: `/display/${ROOM}`,
      onError: (error) => errors.push(error),
    })
    try {
      const flow = (await api.state(ROOM)).flow
      const seen = []
      for (let index = 0; index < flow.length; index += 1) {
        await api.jump(ROOM, index)
        await page.waitForTimeout(650)
        const drawn = await page.evaluate(() => {
          const stage = document.querySelector('.display__stage')
          return {
            screen: stage?.dataset.screen ?? null,
            text: (stage?.innerText ?? '').trim(),
            placeholder: document.body.innerText.includes('Placeholder screen'),
          }
        })
        seen.push({ index, type: flow[index].type, ...drawn })
        assert.equal(
          drawn.placeholder,
          false,
          `node ${index} (${flow[index].type}) fell through to the placeholder`,
        )
        assert.ok(drawn.text.length > 0, `node ${index} (${flow[index].type}) drew nothing`)
      }
      assert.equal(seen.length, 13)
      assert.deepEqual(errors, [], `the wall threw: ${errors.join(' | ')}`)
    } catch (error) {
      await snap(page, 'wall-failure.png')
      throw error
    } finally {
      await context.close()
    }
  })

  test('the welcome shows four game marks and no explanatory copy', async () => {
    const { context, page } = await stage(WALL, { path: `/display/${ROOM}` })
    try {
      await gotoNode(page, 0)
      await page.waitForTimeout(5200)
      const cards = await page.evaluate(() =>
        [...document.querySelectorAll('.wcard')].map((card) => ({
          name: card.querySelector('.wcard__name')?.textContent ?? '',
          icon: card.querySelector('.wcard__icon')?.getAttribute('src') ?? '',
          iconLoaded: card.querySelector('.wcard__icon')?.naturalWidth ?? 0,
          text: card.innerText.replace(/\s+/g, ' ').trim(),
        })),
      )
      await snap(page, 'wall-welcome.png')
      assert.equal(cards.length, 4)
      for (const card of cards) {
        assert.ok(card.icon.startsWith('/game_icons/'), `${card.name} has no mark`)
        assert.ok(card.iconLoaded > 0, `${card.icon} did not load`)
        // The card is a number, a mark and a name. A hook line would show up
        // here as an extra sentence.
        assert.ok(card.text.length < card.name.length + 6, `${card.name} carries extra copy: "${card.text}"`)
      }
    } finally {
      await context.close()
    }
  })
})

describe('an opening hands over from its name to its rules', () => {
  test('three seconds of name, then three plain points', async () => {
    const { context, page } = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      await gotoNode(page, 1)
      const title = await page.evaluate(() => ({
        tab: document.querySelector('.hud__tab')?.textContent ?? '',
        name: document.querySelector('.tcard__title')?.textContent ?? '',
        // A note under the title would be a second paragraph here.
        extra: document.querySelector('.tcard')?.querySelectorAll('p').length ?? 0,
      }))
      assert.match(title.tab, /up next/i)
      assert.ok(title.name.length > 0, 'the name card has no name')
      assert.equal(title.extra, 3, 'the name card should be kicker, title and count only')

      await page.waitForTimeout(3200)
      const rules = await page.evaluate(() => ({
        tab: document.querySelector('.hud__tab')?.textContent ?? '',
        points: [...document.querySelectorAll('.opening__point')].map((li) =>
          li.textContent.trim(),
        ),
        lead: document.querySelector('.brief__lead')?.textContent ?? null,
      }))
      await snap(page, 'ipad-opening-rules.png')
      assert.match(rules.tab, /how to play/i)
      assert.equal(rules.lead, null, 'the rules half still has a lead line')
      assert.ok(rules.points.length >= 3 && rules.points.length <= 4, `${rules.points.length} points`)
      for (const point of rules.points) {
        assert.ok(point.length < 100, `a point is too long to read in 12s: "${point}"`)
      }
    } finally {
      await context.close()
    }
  })
})

describe('the Ultimate round', () => {
  test('the wall and the iPad are on the same question', async () => {
    const { context, page } = await stage(WALL, { path: `/display/${ROOM}` })
    const device = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      await api.jump(ROOM, 10)
      await page.waitForTimeout(900)
      await device.page.waitForTimeout(900)
      const onWall = await page.evaluate(
        () => document.querySelector('.display__question .display__prompt')?.textContent ?? '',
      )
      const onIpad = await device.page.evaluate(
        () => document.querySelector('.quiz__question')?.textContent ?? '',
      )
      assert.ok(onWall.length > 0, 'the wall drew no question')
      assert.equal(onIpad.trim(), onWall.trim(), 'the iPad and the wall disagree')
    } finally {
      await context.close()
      await device.context.close()
    }
  })

  test('five questions, a bonus badge on the last two, and /800 at the end', async () => {
    const errors = []
    const { context, page } = await stage(IPAD, {
      path: `/r/${ROOM}`,
      as: 'player',
      onError: (error) => errors.push(error),
    })
    try {
      await api.jump(ROOM, 10)
      await page.waitForTimeout(800)
      const first = await page.evaluate(() => ({
        count: document.querySelector('.quiz__count')?.innerText.replace(/\s+/g, ' ') ?? '',
        bonus: document.querySelector('.quiz__bonus')?.textContent ?? null,
        from: document.querySelector('.quiz__from')?.textContent ?? '',
      }))
      assert.equal(first.count, '1 / 5')
      assert.equal(first.bonus, null, 'question one is not a bonus')
      assert.ok(first.from.length > 0, 'question one does not say where it came from')

      // Question 5 is the ×3 bonus; waiting through four 25s cycles is the only
      // honest way to reach it, so the node is paused once it is on screen.
      await page.waitForTimeout(4 * 25_000)
      await api.pause(ROOM)
      await page.waitForTimeout(900)
      const last = await page.evaluate(() => ({
        count: document.querySelector('.quiz__count')?.innerText.replace(/\s+/g, ' ') ?? '',
        bonus: document.querySelector('.quiz__bonus')?.textContent ?? null,
        from: document.querySelector('.quiz__from')?.textContent ?? '',
      }))
      await snap(page, 'ipad-quiz-bonus.png')
      assert.equal(last.count, '5 / 5')
      assert.match(last.bonus ?? '', /×3/)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})

describe('the console', () => {
  test('the jump board lists every node and the quiz tables reflect five slots', async () => {
    const errors = []
    const { context, page } = await stage(WALL, {
      path: '/admin',
      as: 'operator',
      onError: (error) => errors.push(error),
    })
    try {
      await api.reset(ROOM)
      await page.waitForTimeout(2500)
      const groups = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .map((b) => b.textContent?.trim() ?? '')
          .filter((text) => /^(welcome|intro|challenge|ranking|quiz|wrap up)$/i.test(text)),
      )
      assert.ok(groups.length >= 12, `the jump board has ${groups.length} buttons`)
      assert.ok(groups.includes('intro'), 'the opening is not on the jump board')
      assert.equal(groups.includes('title'), false, 'the retired title type is still offered')

      await page.evaluate(() => {
        const tab = [...document.querySelectorAll('button')].find((b) =>
          /game setting/i.test(b.textContent ?? ''),
        )
        tab?.click()
      })
      await page.waitForTimeout(900)
      const settings = await page.evaluate(() => {
        const draw = document.querySelector('.admin__qtable--draw')
        const bank = document.querySelector('.admin__qtable--bank')
        return {
          drawRows: draw?.querySelectorAll('tbody tr').length ?? 0,
          bankRows: bank?.querySelectorAll('tbody tr').length ?? 0,
          head: document.querySelector('.admin__panel-head')?.innerText.replace(/\s+/g, ' ') ?? '',
        }
      })
      await snap(page, 'admin-settings.png')
      assert.equal(settings.drawRows, 5, 'the draw table should have five slots')
      assert.equal(settings.bankRows, 20, 'the bank table should have 20 questions')
      // The heading is uppercased by CSS, so `innerText` comes back shouting.
      assert.match(settings.head, /5 questions/i)
      assert.match(settings.head, /800/i)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})

describe('a player mid-show', () => {
  test('signing in and joining lands in the waiting room, not an error', async () => {
    const errors = []
    const context = await browser.newContext({ viewport: IPAD })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(String(error)))
    try {
      await page.goto(`${BASE}/`)
      await page.getByLabel('Nickname').fill(HOST)
      await page.getByLabel('Event').selectOption('hk_fintech_week')
      await page.getByRole('button', { name: /enter/i }).click()
      await page.waitForTimeout(2500)
      const room = await page.evaluate(() => ({
        path: location.pathname,
        text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
      }))
      assert.match(room.path, /^\/play/, 'signing in should land on /play')
      assert.match(room.text, /waiting room|get ready/i)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })
})
