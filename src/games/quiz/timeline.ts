/**
 * The Ultimate round as a line of segments, not a list of questions.
 *
 * A bonus question opens with a three second card, so the round is no longer
 * five equal cycles: it is five cycles with two cards pushed between them. Every
 * screen that has to know "which question is this" - the iPad's own countdown
 * and the engine's `question` payload - walks this same shape, because the two
 * lengths once drifted apart and the wall said question four while the iPads
 * were still on three.
 *
 * The numbers come from the flow node (`questions`, `seconds_each`,
 * `bonus_intro_sec`, `bonus_questions`), so the schedule is data. The engine
 * reads those same fields; nothing here is a second opinion.
 */

export interface QuizSegment {
  /** A card announcing the bonus, or a question with its verdict. */
  kind: 'bonus' | 'question'
  /** The question this segment belongs to, or the one a card introduces. */
  index: number
  ms: number
}

export interface QuizSchedule {
  count: number
  /** One question: answer time plus its verdict. */
  secondsEachMs: number
  /** How long a bonus card holds. Zero turns the cards off. */
  bonusIntroMs: number
  /** 1-based question numbers that pay more than ×1. */
  bonusQuestions: number[]
}

export function quizTimeline(schedule: QuizSchedule): QuizSegment[] {
  const bonuses = new Set(schedule.bonusQuestions)
  const segments: QuizSegment[] = []
  for (let index = 0; index < schedule.count; index += 1) {
    if (schedule.bonusIntroMs > 0 && bonuses.has(index + 1)) {
      segments.push({ kind: 'bonus', index, ms: schedule.bonusIntroMs })
    }
    segments.push({ kind: 'question', index, ms: schedule.secondsEachMs })
  }
  return segments
}

/** How long the whole round runs, cards included. */
export function timelineLength(segments: QuizSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.ms, 0)
}

export interface Sitting {
  segment: QuizSegment
  /** Milliseconds into this segment. */
  inMs: number
  /** Where the segment begins, for progress across the round. */
  startMs: number
}

/** Where in the round an elapsed time lands. Gone past the end, it stays on the
 *  last question with its clock spent. */
export function sittingAt(segments: QuizSegment[], elapsedMs: number): Sitting | null {
  const last = segments[segments.length - 1]
  if (!last) return null
  let start = 0
  for (const segment of segments) {
    if (elapsedMs < start + segment.ms) {
      return { segment, inMs: Math.max(0, elapsedMs - start), startMs: start }
    }
    start += segment.ms
  }
  return { segment: last, inMs: last.ms, startMs: start - last.ms }
}
