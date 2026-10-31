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
/** Extra players a test brings in to fill a side; cleaned up after the file. */
const EXTRAS = ['Ux-b', 'Ux-c', 'Ux-d', 'Ux-e', 'Ux-f']

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
    // The roster a test invents for itself is deleted here rather than inside
    // the test: deleting a player mid-show leaves the room pointing at someone
    // who is gone, and the next test inherits the wreckage.
    for (const query of [HOST, ...EXTRAS]) {
      const found = await api.get(`/api/players?q=${encodeURIComponent(query)}`, {
        token: api.adminToken,
        expect: 200,
      })
      for (const player of found.players ?? []) {
        if (player.nickname === query) await api.deletePlayer(player.player_id)
      }
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
      // The three points are the client's own wording, character for character.
      // If this assertion trips, someone copy-edited supplied copy: put it back.
      assert.deepEqual(rules.points, [
        'Review the AI response',
        'Drag right if you trust(green), and drag left if you have doubts (yellow)',
        'Your confidence affects your score',
      ])
    } finally {
      await context.close()
    }
  })
})

describe('the trust scale', () => {
  test('the slider is a ten-point scale from -200 to +200, and says what it pays', async () => {
    const { context, page } = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      // Node 2 is the Hallucination round.
      await api.jump(ROOM, 2)
      await page.waitForTimeout(1200)

      const start = await page.evaluate(() => {
        const input = document.querySelector('.hallu__range')
        const question = document.querySelector('.hallu__question')
        const readout = document.querySelector('.hallu__readout')
        return {
          kind: input?.type,
          min: input?.min,
          max: input?.max,
          step: input?.step,
          value: input?.value,
          labels: [...document.querySelectorAll('.hallu__label')].map((l) => l.textContent),
          readout: document.querySelector('.hallu__readout')?.innerText.replace(/\s+/g, ' '),
          question: question?.textContent,
          lockedIn: /lock/i.test(document.querySelector('.hallu__choices')?.innerText ?? ''),
          questionGap: parseFloat(getComputedStyle(question).marginBottom),
          readoutGap: parseFloat(getComputedStyle(readout).marginTop),
        }
      })
      assert.equal(start.kind, 'range', 'the five buttons should be one slider')
      assert.equal(start.min, '-200')
      assert.equal(start.max, '200')
      assert.equal(start.step, '10')
      assert.equal(start.value, '0', 'it starts in the middle, risking nothing')
      assert.deepEqual(start.labels, ['Doubt', 'Not sure', 'Trust'])
      assert.match(start.readout ?? '', /0/)
      assert.match(start.readout ?? '', /nothing either way/)
      assert.equal(start.question, 'Can you trust this AI response, or should you doubt it?')
      assert.equal(start.lockedIn, false, 'nothing tells players to lock in any more')
      assert.equal(start.questionGap, 8)
      assert.equal(start.readoutGap, 16)

      const at = async (value) => {
        await page.evaluate((v) => {
          const input = document.querySelector('.hallu__range')
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value',
          ).set
          setter.call(input, String(v))
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }, value)
        await page.waitForTimeout(120)
        return page.evaluate(() => {
          const track = document.querySelector('.hallu__track').getBoundingClientRect()
          const fill = document.querySelector('.hallu__fill').getBoundingClientRect()
          const probe = document.createElement('div')
          document.body.appendChild(probe)
          probe.style.backgroundColor = getComputedStyle(
            document.querySelector('.hallu__slider'),
          )
            .getPropertyValue('--lean-deep')
            .trim()
          const deep = getComputedStyle(probe).backgroundColor
          probe.remove()
          return {
            gain: document.querySelector('.hallu__gain')?.textContent,
            note: document.querySelector('.hallu__gainnote')?.textContent ?? '',
            lit: [...document.querySelectorAll('.hallu__label')].find((l) =>
              l.classList.contains('is-on'),
            )?.textContent,
            from: Math.round(((fill.left - track.left) / track.width) * 100),
            width: Math.round((fill.width / track.width) * 100),
            deep,
          }
        })
      }

      // Depth is the magnitude in colour: a timid bet is a pale tint, a full one
      // is the real yellow/green. Compare channels on the same side only.
      const channels = (colour) => {
        const nums = (colour.match(/-?[\d.]+/g) ?? []).map(Number)
        return colour.startsWith('rgb(') ? nums.map((n) => n / 255) : nums
      }

      const trust = await at(140)
      assert.equal(trust.gain, '+140')
      assert.match(trust.note, /if you are correct/)
      // Winning pays the stake; losing pays half of it. A full push is +200
      // when right and −100 when wrong, so committing is never punished harder
      // than playing safe is rewarded.
      assert.match(trust.note, /−70 if you are wrong/)
      assert.equal(trust.lit, 'Trust')
      // The bar grows out of the middle, towards the side you dragged.
      assert.equal(trust.from, 50)
      assert.equal(trust.width, 35)

      const doubt = await at(-140)
      assert.equal(doubt.gain, '+140', 'the same 140 is at stake on the doubt side')
      assert.equal(doubt.lit, 'Doubt')
      assert.equal(doubt.from, 15)
      assert.equal(doubt.width, 35)

      const full = await at(200)
      assert.equal(full.gain, '+200')
      assert.match(full.note, /−100 if you are wrong/)

      const trustsHarder = channels((await at(200)).deep)
      const trustsSoftly = channels((await at(40)).deep)
      assert.ok(
        trustsHarder[0] < trustsSoftly[0] - 0.05,
        `trust should deepen as you drag: ${trustsSoftly} → ${trustsHarder}`,
      )

      const doubtsHarder = channels((await at(-200)).deep)
      const doubtsSoftly = channels((await at(-40)).deep)
      assert.ok(
        doubtsHarder[2] < doubtsSoftly[2] - 0.05,
        `doubt should deepen as you drag: ${doubtsSoftly} → ${doubtsHarder}`,
      )
      await snap(page, 'ipad-trust-scale.png')
    } finally {
      await context.close()
    }
  })
})

describe('the sabotage draw', () => {
  test('names the side, the job and the colour, then opens the rules one line at a time', async () => {
    // Sabotage needs a side to draw: one lone player resolves all four rounds
    // before the draw screen has finished painting.
    for (const name of EXTRAS) await api.join(ROOM, name)
    await api.assignTeams(ROOM)
    const { context, page } = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      // Node 7 is Sabotage; its first ten seconds are the draw, then the rules.
      await api.jump(ROOM, 7)
      await page.waitForTimeout(900)

      const draw = await page.evaluate(() => {
        const team = document.querySelector('.sab__teamname')
        const word = document.querySelector('.sab__roleword')
        return {
          team: team?.textContent?.trim(),
          teamColour: team && getComputedStyle(team).color,
          role: document.querySelector('.sab__role')?.textContent?.replace(/\s+/g, ' ').trim(),
          wordColour: word && getComputedStyle(word).color,
          legend: [...document.querySelectorAll('.sab__legend > span')].map((s) => ({
            text: s.textContent.trim(),
            colour: getComputedStyle(s).color,
          })),
          sidenote: Boolean(document.querySelector('.sab__intro .sab__sidenote')),
        }
      })

      assert.match(draw.team ?? '', /^TEAM [AB]$/, 'sides are named A and B, never by colour')
      assert.equal(draw.teamColour, 'rgb(244, 244, 246)', 'the team name is white, not tinted')
      assert.match(draw.role ?? '', /^You are (ATTACKER|DEFENDER) in round I$/)
      assert.ok(
        ['rgb(226, 28, 226)', 'rgb(22, 198, 226)'].includes(draw.wordColour ?? ''),
        `the job carries its own colour: ${draw.wordColour}`,
      )
      assert.deepEqual(
        draw.legend.map((entry) => entry.text),
        ['Purple round to attack', '·', 'Blue round to defend'],
      )
      assert.equal(draw.legend[0].colour, 'rgb(226, 28, 226)')
      assert.equal(draw.legend[2].colour, 'rgb(22, 198, 226)')
      assert.equal(draw.sidenote, false, 'nothing sits under the legend any more')

      await page.waitForSelector('.sab__rules', { timeout: 15000 })
      const rules = await page.evaluate(() => {
        const steps = [...document.querySelectorAll('.sab__rulestep')]
        return {
          texts: steps.map((s) => s.textContent.replace(/\s+/g, ' ').trim()),
          delays: steps.map((s) => getComputedStyle(s).animationDelay),
          lastOpacity: getComputedStyle(steps[steps.length - 1]).opacity,
        }
      })
      assert.deepEqual(rules.texts, [
        'Four Rounds, One Team Wins',
        'Your team will share a $100,000 budget for all four rounds',
        'You will switch between Attacker and Defender',
        'Choose your cards to build your Attack / Defense, up to four cards each round',
        'Discuss with your teammates, for the best combination',
        'Sharpest Spear vs Most Balanced Shield',
      ])
      assert.deepEqual(
        rules.delays,
        ['0s', '2s', '4s', '6s', '8s', '10s'],
        'one line every two seconds, so each gets read',
      )
      assert.equal(rules.lastOpacity, '0', 'the last line is still waiting its turn')

      // Then the cards. Everything the header used to carry is gone: one round
      // name, one instruction that starts with who you are, two money numbers.
      await page.waitForSelector('.sab__cards', { timeout: 30000 })
      const pick = await page.evaluate(() => {
        const text = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim()
        const stage = document.querySelector('.sab__stage')
        const icon = document.querySelector('.sab__cardicon img')
        return {
          title: text('.sab__scenetitle'),
          brief: text('.sab__scenebrief'),
          head: Boolean(document.querySelector('.sab__scenehead')),
          build: text('.sab__build'),
          iconHeight: icon ? Math.round(icon.getBoundingClientRect().height) : 0,
          cardHeight: Math.round(document.querySelector('.sab__card').getBoundingClientRect().height),
          overflow: stage.scrollHeight > stage.clientHeight,
        }
      })
      assert.equal(pick.title, 'Phishing Email')
      assert.match(pick.brief ?? '', /^You are the (Attacker|Defender)\. Choose the cards below to /)
      assert.equal(pick.head, false, 'the round number and the target badge are gone')
      assert.match(pick.build ?? '', /^\$[\d,]+Spend for this round/)
      assert.equal(
        (pick.build ?? '').includes('all four rounds'),
        false,
        'the budget carries no label any more',
      )
      assert.equal((pick.build ?? '').includes('Earlier rounds'), false)
      assert.ok(pick.iconHeight >= 140, `the card art doubles: ${pick.iconHeight}px`)
      assert.ok(pick.cardHeight >= 380, `the cards got taller: ${pick.cardHeight}px`)
      assert.equal(pick.overflow, false, 'the stage still fits an iPad without scrolling')

      await api.pause(ROOM)
      await page.waitForSelector('.sab__paused', { timeout: 5000 })
      const paused = await page.evaluate(
        () => document.querySelector('.sab__paused')?.textContent?.trim(),
      )
      assert.equal(paused, 'Game Paused')
      await api.resume(ROOM)

      // Round 1 gives the picking screen 35s; the reveal lands after that.
      await page.waitForSelector('.sab__reveal', { timeout: 60000 })
      const reveal = await page.evaluate(() => {
        const text = (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim()
        return {
          verdict: text('.sab__verdict'),
          rows: [...document.querySelectorAll('.sab__line')].map((li) => ({
            name: li.querySelector('.sab__linename')?.textContent?.trim(),
            attack: li.querySelector('.sab__linescore b')?.textContent?.trim(),
            defence: li.querySelectorAll('.sab__linescore b')[1]?.textContent?.trim(),
            verdict: li.querySelector('.sab__linewin')?.textContent?.trim(),
            sentence: li.querySelector('.sab__linetext')?.textContent?.trim(),
          })),
          score: text('.sab__score'),
        }
      })
      assert.match(
        reveal.verdict ?? '',
        /^(Successfully Attacked|Attack Failed|Successfully Defended|Defense Failed)$/,
      )
      assert.deepEqual(
        reveal.rows.map((row) => row.name),
        ['Data', 'People', 'Infra'],
      )
      for (const row of reveal.rows) {
        assert.match(row.attack ?? '', /^\d+$/, 'each row leads with the attack score')
        assert.match(row.defence ?? '', /^\d+$/, 'then the defence score')
        assert.ok(['WIN', 'LOSE'].includes(row.verdict ?? ''), `row verdict: ${row.verdict}`)
        // Plain English, no metaphor: whoever the sentence is about, it says
        // what happened in the words a first-time player already knows.
        assert.match(
          row.sentence ?? '',
          /^(You successfully|You couldn't|Your |Their |The )/,
          `row copy stays literal: ${row.sentence}`,
        )
      }
      // Round 1 is phishing, and every line has to say so in its own column's
      // terms - the generic fallback this replaced was true of nothing.
      assert.match(reveal.rows[0].sentence ?? '', /phishing/i)
      assert.match(reveal.rows[1].sentence ?? '', /employee/i)
      assert.match(reveal.rows[2].sentence ?? '', /filter/i)

      assert.match(
        reveal.score ?? '',
        /^Attacker( \(You\))?\+\d+\$[\d,]+ spent \(\$[\d,]+ left\):Defender( \(You\))?\+\d+\$[\d,]+ spent \(\$[\d,]+ left\)$/,
        `both sides, one line each: ${reveal.score}`,
      )
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
