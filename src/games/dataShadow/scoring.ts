import type { Segment } from './content'

/** Points for correctly flagging a leak. */
export const FLAG_POINTS = 10
/** Points lost for flagging something that was fine to post. */
export const FALSE_ALARM_POINTS = -10

export type Verdict = 'hit' | 'false-alarm' | 'missed' | 'clean'

/**
 * Only flagging is scored. Not flagging a safe sentence is neutral, which keeps
 * the same shape as the other rounds: acting earns or costs, doing nothing is
 * worth zero. It also means "flag everything" is not a strategy — the false
 * alarms claw back exactly what the hits earn.
 */
export function verdictFor(segment: Segment, flagged: boolean): Verdict {
  if (flagged && segment.leak) return 'hit'
  if (flagged && !segment.leak) return 'false-alarm'
  if (!flagged && segment.leak) return 'missed'
  return 'clean'
}

export function verdictPoints(verdict: Verdict): number {
  if (verdict === 'hit') return FLAG_POINTS
  if (verdict === 'false-alarm') return FALSE_ALARM_POINTS
  return 0
}

export function scoreOf(segment: Segment, flagged: boolean): number {
  return verdictPoints(verdictFor(segment, flagged))
}
