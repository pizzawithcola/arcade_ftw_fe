/** How many points a correct answer is worth. Wrong and timed-out score zero. */
export const CORRECT_POINTS = 20

/**
 * Pure scoring so the rule can be tested without rendering the screen.
 *
 * The only winner is an exact match on the letter. A quiz is a quiz: either the
 * answer is right or it is not, there is no confidence dial here.
 */
export function questionScore(picked: string | undefined, correctOption: string): number {
  return picked === correctOption ? CORRECT_POINTS : 0
}
