/**
 * What opens each game: its name for three seconds, then how it plays for
 * twelve.
 *
 * One file, one node. This used to be two (`titles.ts` for a 5s name card and
 * `briefs.ts` for a 15s rules card), which meant two flow nodes, two types and
 * two console entries for what the audience reads as a single opening. The
 * backend owns the slot (`type: "opening"` plus `title_sec` in the flow); this
 * file owns the words, because copy changes more often than the rundown.
 *
 * Three rules for the copy, learned from running the show:
 *   1. **Three points, never more than four.** Twelve seconds is one glance: if
 *      a point needs a second reading it will not be read at all.
 *   2. Every point names the physical action ("rate", "drag", "tap"), because
 *      people read this while holding the iPad and nothing else.
 *   3. No jargon. "Flagging innocent text costs you" lands; "false positive
 *      penalty" does not.
 *
 * The name card carries the name and nothing else: three seconds is long enough
 * for a title and not long enough for a sentence under it.
 */

export interface GameOpening {
  /** Matches the `game` key on the flow node. */
  key: string
  /** The name on the card, and under the icon on the welcome map. */
  name: string
  /** The mark on the welcome map. Square, transparent, 384px. */
  icon: string
  /** What the player actually does: three points, four at the very most. */
  rules?: string[]
}

const OPENINGS: GameOpening[] = [
  {
    key: 'hallucination',
    name: 'AI Hallucination',
    icon: '/game_icons/hallucination_icon.PNG',
    rules: [
      'Three AI answers. Some of them are completely made up.',
      'Drag the trust scale: left to doubt it, right to believe it.',
      'Trusting a fake and doubting a fact cost you the same.',
    ],
  },
  {
    key: 'data_shadow',
    name: 'Data Shadow',
    icon: '/game_icons/data_icon.PNG',
    rules: [
      'One post from the AI assistant, with private details left in it.',
      'Drag over anything that identifies a person.',
      'Real leaks score. Flagging innocent text costs you.',
    ],
  },
  {
    // No rules on purpose: Sabotage draws its teams and then shows its own rules
    // card inside the node (see `SabotageGame`'s `Rules`), so the flow has no
    // opening in front of it. Name and icon still feed the welcome map.
    key: 'sabotage',
    name: 'AI Sabotage',
    icon: '/game_icons/sabotage_icon.PNG',
  },
  {
    key: 'ultimate_quiz',
    name: 'Ultimate Showdown',
    icon: '/game_icons/ultimate_icon.PNG',
    rules: [
      'Five questions from everything tonight. Four answers each.',
      'Only a correct answer scores - speed does not matter.',
      'Question four is worth double. Question five is worth triple.',
    ],
  },
]

/** The games in the order the show runs them. The welcome screen is built from
 *  this list, so its map of the night can never disagree with the cards that
 *  follow it. */
export const GAME_ORDER: GameOpening[] = OPENINGS

/** How many games the show runs, for the "Round 2 of 4" line. */
export const GAME_COUNT = OPENINGS.length

/** How long the name holds before the rules take over, when the flow does not
 *  say. The backend sends `title_sec`, so this is only the fallback. */
export const DEFAULT_TITLE_SEC = 3

/** Which half of an opening is on screen. Callers use it for their own chrome. */
export function openingPhase(titleSec: number | undefined, elapsedMs: number): 'title' | 'rules' {
  return elapsedMs < (titleSec ?? DEFAULT_TITLE_SEC) * 1000 ? 'title' : 'rules'
}

/** `undefined` for a key the frontend does not know yet, so a new node degrades
 *  to the plain placeholder instead of blanking the screen. */
export function findOpening(key: string | undefined): GameOpening | undefined {
  return OPENINGS.find((entry) => entry.key === key)
}

/** Which game this is, 1-based, or 0 for a key we do not know. */
export function gameNumber(key: string | undefined, section?: string): number {
  const at = OPENINGS.findIndex((entry) => entry.key === (key ?? section))
  return at === -1 ? 0 : at + 1
}

/** The console's jump-board label for an opening node. */
export const OPENING_LABEL = 'intro'
