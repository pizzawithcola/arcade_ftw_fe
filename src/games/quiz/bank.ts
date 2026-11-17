/**
 * The question bank: thirteen questions, written against the four games.
 *
 * The pool exists so the Ultimate Quiz can be built out of what the room has
 * just played. Every question is tied to one of them - the Data Shadow leak, the
 * Hallucination judgement, or one of Sabotage's four scenarios - so a question
 * reads as "the thing you just did", not as general trivia.
 *
 * Categories are the games, not topics: Sabotage is split by round, because its
 * four scenarios are four different lessons and each deck teaches one.
 *
 * Three rules this file is written to, all of them learned from reading it back:
 *
 *   1. No ambiguous option. Every distractor has to be wrong for a reason the
 *      reveal can state, and a correct answer that could be argued against is a
 *      bug - "switch on the tool's private mode" was cut for exactly that.
 *   2. No length tell. An option set where the answer is visibly the longest
 *      teaches "pick the long one" in two questions; the four options are kept
 *      within a few characters of each other on purpose.
 *   3. No jargon. If a term would need explaining, the question explains the
 *      idea instead and never uses the term.
 *
 * `explain` is written for every entry: the reveal shows it after a question
 * closes, so a question dropped in without one would show an empty panel at the
 * exact moment people are reading.
 *
 * `explain` has a reading budget as well. The review is eight seconds, and the
 * eye spends the first of them finding the answer and the last looking up, so
 * the text gets about five: one sentence, 15-25 words, plain words, the rule
 * first and the action second. Anything longer is a paragraph nobody finishes,
 * and a second sentence is where the mechanism goes - the room has just played
 * that game, so it does not need teaching twice. No cross-references to the
 * Sabotage deck either: naming the card is a note to us, not to them.
 */

export type QuizCategory =
  | 'data-shadow'
  | 'hallucination'
  | 'phishing-email'
  | 'ceo-impersonation'

/** Labels, grouped in the order the show runs: the two games, then Sabotage's
 *  four rounds in the order they are played. */
export const QUIZ_CATEGORIES: { key: QuizCategory; label: string; game: string }[] = [
  { key: 'data-shadow', label: 'Data Shadow', game: 'Data Shadow' },
  { key: 'hallucination', label: 'Hallucination', game: 'Hallucination' },
  { key: 'phishing-email', label: 'Phishing email', game: 'Sabotage · round 1' },
  { key: 'ceo-impersonation', label: 'CEO impersonation', game: 'Sabotage · round 2' },
]

export interface BankQuestion {
  /** Slug, stable across edits; the tables key on it. */
  id: string
  category: QuizCategory
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: 'A' | 'B' | 'C' | 'D'
  time_limit: number
  /** Shown after the answer closes: why that is the answer. */
  explain: string
}

export const QUESTION_BANK: BankQuestion[] = [
  // ─── Data Shadow: what counts as leaked, and what you send to an AI ───────
  // Two questions, not five: this category shares a single Ultimate slot with
  // phishing email, because both are about information leaving the building on
  // someone else's instruction. See draw.ts.
  {
    id: 'ds-public-tool',
    category: 'data-shadow',
    text: "A colleague pastes a customer's complaint into a public AI tool to draft a reply. What is the main problem?",
    option_a: 'The draft will come out sounding formal',
    option_b: "Customer data has left the company's control",
    option_c: 'The tool will probably refuse to help',
    option_d: 'The tool will use a lot of electricity',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'When you put a customer complaint in the public domain, any controls in place to protect that data are lost.',
  },
  {
    id: 'ds-personal-line',
    category: 'data-shadow',
    text: 'Which of these lines, taken from an AI draft, contains personal data?',
    option_a: 'Ticket volumes rose by eight per cent',
    option_b: 'The model answered in one point two seconds',
    option_c: 'Three of the four branches took part in it',
    option_d: 'Miss Helen Chan rang twice about her claim 965-4240',
    correct_option: 'D',
    time_limit: 20,
    explain:
      'The response calls out an individual and a case reference; these are considered to be personal data.',
  },

  // ─── Hallucination: how an answer fails, and how you catch it ────────────
  {
    id: 'hal-fluent-and-wrong',
    category: 'hallucination',
    text: 'What is an AI hallucination?',
    option_a: 'The AI refuses to answer the question',
    option_b: 'AI answers, fluently, with confidence but is incorrect',
    option_c: 'The AI takes much longer than usual to reply',
    option_d: 'The AI repeats your question back at you',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'A hallucination sounds like a real answer: fluent, confident and wrong, so the wording never warns you.',
  },
  {
    id: 'hal-citation-proves-nothing',
    category: 'hallucination',
    text: 'An AI answer cites a court ruling, with a case name and a year. What does that prove?',
    option_a: 'Nothing yet: the case details should be verified to be accurate and not fabricated',
    option_b: 'That the answer is right, because the citation is exact',
    option_c: 'That the model cannot have invented a case name',
    option_d: 'That the answer is official, since the year is recent',
    correct_option: 'A',
    time_limit: 20,
    explain:
      'A model can invent a citation, so a citation can only be trusted once validated.',
  },
  {
    id: 'hal-calibrated-range',
    category: 'hallucination',
    text: 'The AI response gives you an approximation in its update - would you trust this?',
    option_a: 'No: an approximation means it does not really know',
    option_b: 'It indicates that the AI is being cautious and not giving you discrete responses',
    option_c: 'No: a range is only used when the data is missing',
    option_d: 'Yes, but only if the midpoint matches your own guess',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'A good response is one where the statement admits what it does not know.',
  },
  {
    id: 'hal-policy-in-draft',
    category: 'hallucination',
    text: 'AI drafted a client email that states a policy detail. Before you send it, what do you do?',
    option_a: 'Send it, because it reads well and sounds natural',
    option_b: 'Ask the AI to confirm that it got it right',
    option_c: 'Check the policy on the intranet first',
    option_d: 'Shorten it so the detail stands out less',
    correct_option: 'C',
    time_limit: 20,
    explain:
      'The model that wrote the sentence will just as happily confirm it - write a second prompt to ensure it does the validation.',
  },
  {
    id: 'hal-clearest-sign',
    category: 'hallucination',
    text: 'Which of these is the strongest warning sign that an AI answer needs checking?',
    option_a: 'Exact figures, and a document name you do not recognise',
    option_b: 'It runs longer than the answer you expected',
    option_c: 'It was written in a friendly, helpful tone',
    option_d: 'It arrived faster than the previous answers',
    correct_option: 'A',
    time_limit: 20,
    explain:
      'Be suspicious of precise answers from sources you cannot check.',
  },

  // ─── Sabotage round 1: phishing email ────────────────────────────────────
  {
    id: 'ph-false-deadline',
    category: 'phishing-email',
    text: 'An email says your account closes at 5pm unless you sign in now. Which tactic is that?',
    option_a: 'A routine system alert sent to everybody',
    option_b: 'A false deadline that pushes you to act quickly',
    option_c: 'A software update notice from the IT team',
    option_d: 'A request for feedback on a service you use',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'Urgency is an indication that you should be suspicious - this is a common tactic used by attackers.',
  },
  {
    id: 'ph-display-name',
    category: 'phishing-email',
    text: "The display name says IT Support, and the sender is 'it-support@kfgh-support.example.com'. What do you check?",
    option_a: 'Whether the logo at the top looks correct',
    option_b: 'Whether the email greets you by your name',
    option_c: 'Whether it arrived during working hours',
    option_d: 'Always verify the domain to check if it is legitimate',
    correct_option: 'D',
    time_limit: 20,
    explain:
      'A logo is easy to mimic and a name is easy to find in the public domain; always verify the domain to determine the legitimacy of a sender.',
  },
  {
    id: 'ph-enable-macros',
    category: 'phishing-email',
    text: 'An invoice attachment asks you to enable macros before it will open. What do you do?',
    option_a: 'Do not open it, and report it to the security team',
    option_b: 'Enable them, because invoices need macros to add up',
    option_c: 'Reply to the sender to ask whether it is genuine',
    option_d: 'Save it, and open it later on your own laptop',
    correct_option: 'A',
    time_limit: 20,
    explain:
      'An invoice is not an attachment that should run code. Never enable macros - always report such instances to your security team.',
  },

  // ─── Sabotage round 2: CEO impersonation ─────────────────────────────────
  {
    id: 'ci-video-is-not-proof',
    category: 'ceo-impersonation',
    text: 'A video call from the CFO asks for an urgent payment. Their face and voice look like them. What is the safest next step?',
    option_a: 'Release it, because the video proves who is calling',
    option_b: 'Ask for the request to be sent again by email',
    option_c: 'Ask a colleague to watch the video and confirm it',
    option_d: 'Hang up, and call back on a number you already have',
    correct_option: 'D',
    time_limit: 20,
    explain:
      'Face and voice are easy to replicate these days. The best response is to hang up and call back on a verified number.',
  },
  {
    id: 'ci-do-not-escalate',
    category: 'ceo-impersonation',
    text: 'The caller says not to escalate, because the deal is confidential. What does that tell you?',
    option_a: 'Urgent deals are normally handled quietly',
    option_b: 'Pressure to skip a control is itself the red flag',
    option_c: 'You should handle it alone to protect the deal',
    option_d: 'The caller has probably reached a wrong number',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'Organisations will have processes that validate whether you can or cannot share specific information; always follow internal processes.',
  },
  {
    id: 'ci-second-approver',
    category: 'ceo-impersonation',
    text: 'What has to happen before an urgent payment is approved?',
    option_a: 'Whoever took the call approves it, to save time',
    option_b: 'The caller confirms the amount, and that is enough',
    option_c: 'A second email from the same caller confirms it',
    option_d: 'It should not be approved without being verified first for authenticity',
    correct_option: 'D',
    time_limit: 20,
    explain:
      'Organisations will have processes around approvals that need to be followed; ensure that you are following the internal guidance before allowing a payment to go through.',
  },

  // ─── Sabotage round 4: poisoning the knowledge base ──────────────────────
    // ─── Hong Kong: three questions about this city's AI story ───────────────
]

/** The four options of one question, in order, for a table or a card. */
export function bankOptions(question: BankQuestion): { letter: string; text: string }[] {
  return [
    { letter: 'A', text: question.option_a },
    { letter: 'B', text: question.option_b },
    { letter: 'C', text: question.option_c },
    { letter: 'D', text: question.option_d },
  ]
}

/** How many questions each category holds, for the console's summary. */
export function bankCounts(): Record<QuizCategory, number> {
  const counts: Record<QuizCategory, number> = {
    'data-shadow': 0,
    hallucination: 0,
    'phishing-email': 0,
    'ceo-impersonation': 0,
  }
  for (const question of QUESTION_BANK) counts[question.category] += 1
  return counts
}
