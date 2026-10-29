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
 * Measured on this content the leaks are only ~22% of the characters, so a
 * blanket selection scores ~0.22 and is rejected, while a tight phrase scores
 * 1.0. The threshold sits at 0.30: above a blanket, reachable by clipping out
 * the risky words.
 *
 * Leaks are not equal: `weight` carries severity, so flagging an unpublished
 * regulatory approval is worth more than flagging a market count. Decoys are
 * worth nothing to catch and cost points to flag, which is what makes "select
 * every number" a losing strategy rather than the best one.
 */

export interface Span {
  start: number
  end: number
}

export interface LeakSpec {
  id: string
  /** Exact substring of the post. Resolved to offsets at runtime. */
  text: string
  /**
   * Further anchors for the same mistake. Either one catches the leak, and
   * catching both does not pay twice - they are one error seen from two sides.
   */
  alt?: string[]
  /** Severity: 20 for legal/regulatory exposure, 10 for commercial or personal. */
  weight: number
  /** Shown after submitting, so a catch teaches why it was a leak. */
  why: string
}

export interface LeakSpan extends Omit<LeakSpec, 'alt'>, Span {}

/**
 * A picture in the post.
 *
 * Screenshots leak more than sentences do in real feeds - an internal dashboard
 * or a war-room whiteboard gives away systems, volumes and names in one frame.
 * `weight` is signed: a leak pays, a decoy costs. That keeps the whole value
 * table in the content file instead of spread across constants.
 */
export interface ImageSpec {
  id: string
  /** Short caption, the way a post would label an attachment. */
  label: string
  /** Path under public/. */
  src: string
  /** What the picture shows, for the alt text and the reveal. */
  alt: string
  weight: number
  /** Shown after submitting: who benefits, or why it was safe. */
  why: string
}

export interface Selection extends Span {
  id: string
  text: string
}

export const FALSE_ALARM_POINTS = -10
/**
 * The longest drag still treated as "one thing the player pointed at".
 *
 * Purity alone punished honest play: `35.65%` is six characters inside a sixty
 * character sentence, so selecting that whole sentence scored 0.10 and was
 * rejected as a false alarm. A tablet drag cannot land on six characters, so a
 * selection that fully contains an anchor and stays under a sentence's length
 * is accepted on intent, while a paragraph or the whole post still is not.
 */
export const MAX_SELECTION_CHARS = 140
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

/**
 * Locate each anchor in the post.
 *
 * A leak may have several anchors; each becomes its own span, all carrying the
 * same id. Anchors must be unique in the text, because a duplicate would make
 * "caught" ambiguous - a miss is a content bug, not a player's problem.
 */
export function resolveLeaks(postText: string, specs: LeakSpec[]): LeakSpan[] {
  const resolved: LeakSpan[] = []
  for (const spec of specs) {
    const { alt, ...rest } = spec
    for (const anchor of [spec.text, ...(alt ?? [])]) {
      const start = postText.indexOf(anchor)
      if (start === -1 || postText.indexOf(anchor, start + 1) !== -1) {
        // Only a content bug can cause this, and it must not fail silently.
        if (import.meta.env?.DEV) {
          console.error(
            `[data-shadow] anchor must appear exactly once: ${spec.id} / ${anchor}`,
          )
        }
        continue
      }
      resolved.push({ ...rest, start, end: start + anchor.length })
    }
  }
  return resolved
}

/** The most a perfect report can score - every leak, no false alarms. */
/** The most a perfect report can score - every leak, no false alarms. */
/** How many things the player is looking for: every leak, plus every picture
 *  that is worth catching. Decoys pay nothing, so they are not targets. */
export function targetCount(specs: LeakSpec[], images: ImageSpec[] = []): number {
  return specs.length + images.filter((image) => image.weight > 0).length
}

export function maxScore(specs: LeakSpec[], images: ImageSpec[] = []): number {
  const text = specs.reduce((sum, spec) => sum + spec.weight, 0)
  const pictures = images.filter((image) => image.weight > 0)
  return text + pictures.reduce((sum, image) => sum + image.weight, 0)
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
  /** Images flagged correctly, in the order they appear in the post. */
  caughtImages: ImageSpec[]
  /** Leaking images the player left alone. */
  missedImages: ImageSpec[]
  /** Safe images the player flagged: decoys. */
  rejectedImages: ImageSpec[]
}

export function evaluate(
  selections: Selection[],
  leaks: LeakSpan[],
  postLength: number,
  images: ImageSpec[] = [],
  imageFlags: string[] = [],
): Evaluation {
  const counted = new Set<string>()
  const rejected = new Set<string>()
  const valid: Span[] = []

  for (const selection of selections) {
    const length = selection.end - selection.start
    const blanket = length > postLength * BLANKET_RATIO
    if (blanket) {
      rejected.add(selection.id)
      continue
    }
    // Precision, or honest intent: a short drag that holds a whole anchor is
    // what a player pointing at one bad phrase actually produces.
    const precise = purityOf(selection, leaks) >= PURITY_THRESHOLD
    const pointed = length <= MAX_SELECTION_CHARS && containsAnchor(selection, leaks)
    if (!precise && !pointed) {
      rejected.add(selection.id)
      continue
    }
    counted.add(selection.id)
    valid.push(selection)
  }

  // Anchors are grouped by id, because a leak can be named in more than one
  // place and the player only has to find one of them.
  const byId = new Map<string, LeakSpan[]>()
  for (const leak of leaks) {
    const group = byId.get(leak.id)
    if (group) group.push(leak)
    else byId.set(leak.id, [leak])
  }

  const caught: LeakSpan[] = []
  const missed: LeakSpan[] = []
  let score = 0

  for (const group of byId.values()) {
    const found = group.find((leak) => coveredRatio(leak, valid) >= LEAK_COVERAGE_THRESHOLD)
    if (found) {
      caught.push(found)
      score += found.weight
    } else {
      missed.push(group[0])
    }
  }

  score += rejected.size * FALSE_ALARM_POINTS

  // Pictures are flagged, not dragged, so they carry their own signed value:
  // a leak pays its weight, a decoy costs its own.
  const flagged = new Set(imageFlags)
  const caughtImages: ImageSpec[] = []
  const missedImages: ImageSpec[] = []
  const rejectedImages: ImageSpec[] = []
  for (const image of images) {
    if (flagged.has(image.id)) {
      score += image.weight
      if (image.weight > 0) caughtImages.push(image)
      else rejectedImages.push(image)
    } else if (image.weight > 0) {
      missedImages.push(image)
    }
  }

  return {
    score,
    caught,
    missed,
    counted,
    rejected,
    caughtImages,
    missedImages,
    rejectedImages,
  }
}

/** Does this drag hold one complete anchor? */
function containsAnchor(selection: Span, leaks: LeakSpan[]): boolean {
  return leaks.some((leak) => leak.start >= selection.start && leak.end <= selection.end)
}

/**
 * How much of one anchor the valid selections cover.
 *
 * The union is taken over the clipped parts, so two overlapping drags over the
 * same phrase cannot count it twice.
 */
function coveredRatio(leak: LeakSpan, valid: Span[]): number {
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

  return covered / (leak.end - leak.start)
}
