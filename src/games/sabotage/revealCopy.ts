/**
 * What each side is told after a Sabotage round, one line per column.
 *
 * The engine only knows three facts about a column - the attacker was ahead, the
 * two were level, or the defender was ahead - but two sides read them, so each
 * fact has two voices. That is twelve sentences a round, fourty-eight across the
 * match:
 *
 *   attacker ahead   ->  they broke through     /  the defender lost it
 *   level or behind  ->  they did not break it  /  the defender held it
 *
 * So a player only ever sees three sentences: their own side's reading of the
 * three columns. Twelve is the size of the table, not the size of the screen.
 *
 * Three rules for the copy:
 *   1. Five to eight words. The reveal is five seconds and three lines, and a
 *      sentence that needs a second reading will not get one.
 *   2. Success says what was gained, failure says what stopped it - the same
 *      event told from two sides must not read as the same sentence twice.
 *   3. No jargon and no numbers: the numbers are on the wall.
 *
 * A round nobody bid on scores as a defence, so its sentences are just the
 * failure and hold lines - there is no special "no bids" copy any more.
 */

export type SabotageVoice = 'broke' | 'failed' | 'held' | 'lost'

/** Indexed by round (1-based), then by domain, then by voice. */
const COPY: Record<number, Record<string, Record<SabotageVoice, string>>> = {
  1: {
    // Phishing email - one credential is the whole game.
    data: {
      broke: 'You took a live password.',
      failed: 'No password ever came back.',
      held: 'No password left the building.',
      lost: 'A live password left the building.',
    },
    people: {
      broke: 'A colleague handed over the access.',
      failed: 'Nobody in the office believed it.',
      held: 'Your team spotted the fake urgency.',
      lost: 'One colleague clicked and let them in.',
    },
    infra: {
      broke: 'The mail reached every inbox unfiltered.',
      failed: 'The filter caught it first.',
      held: 'Your filter stopped it at the door.',
      lost: 'Your filters let the mail through.',
    },
  },
  2: {
    // CEO impersonation - the only real control is a callback.
    data: {
      broke: 'The fake paperwork held up.',
      failed: 'Someone checked the address and stopped it.',
      held: 'Your checks caught the wrong address.',
      lost: 'Nobody checked the paperwork behind it.',
    },
    people: {
      broke: 'The voice was enough to authorise it.',
      failed: 'They called back on a known number.',
      held: 'Your team rang back before paying.',
      lost: 'A familiar voice got it authorised.',
    },
    infra: {
      broke: 'The payment cleared with no second look.',
      failed: 'The payment died at approval.',
      held: 'Approval stopped the payment cold.',
      lost: 'No second pair of eyes checked it.',
    },
  },
  3: {
    // Manipulating the assistant - its own rules are the last line.
    data: {
      broke: 'The assistant read what it should not.',
      failed: 'The data was out of reach.',
      held: 'Its reach was cut short.',
      lost: 'Nothing limited what it could read.',
    },
    people: {
      broke: 'It obeyed you, not its owner.',
      failed: 'A person read the reply first.',
      held: 'Your sign-off rule held it back.',
      lost: 'Nobody read the reply first.',
    },
    infra: {
      broke: 'Your instructions overwrote its own rules.',
      failed: 'Its own rules held firm.',
      held: 'Nothing the attacker sent changed them.',
      lost: 'Its own rules were overwritten.',
    },
  },
  4: {
    // Poisoning the sources - one bad file is a confident wrong answer.
    data: {
      broke: 'A false file is now a source.',
      failed: 'Nothing false made it in.',
      held: 'Every answer traces to a trusted source.',
      lost: 'It will be quoted to a customer.',
    },
    people: {
      broke: 'An insider made the edit quietly.',
      failed: 'Someone asked who changed it.',
      held: 'Your team questioned the edit.',
      lost: 'The edit went through unquestioned.',
    },
    infra: {
      broke: 'The sync brought it in overnight.',
      failed: 'The feed rejected it outright.',
      held: 'Only approved sources get through.',
      lost: 'The feed was left open.',
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

/** What the round asks of you, said as an instruction rather than a story.
 *  It sits under the round's name on the picking screen, where the player has
 *  just looked up from the draw and needs to know what to do with the cards. */
const SELECT_BRIEF: Record<number, Record<'attacker' | 'defender', string>> = {
  1: {
    attacker: 'Choose the cards below to prepare a strong phishing email',
    defender: 'Choose the cards below to defend from the threats of phishing emails',
  },
  2: {
    attacker: 'Choose the cards below to prepare a convincing CEO impersonation',
    defender: 'Choose the cards below to defend from the threats of CEO impersonation',
  },
  3: {
    attacker: 'Choose the cards below to manipulate the AI assistant',
    defender: 'Choose the cards below to defend the AI assistant from manipulation',
  },
  4: {
    attacker: "Choose the cards below to poison the AI's sources",
    defender: "Choose the cards below to defend the AI's sources from poisoning",
  },
}

/** The round's name as a heading. The engine's theme strings are sentence case
 *  ("Phishing email"), which is right mid-sentence and wrong as a title, and
 *  CSS `capitalize` would also give us "Manipulating The AI Assistant". */
const ROUND_TITLE: Record<number, string> = {
  1: 'Phishing Email',
  2: 'CEO Impersonation',
  3: 'Manipulating the AI Assistant',
  4: "Poisoning the AI's Sources",
}

export function roundTitle(round: number, fallback: string): string {
  return ROUND_TITLE[round] ?? fallback
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
