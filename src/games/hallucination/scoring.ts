/** Whether a sentence actually holds up, which is what the player is judging. */
export type Truth = 'trust' | 'doubt'

export interface TrustLevel {
  key: string
  label: string
  /**
   * Points when the sentence really is trustworthy. Negative on the doubt side,
   * so the sign already reads as "which way did you lean".
   */
  points: number
}

/**
 * A question is worth 200 either way: the ladder is symmetric, so the extreme at
 * each end carries the same weight. It used to be -10 .. +20, which made a
 * fabricated sentence worth half an honest one and capped the round at 40
 * instead of three times 200.
 *
 * Five fixed levels rather than a slider.
 *
 * A slider turns "how much do you trust this" into a number nobody can defend,
 * and the audience cannot read a hundred individual sliders off a big screen.
 * Five buttons are the same decision, callable out loud.
 */
export const TRUST_LEVELS: TrustLevel[] = [
  { key: 'very_doubt', label: 'Very Doubt', points: -200 },
  { key: 'doubt', label: 'Doubt', points: -100 },
  { key: 'not_sure', label: 'Not Sure', points: 0 },
  { key: 'partial_trust', label: 'Partial Trust', points: 100 },
  { key: 'full_trust', label: 'Full Trust', points: 200 },
]

export function levelByKey(key: string): TrustLevel | undefined {
  return TRUST_LEVELS.find((level) => level.key === key)
}

/**
 * Symmetric scoring: a level is worth the same whether you are right or wrong,
 * and only the sign depends on whether you read the sentence correctly.
 *
 * The listed points assume a trustworthy sentence, so a hallucination flips
 * them and doubting becomes the thing that pays. Hedging at "Not Sure" is the
 * one move that can never lose - which is exactly what makes it a real choice.
 */
export function scoreFor(level: TrustLevel, truth: Truth): number {
  return truth === 'trust' ? level.points : -level.points
}

/** Whether the level's lean agrees with the sentence, for the reveal copy. */
export function isCorrect(level: TrustLevel, truth: Truth): boolean {
  const leanedTrust = level.points > 0
  const leanedDoubt = level.points < 0
  // Not Sure has no lean to be right or wrong about.
  if (!leanedTrust && !leanedDoubt) return true
  return (truth === 'trust') === leanedTrust
}
