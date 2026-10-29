/**
 * The 15 seconds in front of each game: what it is, and what to do with it.
 *
 * The backend owns the slot (`type: "brief"` plus a `brief` key in the flow);
 * this file owns the words, because copy changes more often than the rundown
 * and nobody should have to redeploy the engine to fix a sentence.
 *
 * Two rules for the copy, learned from running the show:
 *   1. Lead with the stakes, not the mechanics - "half of this never happened"
 *      earns attention faster than "you will see five statements".
 *   2. Every card names the physical action ("tap", "drag") in one short line,
 *      because people read this while holding the iPad and nothing else.
 */

export interface Brief {
  /** Matches the `brief` key on the flow node. */
  key: string
  /** The game's own name, as the section shows it. */
  title: string
  /** One line of stakes: why this game exists. */
  lead: string
  /** What the player actually does, at most three lines. */
  rules: string[]
}

const BRIEFS: Brief[] = [
  {
    key: 'hallucination',
    title: 'Hallucination',
    lead: 'An AI will sound certain whether it is right or making things up. Half of what you read next never happened.',
    rules: [
      'Two statements, one at a time. Read each one carefully.',
      'Rate how far you trust it, from Very Doubt to Full Trust.',
      'Trusting a fake and doubting a fact cost you the same. Guessing is not free.',
    ],
  },
  {
    key: 'data_shadow',
    title: 'Data Shadow',
    lead: 'An assistant wrote this post, and left personal data in it that should never have left the company.',
    rules: [
      'Read the post and find what leaked: names, numbers, anything that identifies someone.',
      'Drag to select the leaked text.',
      'Every leak you find scores. Flagging innocent text costs you, so read before you drag.',
    ],
  },
  {
    key: 'sabotage',
    title: 'Sabotage',
    lead: 'Four rounds, one target each. Buy the cards that beat the other team in that one column.',
    rules: [
      'Every card scores in Data, People and Infra. The round names one target; only that column decides who wins it.',
      'You get 100 points and up to 4 cards. A dearer card is not a stronger one.',
      'Your team votes - the most-voted cards get bought. Talk to each other.',
      'Four rounds: attack, defend, attack, defend.',
    ],
  },
  {
    key: 'ultimate_quiz',
    title: 'Ultimate Quiz',
    lead: 'Everything you have learned tonight, one last time, against the clock. Bonus points are still on the table.',
    rules: [
      'Fast questions, four answers each.',
      'The quicker you answer, the more it scores.',
      'This is the last chance to take the lead - a good round here can turn the board over.',
    ],
  },
]

/** `undefined` for a brief key the frontend does not know yet, so a new node in
 *  the flow degrades to the plain placeholder instead of blanking the screen. */
export function findBrief(key: string | undefined): Brief | undefined {
  return BRIEFS.find((brief) => brief.key === key)
}

/** The console's jump-board label for a brief node. */
export const BRIEF_LABEL = 'intro'
