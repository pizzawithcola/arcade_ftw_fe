/**
 * The 5 seconds in front of each game: its name, and one line about it.
 *
 * The backend owns the slot (`type: "title"` plus a `title` key in the flow);
 * this file owns the words, for the same reason `briefs.ts` does - copy changes
 * more often than the rundown.
 *
 * The name on the card is the game's stage name, not the key: "AI Sabotage" and
 * "Ultimate Showdown" are what the audience is meant to remember. The one line
 * under it says what the game asks of them, not how to play - the rules card
 * that follows does that.
 */

export interface GameTitle {
  /** Matches the `title` key on the flow node. */
  key: string
  /** The name on the card. */
  name: string
  /** Three to five words for the welcome map, where four games share the screen
   *  and a full sentence per game would not be read. */
  hook: string
  /** One line on the game's own title card, where it has the screen to itself. */
  note: string
}

const TITLES: GameTitle[] = [
  {
    key: 'hallucination',
    name: 'AI Hallucination',
    hook: 'Spot the confident lie',
    note: 'An AI answers every question with total confidence. Your job is to work out which answers are real.',
  },
  {
    key: 'data_shadow',
    name: 'Data Shadow',
    hook: 'Find what leaked',
    note: 'One post went out with private data still inside it. Find what should never have left the building.',
  },
  {
    key: 'sabotage',
    name: 'AI Sabotage',
    hook: 'Break in, or hold out',
    note: 'Two teams, four rounds, one target each. Break through it — or hold everyone else out.',
  },
  {
    key: 'ultimate',
    name: 'Ultimate Showdown',
    hook: 'Hong Kong, against the clock',
    note: 'Everything tonight, one last time, against the clock. Hong Kong and AI.',
  },
]

/** The games in the order the show runs them. The welcome screen is built from
 *  this list, so its map of the night can never disagree with the cards that
 *  follow it. */
export const GAME_ORDER: GameTitle[] = TITLES

/** `undefined` for a key the frontend does not know yet, so a new node degrades
 *  to the plain placeholder instead of blanking the screen. */
export function findTitle(key: string | undefined): GameTitle | undefined {
  return TITLES.find((entry) => entry.key === key)
}

/** How many games the show runs, for the "Round 2 of 4" line. */
export const GAME_COUNT = TITLES.length

/** Which game this is, 1-based, or 0 for a key we do not know. */
export function gameNumber(key: string | undefined, section?: string): number {
  const at = TITLES.findIndex((entry) => entry.key === (key ?? section))
  return at === -1 ? 0 : at + 1
}
