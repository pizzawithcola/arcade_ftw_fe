/**
 * How the Ultimate round picks its five questions.
 *
 * The draw is random per room, not per device: the wall and every iPad compute
 * the same five questions from the same seed (`room:node`), so a player can never
 * be looking at a different question from the one on the screen behind them.
 * That is why this is a seeded generator rather than `Math.random()` - two
 * devices calling `Math.random()` draw two different rounds.
 *
 * The seed is the room code and the node index, so re-running the node in the
 * same room replays the same five questions: a rehearsal that jumps back and
 * forth does not reshuffle under the operator, and two different rooms still get
 * different questions.
 *
 * The shape of the round is fixed, only the questions vary:
 *
 *   slot 1  Data / phishing     1 of 5   x1
 *   slot 2  Hallucination       1 of 5   x1
 *   slot 3  CEO impersonation   1 of 3   x1
 *   slot 4  Assistant / sources 1 of 4   x2   bonus
 *   slot 5  Hong Kong           1 of 5   x3   bonus
 *
 * Slot 1 merges Data Shadow with phishing email: both are about information
 * leaving the building on someone else's instruction, and the pool is the five
 * questions those two categories hold between them.
 *
 * The two bonuses are last on purpose: the round gets harder and worth more as
 * it goes, so a team that is behind still has something to play for.
 */

import { QUESTION_BANK, type BankQuestion, type QuizCategory } from './bank'

export interface DrawSlot {
  /** Short key, used for React keys and the console table. */
  key: string
  /** What the slot is, written for the audience. */
  label: string
  /** Which bank categories this slot may draw from. */
  categories: QuizCategory[]
  /** Points multiplier. 1 for the three theme questions, 2 and 3 for the bonuses. */
  multiplier: number
}

/** Base points for a correct answer, before the slot's multiplier. */
export const BASE_POINTS = 20

export const ULTIMATE_SLOTS: DrawSlot[] = [
  {
    key: 'leak',
    label: 'Data and phishing',
    categories: ['data-shadow', 'phishing-email'],
    multiplier: 1,
  },
  { key: 'hal', label: 'Hallucination', categories: ['hallucination'], multiplier: 1 },
  { key: 'ceo', label: 'CEO impersonation', categories: ['ceo-impersonation'], multiplier: 1 },
  {
    key: 'agent',
    label: 'Assistant and sources',
    categories: ['ai-assistant', 'knowledge-base'],
    multiplier: 2,
  },
  { key: 'hk', label: 'Hong Kong', categories: ['hk'], multiplier: 3 },
]

/**
 * FNV-1a, then turned over a few times.
 *
 * A string hash is enough here: the seed only has to differ between rooms, and
 * two rooms that collide would simply share one draw. Nothing is protected by
 * it, so it does not need to be a cryptographic digest.
 */
function seedFrom(text: string): number {
  let hash = 0x811c9dc5
  for (let at = 0; at < text.length; at += 1) {
    hash ^= text.charCodeAt(at)
    hash = Math.imul(hash, 0x01000193)
  }
  // A zero state would lock mulberry32 onto one value, so force it non-zero.
  return (hash >>> 0) || 0x9e3779b9
}

/** mulberry32: small, fast, and good enough to shuffle five short lists. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One question per slot, drawn without reusing a question the round already
 *  asked. The pools do not overlap today, but a question that moved category
 *  later must not be able to appear twice in one round. */
export function drawQuestions(seed: string): BankQuestion[] {
  const random = mulberry32(seedFrom(seed))
  const used = new Set<string>()
  const drawn: BankQuestion[] = []

  for (const slot of ULTIMATE_SLOTS) {
    const pool = QUESTION_BANK.filter(
      (question) => slot.categories.includes(question.category) && !used.has(question.id),
    )
    if (pool.length === 0) continue
    const picked = pool[Math.floor(random() * pool.length)] ?? pool[0]
    used.add(picked.id)
    drawn.push(picked)
  }
  return drawn
}

/** The slot a drawn question belongs to, in draw order. `drawQuestions` and this
 *  walk the slots in the same order, so index `at` of one matches index `at` of
 *  the other. */
export function slotAt(index: number): DrawSlot {
  return ULTIMATE_SLOTS[Math.min(index, ULTIMATE_SLOTS.length - 1)]
}

/** Points for a correct answer in that slot. */
export function pointsFor(index: number): number {
  return BASE_POINTS * slotAt(index).multiplier
}

/** What a perfect round is worth, derived so adding a slot needs no other edit. */
export function perfectScore(): number {
  return ULTIMATE_SLOTS.reduce((sum, slot) => sum + BASE_POINTS * slot.multiplier, 0)
}
