/**
 * How much a player trusts one answer, and what that is worth.
 *
 * Trust is a number from -200 (certain it is made up) through 0 (no idea) to
 * +200 (certain it is true), moved in steps of ten. The sign says which way you
 * leaned; the size says how much you are putting on it, and the size is the only
 * thing the score reads:
 *
 *   correct lean  ->  +|trust|
 *   wrong lean    ->  -|trust| / 2
 *   no lean (0)   ->   0, either way
 *
 * Losing pays half of winning, so a full push is +200 when you are right and
 * -100 when you are not. That is deliberately lopsided: the round is teaching
 * people to commit to a reading, and a symmetric penalty makes the safe move
 * (never pushing past 100) the rational one. The ceiling is still 3 x 200 = 600;
 * the floor is -300.
 */

export type Truth = 'trust' | 'doubt'

/** The far end of the slider: the most one question can pay. */
export const MAX_TRUST = 200

/** One notch of the slider, and the unit the readout counts in. */
export const TRUST_STEP = 10

export type Lean = 'doubt' | 'unsure' | 'trust'

export function leanOf(trust: number): Lean {
  if (trust === 0) return 'unsure'
  return trust > 0 ? 'trust' : 'doubt'
}

/** What a wrong lean costs, as a share of what the same lean would have won. */
export const LOSS_SHARE = 0.5

/**
 * Points for one answer. The magnitude is what you win or lose; the direction
 * only decides which of those happens.
 */
export function scoreFor(trust: number, truth: Truth): number {
  const directed = truth === 'trust' ? trust : -trust
  // `|| 0` turns a leaning-nothing -0 into 0, so the readout never prints "-0".
  return directed >= 0 ? directed || 0 : Math.round(directed * LOSS_SHARE)
}

/** Whether the lean agreed with the sentence, for the reveal copy. */
export function isCorrect(trust: number, truth: Truth): boolean {
  const lean = leanOf(trust)
  // Not sure has no lean to be right or wrong about.
  if (lean === 'unsure') return true
  return (truth === 'trust') === (lean === 'trust')
}

/** What a correct answer at this setting pays, for the number under the slider. */
export function gainIfCorrect(trust: number): number {
  return Math.abs(trust)
}

/** What the same setting costs when it is wrong - half, per LOSS_SHARE. */
export function lossIfWrong(trust: number): number {
  return Math.round(Math.abs(trust) * LOSS_SHARE)
}
