/**
 * Data Shadow scoring.
 *
 * The player drags over free text, so a selection is a character range, not a
 * list of tidy tokens. That makes scoring an overlap problem:
 *
 *  - a selection is *valid* only if most of it lands inside known leaks;
 *  - a leak is *caught* when valid selections cover at least half of it;
 *  - a selection that is mostly ordinary post is a false alarm.
 *
 * The purity threshold is what stops "select the whole post" from winning.
 * Measured on this content the leaks are only ~20% of the characters, so a
 * blanket selection scores ~0.20 and is rejected, while a tight phrase scores
 * 1.0. The threshold sits at 0.30: above a blanket, reachable by clipping out
 * the risky words.
 */

export interface Span {
  start: number
  end: number
}

export interface LeakSpec {
  id: string
  /** Exact substring of the post. Resolved to offsets at runtime. */
  text: string
  /** Shown after submitting, so a catch teaches why it was a leak. */
  why: string
}

export interface LeakSpan extends LeakSpec, Span {}

export interface Selection extends Span {
  id: string
  text: string
}

export const HIT_POINTS = 10
export const FALSE_ALARM_POINTS = -10
/** Share of a selection that must sit inside leaks for it to count. */
export const PURITY_THRESHOLD = 0.3
/** Share of a leak that must be covered for it to count as caught. */
export const LEAK_COVERAGE_THRESHOLD = 0.5
/** A shorter drag is almost certainly an accidental tap. */
export const MIN_SELECTION_CHARS = 3
/** A selection covering more than this share of the post credits nothing. */
export const BLANKET_RATIO = 0.5

function overlap(a: Span, b: Span): number {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))
}

/** Locate each leak in the post. Anchors must be unique; a miss is a content bug. */
export function resolveLeaks(postText: string, specs: LeakSpec[]): LeakSpan[] {
  const resolved: LeakSpan[] = []
  for (const spec of specs) {
    const start = postText.indexOf(spec.text)
    if (start === -1) {
      // Only a content bug can cause this, and it must not fail silently.
      if (import.meta.env?.DEV) {
        console.error(`[data-shadow] leak anchor not found in the post: ${spec.id}`)
      }
      continue
    }
    resolved.push({ ...spec, start, end: start + spec.text.length })
  }
  return resolved
}

export function purityOf(selection: Span, leaks: LeakSpan[]): number {
  const length = selection.end - selection.start
  if (length <= 0) return 0
  const inside = leaks.reduce((sum, leak) => sum + overlap(selection, leak), 0)
  return inside / length
}

export interface Evaluation {
  score: number
  caught: LeakSpan[]
  missed: LeakSpan[]
  /** Selection ids that counted, so the panel can tick them. */
  counted: Set<string>
  /** Selection ids that were too broad, or contained no leak at all. */
  rejected: Set<string>
}

export function evaluate(
  selections: Selection[],
  leaks: LeakSpan[],
  postLength: number,
): Evaluation {
  const counted = new Set<string>()
  const rejected = new Set<string>()
  const valid: Span[] = []

  for (const selection of selections) {
    const length = selection.end - selection.start
    const blanket = length > postLength * BLANKET_RATIO
    if (blanket || purityOf(selection, leaks) < PURITY_THRESHOLD) {
      rejected.add(selection.id)
      continue
    }
    counted.add(selection.id)
    valid.push(selection)
  }

  const caught: LeakSpan[] = []
  const missed: LeakSpan[] = []

  for (const leak of leaks) {
    // Union of the valid selections clipped to this leak, so two overlapping
    // drags over the same phrase cannot count it twice.
    const parts = valid
      .map((s) => ({ start: Math.max(s.start, leak.start), end: Math.min(s.end, leak.end) }))
      .filter((s) => s.end > s.start)
      .sort((a, b) => a.start - b.start)

    let covered = 0
    let current: Span | null = null
    for (const part of parts) {
      if (current === null) {
        current = { ...part }
      } else if (part.start <= current.end) {
        current.end = Math.max(current.end, part.end)
      } else {
        covered += current.end - current.start
        current = { ...part }
      }
    }
    if (current !== null) covered += current.end - current.start

    const ratio = covered / (leak.end - leak.start)
    if (ratio >= LEAK_COVERAGE_THRESHOLD) caught.push(leak)
    else missed.push(leak)
  }

  const score = caught.length * HIT_POINTS + rejected.size * FALSE_ALARM_POINTS
  return { score, caught, missed, counted, rejected }
}
