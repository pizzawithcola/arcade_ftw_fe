/** How many points a correct answer is worth, before a slot's multiplier. */
export const CORRECT_POINTS = 20

/**
 * Pure scoring so the rule can be tested without rendering the screen.
 *
 * The only winner is an exact match on the letter. A quiz is a quiz: either the
 * answer is right or it is not, there is no confidence dial here. The
 * multiplier comes from the draw slot - the last two questions of the Ultimate
 * round are worth double and triple.
 */
export function questionScore(
  picked: string | undefined,
  correctOption: string,
  multiplier = 1,
): number {
  return picked === correctOption ? CORRECT_POINTS * multiplier : 0
}
