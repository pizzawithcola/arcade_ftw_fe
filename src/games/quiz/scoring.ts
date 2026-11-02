/**
 * What one correct answer is worth.
 *
 * Half of a question's value is for being right at all; the other half is for
 * being quick. On a twenty-second question that means a hundred points for an
 * answer in the first second, fifty for one on the buzzer, and a straight line
 * between the two. A wrong answer is worth nothing - there is no confidence dial
 * here, so there is nothing to lose either.
 *
 * The multiplier comes from the draw slot: the last two questions of the round
 * are worth double and triple, so the speed half scales with them.
 */
import { BASE_POINTS } from './draw'

/** The share of a question that is paid for being right, whatever the clock says. */
export const CORRECT_SHARE = 0.5

/**
 * The share of a question that is paid for speed: 1 at the first second, 0 at
 * the last. Linear on purpose - a curve would make the last few seconds feel
 * worth less than they look on the countdown.
 */
export function speedShare(elapsedMs: number, limitMs: number): number {
  if (limitMs <= 0) return 1
  const used = Math.min(Math.max(elapsedMs, 0), limitMs)
  return 1 - used / limitMs
}

/** Points for one answer, at the moment it was given. */
export function questionScore(
  picked: string | undefined,
  correctOption: string,
  multiplier = 1,
  elapsedMs = 0,
  limitMs = 0,
): number {
  if (picked !== correctOption) return 0
  const base = BASE_POINTS * multiplier
  return Math.round(base * (CORRECT_SHARE + (1 - CORRECT_SHARE) * speedShare(elapsedMs, limitMs)))
}
