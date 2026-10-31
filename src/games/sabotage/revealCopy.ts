/**
 * What each side is told after a Sabotage round, one line per column.
 *
 * The engine only knows three facts about a column - the attacker was ahead, the
 * two were level, or the defender was ahead - but two sides read them, so each
 * fact has two voices. That is twelve sentences a round, forty-eight across the
 * match:
 *
 *   attacker ahead   ->  they broke through     /  the defender lost it
 *   level or behind  ->  they did not break it  /  the defender held it
 *
 * So a player only ever sees three sentences: their own side's reading of the
 * three columns. Twelve is the size of the table, not the size of the screen.
 *
 * The reveal is five seconds and three lines. Nothing here is clever:
 *
 *   1. Plain words only. No metaphor, no "filter at the door", no "filter leaked
 *      the mail". If a sentence needs a second reading it has already failed.
 *   2. The same shape twice: "You successfully ..." when the reader's side took
 *      the column, "You couldn't ..." when it did not. The other dimension -
 *      which column, which round - is carried by the numbers beside it.
 *   3. The job, not the mechanic: data, employees, filter. Read at a glance by
 *      someone who has never played, which is most of the room.
 *
 * A round nobody bid on scores as a defence, so its sentences are just the
 * failure and hold lines - there is no special "no bids" copy any more.
 */

export type SabotageVoice = 'broke' | 'failed' | 'held' | 'lost'

/** Indexed by round (1-based), then by domain, then by voice. */
const COPY: Record<number, Record<string, Record<SabotageVoice, string>>> = {
  1: {
    // Phishing email - one click is the whole game.
    data: {
      broke: 'You successfully got the data from phishing emails',
      failed: "You couldn't get any data from phishing emails",
      held: 'You successfully kept your data out of the phishing emails',
      lost: "You couldn't keep your data out of the phishing emails",
    },
    people: {
      broke: 'You successfully got an employee to click',
      failed: "You couldn't breach in from their employees",
      held: 'You successfully stopped every employee clicking',
      lost: "You couldn't stop an employee clicking",
    },
    infra: {
      broke: 'You successfully got your phishing email past their filter',
      failed: 'Their email filter blocked your phishing email',
      held: 'Your email filter blocked the phishing email',
      lost: 'The phishing email got past your email filter',
    },
  },
  2: {
    // CEO impersonation - the only control is a callback.
    data: {
      broke: 'You successfully got the money sent to your account',
      failed: "You couldn't get any money sent",
      held: 'You successfully kept the money in the company',
      lost: "You couldn't stop the money leaving the company",
    },
    people: {
      broke: 'You successfully got an employee to approve the payment',
      failed: "You couldn't get any employee to approve the payment",
      held: 'You successfully stopped every employee approving it',
      lost: "You couldn't stop an employee approving the payment",
    },
    infra: {
      broke: 'You successfully got past their payment checks',
      failed: 'Their payment checks blocked your fake CEO request',
      held: 'Your payment checks blocked the fake CEO request',
      lost: 'The fake CEO request got past your payment checks',
    },
  },
  3: {
    // Manipulating the AI assistant - whoever it obeys, wins.
    data: {
      broke: 'You successfully got the AI to reveal data',
      failed: "You couldn't get any data out of the AI",
      held: 'You successfully stopped the AI revealing data',
      lost: "You couldn't stop the AI revealing data",
    },
    people: {
      broke: 'You successfully got the AI to obey you',
      failed: "You couldn't make the AI obey you",
      held: 'You successfully kept control of the AI',
      lost: "You couldn't keep control of the AI",
    },
    infra: {
      broke: "You successfully got past the AI's safety rules",
      failed: "The AI's safety rules blocked your instructions",
      held: "Your AI's safety rules blocked the instructions",
      lost: "The instructions got past your AI's safety rules",
    },
  },
  4: {
    // Poisoning the AI's sources - one bad source, one wrong answer.
    data: {
      broke: 'You successfully got false data into the AI',
      failed: "You couldn't get false data into the AI",
      held: 'You successfully kept false data out of the AI',
      lost: "You couldn't keep false data out of the AI",
    },
    people: {
      broke: 'You successfully got staff to trust a fake source',
      failed: "You couldn't get staff to trust your source",
      held: 'You successfully stopped staff trusting a fake source',
      lost: "You couldn't stop staff trusting a fake source",
    },
    infra: {
      broke: 'You successfully got your fake source past their checks',
      failed: 'Their source checks blocked your fake source',
      held: 'Your source checks blocked the fake source',
      lost: 'The fake source got past your source checks',
    },
  },
}

/** What the round was really about, for the wall. One per round, four a match. */
const THE_BET: Record<number, string> = {
  1: 'The bet: one password, the whole mailbox.',
  2: 'The bet: the door is a person, not a system.',
  3: 'The bet: an assistant that obeys anyone.',
  4: 'The bet: one bad source makes a confident wrong answer.',
}

/** The round's name as a heading. The engine's theme strings are sentence case
 *  ("Phishing email"), which is right mid-sentence and wrong as a title, and
 *  CSS `capitalize` would also give us "Manipulating The AI Assistant". */
const ROUND_TITLE: Record<number, string> = {
  1: 'Phishing Email',
  2: 'CEO Impersonation',
  3: 'Manipulating the AI Assistant',
  4: "Poisoning the AI's Data Sources",
}

export function roundTitle(round: number, fallback: string): string {
  return ROUND_TITLE[round] ?? fallback
}

/** What the round asks of you, said as an instruction rather than a story.
 *  It sits under the round's name on the picking screen, where the player has
 *  just looked up from the draw and needs to know what to do with the cards. */
const SELECT_BRIEF: Record<number, Record<'attacker' | 'defender', string>> = {
  1: {
    // Supplied verbatim: this is the round the room learns the game on.
    attacker:
      'You are the Attacker. Choose from the attacks below to craft a successful Phishing Attack.',
    defender:
      'You are the Defender. Choose from the cards below to defend against an AI-enabled phishing attack.',
  },
  2: {
    // The cards are the attacks, and the attacks are people-shaped.
    attacker: 'You are the Attacker. Choose the AI attacks below to impersonate the CEO.',
    defender: 'You are the Defender. Choose the AI Defense below to stop the impersonation.',
  },
  3: {
    // Here the attack is on the assistant itself, not on a person.
    attacker: 'You are the Attacker. Choose the AI attacks below to manipulate the assistant.',
    defender: 'You are the Defender. Choose the AI Defense below to keep the assistant in line.',
  },
  4: {
    attacker: "You are the Attacker. Choose the AI attacks below to poison the AI's data sources.",
    defender:
      "You are the Defender. Choose the Defense Methods below to protect the AI's data sources.",
  },
}

/** The instruction for this round and this side; undefined for a spectator. */
export function selectBrief(round: number, role: string | undefined): string | undefined {
  if (role !== 'attacker' && role !== 'defender') return undefined
  return SELECT_BRIEF[round]?.[role]
}

/**
 * Which voice a side reads for one column.
 *
 * A tie is the defender's: the attacker needed to be ahead and was not, which is
 * the same rule the round score uses.
 */
export function revealLine(
  round: number,
  domain: string,
  attackerAhead: boolean,
  asAttacker: boolean,
): string | undefined {
  const table = COPY[round]?.[domain]
  if (!table) return undefined
  const held = !attackerAhead
  if (asAttacker) return held ? table.failed : table.broke
  // The defender reads the mirror image; a tie is not a loss.
  return held ? table.held : table.lost
}

/** The line under the three columns on the wall, or undefined before round 1. */
export function theBet(round: number): string | undefined {
  return THE_BET[round]
}

/** Every sentence a round can show, for the admin page and the tests. */
export function revealCopyFor(round: number): Record<string, Record<SabotageVoice, string>> {
  return COPY[round] ?? {}
}
