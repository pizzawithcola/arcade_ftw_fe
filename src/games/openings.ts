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
 * The wording below is the client's, supplied verbatim - including its
 * punctuation and its remaining slip ("choices loses points"). Do not
 * copy-edit it: only the person whose show this is may change how it reads.
 * Counts are the exception: they have to follow the round they describe.
 * Everything else in this file (structure, timings, the welcome map) is fair
 * game.
 *
 * The name card carries the name and nothing else: three seconds is long enough
 * for a title and not long enough for a sentence under it.
 */

/** One rule line: the words, plus which of them carry a colour. The copy is the
 *  client's, so a colour never rewrites it - it only paints a word that is
 *  already there. */
export interface RuleLine {
  text: string
  /** Word to paint trust-green, exactly as it appears in `text`. */
  trust?: string
  /** Word to paint doubt-yellow, exactly as it appears in `text`. */
  doubt?: string
}

export interface GameOpening {
  /** Matches the `game` key on the flow node. */
  key: string
  /** The module this game belongs to, as the server names it. The two differ:
   *  the flow calls Data Shadow `data_shadow`, the module is `data`; the quiz is
   *  `ultimate_quiz`, the module `ultimate`. Declared here so a room that hides
   *  one is filtered by the server's vocabulary, not by a second guess. */
  module: string
  /** The name on the card, and under the icon on the welcome map. */
  name: string
  /** The mark on the welcome map. Square, transparent, 384px. */
  icon: string
  /** What the player actually does: three points, four at the very most. */
  rules?: (string | RuleLine)[]
}

const OPENINGS: GameOpening[] = [
  {
    key: 'hallucination',
    module: 'hallucination',
    name: 'AI Hallucination',
    icon: '/game_icons/hallucination_icon.PNG',
    rules: [
      'Review the AI response',
      // The words still carry their colours; the brackets that named the colour
      // have been removed on request.
      {
        text: 'Drag right if you trust, and drag left if you have doubts',
        trust: 'trust',
        doubt: 'doubts',
      },
      'Your confidence affects your score',
    ],
  },
  {
    key: 'data_shadow',
    module: 'data',
    name: 'Data Shadow',
    icon: '/game_icons/data_icon.PNG',
    rules: [
      'AI has generated content for your social media',
      'Tap the paragraphs that should never have been posted',
      'Correct answers get points, incorrect choices loses points',
    ],
  },
  {
    // No rules on purpose: Sabotage draws its teams and then shows its own rules
    // card inside the node (see `SabotageGame`'s `Rules`), so the flow has no
    // opening in front of it. Name and icon still feed the welcome map.
    key: 'sabotage',
    module: 'sabotage',
    name: 'AI Cyber Battle',
    icon: '/game_icons/sabotage_icon.PNG',
  },
  {
    key: 'ultimate_quiz',
    module: 'ultimate',
    name: 'Ultimate Showdown',
    icon: '/game_icons/ultimate_icon.PNG',
    rules: [
      'Three chances to test your knowledge',
      'Fast and correct answers gain more points',
      'Bonus rounds can shake up the rankings on the leaderboard',
    ],
  },
]

/** The games in the order the show runs them. The welcome screen is built from
 *  this list, so its map of the night can never disagree with the cards that
 *  follow it. */
export const GAME_ORDER: GameOpening[] = OPENINGS

/** How many games the show can run. What a room actually runs is
 *  `activeGames(modules).length`. */
export const GAME_COUNT = OPENINGS.length

/**
 * The games a room actually runs.
 *
 * A room is built from a set of modules (`flow.MODULES` on the server), so a
 * show can run three games instead of four. Everything the audience reads about
 * the count - the welcome map, `game 2 of 3`, `Round 1 of 3` - counts from this
 * list rather than from `GAME_ORDER`, or the screens would promise a game that
 * is not in the rundown.
 *
 * An empty list means "the server has not said yet": the first state message
 * arrives before the welcome card, but the store starts empty, so falling back
 * to all four keeps the first paint from claiming a one-game show.
 */
export function activeGames(modules: string[]): GameOpening[] {
  if (modules.length === 0) return GAME_ORDER
  return GAME_ORDER.filter((game) => modules.includes(game.module))
}

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

/** Which game this is, 1-based, or 0 for a game the room is not running. */
export function gameNumber(
  key: string | undefined,
  section: string | undefined,
  modules: string[] = [],
): number {
  const at = activeGames(modules).findIndex((entry) => entry.key === (key ?? section))
  return at === -1 ? 0 : at + 1
}

/** The console's jump-board label for an opening node. */
export const OPENING_LABEL = 'intro'
