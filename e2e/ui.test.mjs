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
  // `domcontentloaded`, not the default `load`: every screen here holds a
  // websocket open, and waiting for the load event turns a slow suite into a
  // 30-second timeout that says nothing about the page. The assertions that
  // follow all wait for the element they care about.
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
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
      // Kicker and title only: the countdown under the rule is gone, because a
      // clock on the name card tells the room to wait through the one moment
      // that is about the game starting.
      assert.equal(title.extra, 2, 'the name card should be kicker and title only')

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
        'Drag right if you trust, and drag left if you have doubts',
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
          hint: Boolean(document.querySelector('.hallu__hint')),
          ghost: Boolean(document.querySelector('.hallu__ghost')),
          readoutGap: parseFloat(getComputedStyle(readout).marginTop),
        }
      })
      assert.equal(start.kind, 'range', 'the five buttons should be one slider')
      assert.equal(start.min, '-200')
      assert.equal(start.max, '200')
      assert.equal(start.step, '10')
      assert.equal(start.value, '0', 'it starts in the middle, risking nothing')
      // The arrows are part of the label now: they say which way to drag.
      assert.deepEqual(start.labels, ['← Doubt', 'Not sure', 'Trust →'])
      assert.equal(start.ghost, true, 'the hint handle sways until the slider is touched')
      assert.match(start.readout ?? '', /0/)
      assert.match(start.readout ?? '', /nothing either way/)
      assert.equal(start.question, 'Can you trust this AI response, or should you doubt it?')
      assert.equal(start.lockedIn, false, 'nothing tells players to lock in any more')
      // 8px plus the 32px the question was opened up by, so it stops looking
      // welded to the scale underneath it.
      assert.equal(start.questionGap, 40)
      assert.equal(start.hint, false, 'the drag hint is gone; the scale says it itself')
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
      assert.equal(trust.lit, 'Trust →')
      // The bar grows out of the middle, towards the side you dragged.
      assert.equal(trust.from, 50)
      assert.equal(trust.width, 35)

      const doubt = await at(-140)
      assert.equal(doubt.gain, '+140', 'the same 140 is at stake on the doubt side')
      assert.equal(doubt.lit, '← Doubt')
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

describe('the data shadow post', () => {
  test('a paragraph joins the report on one tap, and leaves it on the next', async () => {
    const { context, page } = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      // Node 5 is the Data Shadow round itself.
      await api.jump(ROOM, 5)
      await page.waitForSelector('.post__para', { timeout: 20000 })

      const shape = await page.evaluate(() => ({
        paragraphs: document.querySelectorAll('.post__para').length,
        pictures: document.querySelectorAll('.post__shot').length,
        userSelect: getComputedStyle(document.querySelector('.post__para')).userSelect,
        selectable: window.getSelection()?.isCollapsed,
      }))
      assert.equal(shape.paragraphs, 7, 'the post is seven paragraphs')
      assert.equal(shape.pictures, 2, 'two pictures, not three')
      assert.equal(shape.userSelect, 'none', 'the post is not selectable text any more')
      assert.equal(shape.selectable, true, 'and nothing selected itself on load')

      const read = () =>
        page.evaluate(() => ({
          report: [...document.querySelectorAll('.report__text')].map((n) => n.textContent),
          flagged: [...document.querySelectorAll('.post__mark.is-flagged')].map((n) =>
            n.textContent.slice(0, 32),
          ),
          pressed: [...document.querySelectorAll('.post__para')].map((n) =>
            n.getAttribute('aria-pressed'),
          ),
          count: document.querySelector('.report__count')?.innerText.replace(/\s+/g, ' ') ?? '',
        }))

      // Tap the paragraph that carries the leak; the whole block is the answer.
      const leak = page.locator('.post__para', { hasText: 'real customer conversations' })
      await leak.click()
      const added = await read()
      assert.equal(added.flagged.length, 1)
      assert.match(added.flagged[0] ?? '', /^That followed months of testing/)
      assert.equal(added.report.length, 1)
      assert.match(added.report[0] ?? '', /real customer conversations/)
      assert.equal(added.pressed.filter((state) => state === 'true').length, 1)
      // Out of the things worth tapping - four paragraphs and one picture - not
      // out of the seven leaks: two of those paragraphs hold two each.
      assert.match(added.count, /^1\/5$/, `the count says one of five: ${added.count}`)

      // Tapping it again is how a mistaken paragraph comes back out.
      await leak.click()
      const removed = await read()
      assert.deepEqual(removed.report, [])
      assert.deepEqual(removed.flagged, [])

      // A picture is still its own small button, separate from tapping to look.
      await page.locator('.post__shotflag').first().click()
      const picture = await read()
      assert.equal(picture.report.length, 1)
      await snap(page, 'ipad-data-shadow.png')
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
      ])
      assert.deepEqual(
        rules.delays,
        ['0s', '2s', '4s', '6s', '8s'],
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
      assert.match(
        pick.brief ?? '',
        /^You are the (Attacker|Defender)\. Choose from the (cards|attacks) below to /,
      )
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

      // Round 1 gives the picking screen 40s; the reveal lands after that.
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
  test('the right answer opens its explanation, and a wrong pick wears the red', async () => {
    const { context, page } = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      await api.jump(ROOM, 10)
      await page.waitForTimeout(700)
      // Answer A without knowing the key: whichever way it goes, the reveal has
      // to colour exactly one row green and, if A was wrong, exactly one red.
      await page.click('.quiz__option:first-child')
      await page.waitForSelector('.quiz__note', { timeout: 30_000 })
      // The rows fade their border colour in; reading it on the same frame the
      // note appears caught it mid-transition and reported a blended green.
      await page.waitForTimeout(300)

      const review = await page.evaluate(() => {
        const colour = (selector) => {
          const element = document.querySelector(selector)
          return element ? getComputedStyle(element).borderTopColor : null
        }
        const slots = [...document.querySelectorAll('.quiz__slot')]
        const open = slots.filter((slot) => slot.classList.contains('is-open'))
        return {
          open: open.length,
          openLetter: open[0]?.querySelector('.quiz__letter')?.textContent ?? null,
          note: document.querySelector('.quiz__note .quiz__explain')?.textContent ?? '',
          // The note sits under the four options, not inside the answered one:
          // inside, opening it made every row grow with it.
          noteInsideSlot: Boolean(document.querySelector('.quiz__slot .quiz__note')),
          answers: document.querySelectorAll('.quiz__option.is-answer').length,
          answerColour: colour('.quiz__option.is-answer'),
          wrongCount: document.querySelectorAll('.quiz__option.is-wrong').length,
          wrongColour: colour('.quiz__option.is-wrong'),
          tick: document.querySelector('.quiz__verdict.is-right')?.textContent ?? null,
          // The old bottom line is gone: the note is the explanation now.
          bottomLine: document.querySelector('.quiz__correct'),
          autonext: document.querySelector('.quiz__autonext')?.textContent?.replace(/\s+/g, ' ') ?? '',
        }
      })

      assert.equal(review.open, 1, 'exactly one option opens')
      assert.equal(review.answers, 1, 'exactly one option is the answer')
      assert.equal(review.answerColour, 'rgb(53, 208, 127)', `the answer is green: ${review.answerColour}`)
      assert.equal(review.tick?.trim(), '✓')
      assert.ok(review.note.length > 40, 'the explanation opened with the answer')
      assert.equal(review.noteInsideSlot, false, 'the note sits under the options, not in one')
      assert.equal(review.bottomLine, null, 'nothing says "the answer was" any more')
      assert.match(review.autonext, /Next question|Final score/)
      if (review.wrongCount > 0) {
        assert.equal(review.wrongColour, 'rgb(255, 82, 87)', `a wrong pick is red: ${review.wrongColour}`)
        assert.notEqual(review.openLetter, null)
      }
      await snap(page, 'ipad-quiz-review.png')

      // Half of a question is for being right and half for being quick, so an
      // answer inside the first second pays the whole hundred - and a wrong one
      // pays nothing at all. Both are read off the board the server wrote.
      const board = await fetch(`${BASE}/api/players?room=${ROOM}`, {
        headers: { Authorization: `Bearer ${api.adminToken}` },
      }).then((response) => response.json())
      const me = (board.players ?? []).find((row) => row.nickname.startsWith(HOST))
      const scored = me?.score?.ultimate_score ?? 0
      const right = review.openLetter?.trim() === 'A'
      if (right) {
        assert.ok(
          scored >= 50 && scored <= 100,
          `a correct answer is worth 50-100, not ${scored}`,
        )
      } else {
        assert.equal(scored, 0, `a wrong answer is worth nothing, not ${scored}`)
      }
    } finally {
      await context.close()
    }
  })

  test('the wall and the iPad are on the same question', async () => {
    const { context, page } = await stage(WALL, { path: `/display/${ROOM}` })
    const device = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      await api.jump(ROOM, 10)
      await page.waitForTimeout(900)
      await device.page.waitForTimeout(900)
      const onWall = await page.evaluate(
        () => document.querySelector('.display__quiz .display__prompt')?.textContent ?? '',
      )
      const onIpad = await device.page.evaluate(
        () => document.querySelector('.quiz__question')?.textContent ?? '',
      )
      assert.ok(onWall.length > 0, 'the wall drew no question')
      assert.equal(onIpad.trim(), onWall.trim(), 'the iPad and the wall disagree')

      // The Ultimate wall carries the four answers too, lettered like the
      // iPads, so the room can read along and the host can call one out.
      const options = await page.evaluate(() =>
        [...document.querySelectorAll('.display__option')].map((li) => [
          li.querySelector('.display__optionletter')?.textContent?.trim(),
          li.querySelector('.display__optiontext')?.textContent?.trim(),
        ]),
      )
      assert.equal(options.length, 4, 'the wall shows four options')
      assert.deepEqual(
        options.map(([letter]) => letter),
        ['A', 'B', 'C', 'D'],
      )
      const onIpadOptions = await device.page.evaluate(() =>
        [...document.querySelectorAll('.quiz__optiontext')].map((el) => el.textContent?.trim()),
      )
      assert.deepEqual(
        options.map(([, text]) => text),
        onIpadOptions,
        'the wall and the iPad list the same four answers',
      )

      // Once the answers close, the wall swaps the question for the standings.
      await page.waitForTimeout(21_000)
      const board = await page.evaluate(() => ({
        heads: document.querySelectorAll('.display__liveboardhead').length,
        rows: document.querySelectorAll('.display__liveboard .ldb__row').length,
      }))
      // The board says what it is by being a board: a heading over five rows on
      // a projector was a label the room could already read.
      assert.equal(board.heads, 0, 'the standings carry no heading of their own')
      assert.ok(board.rows > 0, 'the standings are empty')
    } finally {
      await context.close()
      await device.context.close()
    }
  })

  test('a bonus card opens each bonus question, and the round closes on /600', async () => {
    const errors = []
    const { context, page } = await stage(IPAD, {
      path: `/r/${ROOM}`,
      as: 'player',
      onError: (error) => errors.push(error),
    })
    const wall = await stage(WALL, { path: `/display/${ROOM}` })
    try {
      await api.jump(ROOM, 10)
      await page.waitForTimeout(800)
      const first = await page.evaluate(() => ({
        count: document.querySelector('.quiz__count')?.innerText.replace(/\s+/g, ' ') ?? '',
        bonus: document.querySelector('.quiz__bonus')?.textContent ?? null,
      }))
      assert.equal(first.count, '1 / 3')
      assert.equal(first.bonus, null, 'question one is not a bonus')
      // The round is the topic: the screen no longer names the pool it drew from.
      assert.equal(
        await page.evaluate(() => !!document.querySelector('.quiz__from')),
        false,
        'the quiz still names its question pool',
      )

      // Waiting through the real cycles is the only honest way to reach a bonus:
      // the cards cannot be seeked to, and faking the clock would test nothing.
      const readCard = () =>
        page.evaluate(() => ({
          mult: document.querySelector('.quiz__reelstrip .is-landed')?.textContent ?? null,
          worth: document.querySelector('.quiz__bonusworth')?.textContent ?? '',
          count: document.querySelector('.quiz__count')?.innerText.replace(/\s+/g, ' ') ?? '',
          options: document.querySelectorAll('.quiz__option').length,
          // Every cell is a stop the reel can land on, and the reel's own
          // transform is where it ends up.
          cells: document.querySelectorAll('.quiz__reelstrip span').length,
          landed: getComputedStyle(document.querySelector('.quiz__reelstrip')).transform,
        }))

      // `waitForFunction(fn, arg, options)`: the options object is the third
      // argument, and a long bonus wait needs its own budget.
      await page.waitForFunction(
        () => document.querySelector('.quiz__reelstrip .is-landed')?.textContent === '2',
        null,
        { timeout: 95_000 },
      )
      const twice = await readCard()
      assert.equal(twice.count, '2 / 3', 'the card belongs to question two')
      assert.match(twice.worth, /Gain 200 instead of 100/, 'the card says what you gain')
      assert.ok(twice.cells > 9, 'the reel has a strip to spin through')
      assert.notEqual(twice.landed, 'none', 'the reel lands on a transform, not on nothing')
      assert.equal(twice.options, 0, 'a card is not answerable')
      // The wall shows the same card, or the room is told a different story.
      // Its clock ticks on a 250ms timer, so the card can land a beat after the
      // tablet's: poll rather than sampling the frame the iPad happened to win.
      // The budget covers the card's own three seconds, because the iPad can
      // already be most of the way through it by the time it is read.
      await wall.page.waitForFunction(
        () => document.querySelector('.display__reelstrip .is-landed')?.textContent === '2',
        null,
        { timeout: 5_000 },
      )
      await snap(page, 'ipad-quiz-bonus-card.png')

      await page.waitForFunction(
        () => document.querySelector('.quiz__reelstrip .is-landed')?.textContent === '3',
        null,
        { timeout: 45_000 },
      )
      const thrice = await readCard()
      assert.equal(thrice.count, '3 / 3')
      assert.match(thrice.worth, /300/)

      // Then the question itself, with the badge that says why it matters. The
      // count reads 3 / 3 during the card as well, so the options are what says
      // the card has handed over.
      await page.waitForFunction(
        () => document.querySelectorAll('.quiz__option').length === 4,
        null,
        { timeout: 20_000 },
      )
      await api.pause(ROOM)
      await page.waitForTimeout(900)
      const last = await page.evaluate(() => ({
        bonus: document.querySelector('.quiz__bonus')?.textContent ?? null,
        count: document.querySelector('.quiz__count')?.innerText.replace(/\s+/g, ' ') ?? '',
        options: document.querySelectorAll('.quiz__option').length,
      }))
      assert.equal(last.count, '3 / 3')
      assert.match(last.bonus ?? '', /×3/)
      assert.equal(last.options, 4, 'the question is back')
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
      await wall.context.close()
    }
  })
})

describe('the final board', () => {
  test('stacks from last place up, and lands the top three last', async () => {
    // Its own crowd, so the test says the same thing whatever ran before it: a
    // pile of one is not a pile.
    const crowd = ['Ux-f1', 'Ux-f2', 'Ux-f3', 'Ux-f4']
    for (const name of crowd) await api.join(ROOM, name)
    const { context, page } = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    try {
      // Node 11 is the activity board: everyone's total, which is the last
      // screen with numbers on it.
      await api.jump(ROOM, 11)
      await page.waitForSelector('.ldb--pile', { timeout: 20000 })

      const shape = await page.evaluate(() => ({
        split: Boolean(document.querySelector('.ldb__list--split')),
        rows: [...document.querySelectorAll('.ldb__row')].map((row) => ({
          rank: row.querySelector('.ldb__rank')?.textContent?.trim(),
          opacity: Number(getComputedStyle(row).opacity),
          top: Math.round(row.getBoundingClientRect().top),
        })),
      }))
      assert.equal(shape.split, false, 'the final board is one column: it is a stack')
      assert.ok(shape.rows.length > 2, 'the pile needs something to stack')

      // Read it again once the pile has finished and the top three have flared.
      await page.waitForTimeout(4_000)
      const settled = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.ldb__row')]
        return {
          opacities: rows.map((row) => Number(getComputedStyle(row).opacity)),
          order: rows.map((row) => row.querySelector('.ldb__name')?.textContent?.trim()),
          scores: rows.map((row) => Number(row.querySelector('.ldb__score')?.textContent ?? 0)),
        }
      })
      assert.deepEqual(
        settled.opacities,
        settled.opacities.map(() => 1),
        'every place is on the board by the end',
      )
      assert.deepEqual(
        [...settled.scores].sort((a, b) => b - a),
        settled.scores,
        'and they are in order, best first',
      )
      await snap(page, 'ipad-final-board.png')
    } finally {
      await context.close()
      for (const name of crowd) {
        const found = await api.get(`/api/players?q=${encodeURIComponent(name)}`, {
          token: api.adminToken,
          expect: 200,
        })
        for (const player of found.players ?? []) {
          if (player.nickname === name) await api.deletePlayer(player.player_id)
        }
      }
    }
  })
})

describe('the console', () => {
  test('the jump board lists every node and the quiz tables reflect three slots', async () => {
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
          // The settings page now opens with the module picker, so read the
          // head of the panel this assertion is about rather than the first one.
          head:
            [...document.querySelectorAll('.admin__panel-head')]
              .map((el) => el.innerText.replace(/\s+/g, ' '))
              .find((text) => /ultimate quiz/i.test(text)) ?? '',
        }
      })
      await snap(page, 'admin-settings.png')
      assert.equal(settings.drawRows, 3, 'the draw table should have three slots')
      assert.equal(settings.bankRows, 13, 'the bank table should have 13 questions')
      // The heading is uppercased by CSS, so `innerText` comes back shouting.
      assert.match(settings.head, /3 questions/i)
      assert.match(settings.head, /600/i)
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
      // The event is pinned to the show's own festival and locked, so signing in
      // is a nickname and nothing else.
      assert.equal(await page.getByLabel('Event').isDisabled(), true, 'the event is locked')
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

describe('a room built without a game', () => {
  test('draws three cards, says "three", and counts to three', async () => {
    // The Singapore cut: three games, no battle. Everything that counts the
    // games - the welcome map, the subhead, the round line, the progress
    // diamonds - has to follow the room rather than the four games the bundle
    // knows about, or the screens promise a show that is not in the rundown.
    const code = e2eRoomCode('SHORT')
    const created = await api.post('/api/rooms', {
      token: api.adminToken,
      body: {
        code,
        modules: ['welcome', 'hallucination', 'data', 'ultimate', 'total', 'wrapup'],
      },
      expect: 201,
    })
    assert.equal(created.state.node_count, 11, 'the battle nodes are not in the flow')

    const { context, page } = await stage(IPAD, { path: `/r/${code}`, as: 'player' })
    try {
      // The room opens on WAITING, so the welcome card only appears once the
      // show starts; jumping to node 0 is the shortest way in.
      await api.jump(code, 0)
      await page.waitForTimeout(2500)
      const welcome = await page.evaluate(() => ({
        sub: document.querySelector('.welcome__sub')?.textContent?.trim(),
        cards: document.querySelectorAll('.wcard').length,
        names: [...document.querySelectorAll('.wcard__name')].map((el) => el.textContent?.trim()),
        diamonds: document.querySelectorAll('.game__seg').length,
      }))
      assert.equal(welcome.cards, 3, 'one card per game in this room')
      assert.deepEqual(welcome.names, ['AI Hallucination', 'Data Shadow', 'Ultimate Showdown'])
      assert.match(welcome.sub ?? '', /three games/i)
      assert.equal(welcome.diamonds, 3, 'the progress track counts this room too')

      await api.jump(code, 1)
      await page.waitForTimeout(1200)
      const opening = await page.evaluate(
        () => document.querySelector('.hud__event')?.textContent?.trim(),
      )
      assert.equal(opening, 'Round 1 of 3')
    } finally {
      await context.close()
      await api.finishRoom(code).catch(() => {})
      await api.deleteRoom(code).catch(() => {})
    }
  })
})

describe('the clocks in the room agree', () => {
  test('the wall counts the window the iPads count, not the node', async () => {
    // A node's clock is longer than the window the room can act in: a review
    // follows each question, ten seconds in Hallucination and eight in the quiz,
    // and ten seconds of reveal follow Data Shadow. The wall used to publish the
    // node clock, so it read "0:25" while every iPad read "0:20" - the one
    // number in the room nobody could agree on.
    const ipad = await stage(IPAD, { path: `/r/${ROOM}`, as: 'player' })
    const wall = await stage(WALL, { path: `/display/${ROOM}` })
    // A background tab has its timers throttled, which would make this test
    // measure the harness rather than the clocks.
    await wall.page.bringToFront()
    const CASES = [
      { node: 2, timer: '.hallu__timer', answer: 20, label: 'Hallucination' },
      { node: 5, timer: '.shadow__timer', answer: 50, label: 'Data Shadow' },
      { node: 10, timer: '.quiz__timer', answer: 20, label: 'Ultimate Quiz' },
    ]
    try {
      for (const one of CASES) {
        await api.jump(ROOM, one.node)
        await wall.page.waitForTimeout(2200)
        const [onWall, onPad] = await Promise.all([
          wall.page.evaluate(
            () => document.querySelector('.display__clock')?.textContent?.trim() ?? '',
          ),
          ipad.page.evaluate(
            (timer) => document.querySelector(timer)?.textContent?.trim() ?? '',
            one.timer,
          ),
        ])
        // The wall writes `0:24`, the games write `24s`.
        const asSeconds = (text) => {
          const plain = text.replace('s', '')
          if (!plain.includes(':')) return Number(plain)
          const [minutes, seconds] = plain.split(':')
          return Number(minutes) * 60 + Number(seconds)
        }
        const wallSeconds = asSeconds(onWall)
        const padSeconds = asSeconds(onPad)
        assert.ok(
          Math.abs(wallSeconds - padSeconds) <= 1,
          `${one.label}: wall ${onWall} vs iPad ${onPad}`,
        )
        assert.ok(
          wallSeconds <= one.answer,
          `${one.label}: the wall is counting the node (${onWall}), not the ${one.answer}s answer window`,
        )
        assert.ok(
          padSeconds <= one.answer,
          `${one.label}: the iPad is counting (${onPad}), more than its ${one.answer}s window`,
        )
      }
    } finally {
      await ipad.context.close()
      await wall.context.close()
    }
  })
})

describe('event control', () => {
  test('draws one event at a time and never touches the show', async () => {
    // The page is in the console so an operator can look at the last event while
    // this one is running. It may change which event the boards rank, but it must
    // never move the show - asserted at the end.
    const before = await api.state(ROOM)
    const original = (await api.get('/api/settings', { token: api.adminToken, expect: 200 }))
      .active_event
    const { context, page } = await stage(WALL, { path: '/admin', as: 'operator' })
    try {
      await page.getByRole('button', { name: /event control/i }).click()
      await page.waitForTimeout(1500)

      const tabs = await page.locator('.admin__toggle button').allInnerTexts()
      assert.equal(tabs.length, 3, 'one button per event, from the backend list')
      assert.ok(
        tabs.some((label) => /fintech week/i.test(label)),
        'the events the login screen offers are the ones in the report',
      )

      const cards = await page.locator('.report__card').count()
      assert.equal(cards, 6, 'signed in, played, average, best, rounds, joins')

      // Pick each event in turn: the numbers must come back for each one rather
      // than the first event's report staying on screen.
      const seen = new Set()
      for (const tab of await page.locator('.admin__toggle button').all()) {
        await tab.click()
        await page.waitForTimeout(900)
        const headline = await page.locator('.report__card').first().innerText()
        const selected = await tab.getAttribute('aria-selected')
        assert.equal(selected, 'true', 'the clicked event is the selected one')
        seen.add(headline)
        // Every card is a number, not a blank or an error.
        for (const card of await page.locator('.report__card-value').allInnerTexts()) {
          assert.match(card, /^[\d,.]+$/, `a card read "${card}"`)
        }
      }
      assert.ok(seen.size >= 1, 'a report rendered for every event')

      // The leaderboard is ordered, and no other event's player leaks in.
      const totals = await page
        .locator('.report__block table tbody tr td:nth-child(3)')
        .allInnerTexts()
      const numbers = totals.map((value) => Number(value.replace(/,/g, '')))
      assert.deepEqual(numbers, [...numbers].sort((a, b) => b - a), 'the board is best first')

      // Picking an event is a decision, not a filter: it is stored, so the wall
      // and the waiting room draw that event's board too.
      const stored = await api.get('/api/settings', { token: api.adminToken, expect: 200 })
      assert.ok(stored.active_event, 'picking an event stored nothing')
      assert.equal(
        await page.locator('.report__tab-live').count(),
        1,
        'exactly one event is marked as the one being shown',
      )
      const board = await api.get('/api/leaderboard?limit=50', { expect: 200 })
      assert.equal(board.event, stored.active_event, 'the shared board ignored the choice')
      for (const row of board.players) {
        assert.ok(row.nickname, 'the scoped board returned a row without a name')
      }
      // A one-off look elsewhere does not disturb the stored choice.
      const mixed = await api.get('/api/leaderboard?limit=50&event=all', { expect: 200 })
      assert.equal(mixed.event, null, '`all` should rank every event together')
    } finally {
      await context.close()
      // Leave the console as it was found: the boards are shared state.
      await api.put('/api/settings', {
        token: api.adminToken,
        body: { active_event: original },
        expect: 200,
      })
    }

    const after = await api.state(ROOM)
    assert.equal(after.phase, before.phase, 'the report changed the show')
    assert.equal(after.index, before.index, 'the report moved the show')
  })
})

/**
 * Wait until a count reaches `want`, then return what it actually reached.
 *
 * Counting a table right after clicking asks "did the browser paint yet", which
 * answers differently on a loaded machine. Waiting for the number is the same
 * assertion without the race.
 */
async function waitForCount(page, read, want, timeoutMs = 8000) {
  const started = Date.now()
  let seen = 0
  while (Date.now() - started < timeoutMs) {
    seen = await read()
    if (seen === want) return seen
    await page.waitForTimeout(150)
  }
  return seen
}

describe('the data page', () => {
  test('pages through every room and opens one to the people who played it', async () => {
    const listed = await api.get('/api/rooms', { token: api.adminToken, expect: 200 })
    const { context, page } = await stage(WALL, { path: '/admin', as: 'operator' })
    try {
      await page.getByRole('button', { name: /arcade data/i }).click()
      await page.waitForTimeout(1200)

      // A page of ten, and the pager says how many there are in total.
      const rows = await page.locator('.admin__room').count()
      assert.equal(rows, Math.min(10, listed.rooms.length), 'one line per room, ten to a page')
      if (listed.rooms.length > 10) {
        const pager = await page.locator('.admin__pager').innerText()
        assert.match(pager, /1–10 of \d+/, 'the pager starts on the first page')
      }

      // Open whichever room is on top and compare its roster with the API.
      const first = page.locator('.admin__room').first()
      const code = (await first.locator('.admin__room-code').innerText()).split('\n')[0].trim()
      const expected = await api.get(`/api/rooms/${code}/participants`, {
        token: api.adminToken,
        expect: 200,
      })
      await first.locator('.admin__room-toggle').click()
      // The roster is fetched on expand, so wait for it rather than for a fixed
      // moment: a slow answer under a loaded suite is not a failure.
      const drawn = await waitForCount(
        page,
        () => first.locator('.admin__room-body tbody tr').count(),
        expected.count,
      )
      assert.equal(drawn, expected.count, `${code} drew ${drawn} of ${expected.count} players`)
      // The history survives closing, which is the whole point of this table.
      if (expected.count > 0) {
        const cell = await first.locator('.admin__room-body tbody tr td').first().innerText()
        assert.ok(cell.trim().length > 0, 'the roster rows carry names')
      }

      // Collapsing puts it away again.
      await first.locator('.admin__room-toggle').click()
      await page.waitForTimeout(300)
      assert.equal(await first.locator('.admin__room-body').count(), 0)
    } finally {
      await context.close()
    }
  })

  test('searches the whole roster, not just the room in play', async () => {
    const everyone = await api.get('/api/players', { token: api.adminToken, expect: 200 })
    const { context, page } = await stage(WALL, { path: '/admin', as: 'operator' })
    try {
      await page.getByRole('button', { name: /arcade data/i }).click()
      await page.getByRole('tab', { name: /^players$/i }).click()
      await page.waitForTimeout(1200)

      // A page of twenty, not the whole roster in one scroll.
      const perPage = 20
      const drawn = await waitForCount(
        page,
        () => page.locator('.admin__table tbody tr').count(),
        Math.min(perPage, everyone.players.length),
      )
      assert.equal(
        drawn,
        Math.min(perPage, everyone.players.length),
        'one page holds twenty players',
      )
      if (everyone.players.length > perPage) {
        const pager = await page.locator('.admin__pager').innerText()
        assert.match(pager, new RegExp(`1–${perPage} of ${everyone.players.length}`))
      }

      // A player who is in no room at all still has to be findable, which is
      // exactly what the current-room scope used to hide.
      const elsewhere = everyone.players.find((player) => !player.room_code)
      if (elsewhere) {
        await page.getByLabel('Search players').fill(elsewhere.nickname)
        await page.waitForTimeout(400)
        const listed = await page.locator('.admin__table tbody tr td:first-child').allInnerTexts()
        assert.ok(
          listed.some((name) => name.trim() === elsewhere.nickname),
          `${elsewhere.nickname} is in no room and was not findable`,
        )
      }

      await page.getByLabel('Search players').fill(HOST)
      await page.waitForTimeout(300)
      const names = await page.locator('.admin__table tbody tr td:first-child').allInnerTexts()
      assert.ok(names.length >= 1, 'the search found the player it was given')
      assert.ok(
        names.every((name) => name.toLowerCase().includes(HOST.toLowerCase())),
        `the search returned a row that does not match: ${names.join(', ')}`,
      )

      await page.getByLabel('Search players').fill('nobody-by-this-name')
      await page.waitForTimeout(300)
      assert.equal(await page.locator('.admin__table tbody tr').count(), 0)
    } finally {
      await context.close()
    }
  })
})

describe('the module setting', () => {
  test('lives on Game Setting, is stored on the server, and the console names it', async () => {
    // The picker used to sit above the console's own "new room" button, and the
    // set used to live in localStorage. It is a stored setting now, one tab
    // away, so three things have to hold: it belongs to the server rather than
    // to one browser, it survives a reload, and the button that builds the next
    // room still says what it will build.
    const original = (await api.get('/api/settings', { token: api.adminToken, expect: 200 })).modules
    const { context, page } = await stage(WALL, { path: '/admin', as: 'operator' })
    try {
      await page.getByRole('button', { name: /arcade console/i }).click()
      await page.waitForTimeout(600)
      assert.equal(await page.locator('.admin__modules').count(), 0, 'the console no longer picks')
      // The head is the room and its length. It used to carry the node count and
      // a summary of the next room's modules, which is noise next to four buttons
      // that drive the show.
      const head = (await page.locator('.admin__current').innerText()).replace(/\s+/g, ' ')
      assert.match(head, /^[\w-]+ · \d+m\d+s$|^[\w-]+ · —$/, `the console head read "${head}"`)

      await page.getByRole('button', { name: /game setting/i }).click()
      await page.waitForTimeout(600)
      assert.equal(await page.locator('.admin__modules').count(), 1, 'the setting is here')

      const battle = page.locator('.admin__module', { hasText: 'AI Cyber Battle' }).locator('input')
      const wasChecked = await battle.isChecked()
      await battle.setChecked(!wasChecked)
      await page.waitForTimeout(700)
      const chosen = (await page.locator('.admin__modules-summary').innerText()).trim()

      // The API, not this browser, is now the record of the choice.
      const stored = await api.get('/api/settings', { token: api.adminToken, expect: 200 })
      assert.equal(
        stored.modules.includes('sabotage'),
        !wasChecked,
        `the server stored ${stored.modules.join(',')}`,
      )

      // A reload rebuilds every component; the choice has to outlive that.
      await page.reload()
      await page.waitForTimeout(1500)
      await page.getByRole('button', { name: /game setting/i }).click()
      await page.waitForTimeout(700)
      assert.equal(
        (await page.locator('.admin__modules-summary').innerText()).trim(),
        chosen,
        'the chosen set was forgotten on reload',
      )

      // And a different browser sees the same value - the point of moving it
      // off this machine.
      const elsewhere = await stage(WALL, { path: '/admin', as: 'operator' })
      try {
        await elsewhere.page.getByRole('button', { name: /game setting/i }).click()
        await elsewhere.page.waitForTimeout(700)
        assert.equal(
          (await elsewhere.page.locator('.admin__modules-summary').innerText()).trim(),
          chosen,
          'another browser was shown a different set',
        )
      } finally {
        await elsewhere.context.close()
      }
    } finally {
      await context.close()
      // Restored through the API, so a failed assertion cannot leave the next
      // test building a different show.
      await api.put('/api/settings', {
        token: api.adminToken,
        body: { modules: original },
        expect: 200,
      })
    }
  })
})
