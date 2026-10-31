/**
 * What opens each game: its name for the first three seconds, then what to do
 * with it for the next twelve.
 *
 * One file, one node. This used to be two (`titles.ts` for a 5s name card and
 * `briefs.ts` for a 15s rules card), which meant two flow nodes, two types and
 * two consoles entries for what the audience reads as a single opening. The
 * backend owns the slot (`type: "opening"` plus `title_sec` in the flow); this
 * file owns the words, because copy changes more often than the rundown.
 *
 * Three rules for the copy, learned from running the show:
 *   1. Lead with the stakes, not the mechanics - "half of this never happened"
 *      earns attention faster than "you will see three statements".
 *   2. Every point names the physical action ("tap", "drag") in one short line,
 *      because people read this while holding the iPad and nothing else.
 *   3. The name on the card is the stage name, not the key: "AI Sabotage" and
 *      "Ultimate Showdown" are what the audience is meant to remember.
 */

/** How long the name holds before the rules take over, when the flow does not
 *  say. The backend sends `title_sec`, so this is only the fallback. */
export const DEFAULT_TITLE_SEC = 3

/** Which half of an opening is on screen. Callers use it for their own chrome. */
export function openingPhase(titleSec: number | undefined, elapsedMs: number): 'title' | 'rules' {
  return elapsedMs < (titleSec ?? DEFAULT_TITLE_SEC) * 1000 ? 'title' : 'rules'
}

export interface GameOpening {
  /** Matches the `game` key on the flow node. */
  key: string
  /** The name on the card. */
  name: string
  /** Three to five words for the welcome map, where four games share the screen
   *  and a full sentence per game would not be read. */
  hook: string
  /** One line under the name, where the card has the screen to itself. */
  note: string
  /** One line of stakes: why this game exists. Absent for a game whose rules
   *  card is drawn inside the game itself (Sabotage). */
  lead?: string
  /** What the player actually does, at most three points. */
  rules?: string[]
}

const OPENINGS: GameOpening[] = [
  {
    key: 'hallucination',
    name: 'AI Hallucination',
    hook: 'Spot the confident lie',
    note: 'An AI answers every question with total confidence. Your job is to work out which answers are real.',
    lead: 'An AI will sound certain whether it is right or making things up. Half of what you read next never happened.',
    rules: [
      'Three statements, one at a time. Read each one carefully.',
      'Rate how far you trust it, from Very Doubt to Full Trust.',
      'Trusting a fake and doubting a fact cost you the same. Guessing is not free.',
    ],
  },
  {
    key: 'data_shadow',
    name: 'Data Shadow',
    hook: 'Find what leaked',
    note: 'One post went out with private data still inside it. Find what should never have left the building.',
    lead: 'An assistant wrote this post, and left personal data in it that should never have left the company.',
    rules: [
      'Read the post and find what leaked: names, numbers, anything that identifies someone.',
      'Drag to select the leaked text.',
      'Every leak you find scores. Flagging innocent text costs you, so read before you drag.',
    ],
  },
  {
    // No lead or rules on purpose: Sabotage draws its teams and then shows its
    // own rules card inside the node, so the flow has no opening in front of it.
    // The name, hook and note still feed the welcome map.
    key: 'sabotage',
    name: 'AI Sabotage',
    hook: 'Break in, or hold out',
    note: 'Two teams, four rounds, one target each. Break through it - or hold everyone else out.',
  },
  {
    key: 'ultimate_quiz',
    name: 'Ultimate Showdown',
    hook: 'Hong Kong, against the clock',
    note: 'Everything tonight, one last time, against the clock. Hong Kong and AI.',
    lead: 'Everything you have learned tonight, one last time. Five questions, and the last two are worth double and triple.',
    rules: [
      'Five fast questions, four answers each. They start the moment this card ends.',
      'Only a correct answer scores - speed changes nothing, so read before you tap.',
      'Question five is worth triple. A good round here can turn the board over.',
    ],
  },
]

/** The games in the order the show runs them. The welcome screen is built from
 *  this list, so its map of the night can never disagree with the cards that
 *  follow it. */
export const GAME_ORDER: GameOpening[] = OPENINGS

/** How many games the show runs, for the "Round 2 of 4" line. */
export const GAME_COUNT = OPENINGS.length

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
