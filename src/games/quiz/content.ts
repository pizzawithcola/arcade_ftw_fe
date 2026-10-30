/**
 * The three quiz rounds, one deck each.
 *
 * A quiz directly follows a game, so its questions are about that game: the
 * Hallucination round tests what the players just judged, the Data Shadow round
 * tests what they just flagged. The Ultimate Quiz is the wide round - Hong Kong
 * and AI - and its deck is deliberately short for now; more will be added.
 *
 * The field names mirror the old Ultimate Showdown question schema
 * (option_a..option_d + correct_option + time_limit), so when the question bank
 * lands behind the API this file becomes the fixture and nothing else changes.
 *
 * A deck is two questions and every question is 20 seconds of answering plus 5
 * seconds of verdict. Those two numbers live in the flow too
 * (`arcade_ftw_be/app/flow.py`: `questions` and `seconds_each` on the quiz
 * node); lengthening a deck means changing both, or the node ends mid-question.
 */

export type QuizDeck = 'hallucination' | 'data' | 'ultimate'

export interface QuizQuestion {
  id: string
  text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_option: 'A' | 'B' | 'C' | 'D'
  time_limit: number
  /** Shown after answering, so a right answer is a lesson and not just a point. */
  explain: string
}

const DECKS: Record<QuizDeck, QuizQuestion[]> = {
  hallucination: [
    {
      id: 'hallucination-risk',
      text: 'What is the primary risk of AI hallucination?',
      option_a: 'AI models become too fast to control',
      option_b: 'AI generates false but convincing information',
      option_c: 'AI deletes its training data',
      option_d: 'AI refuses to answer questions',
      correct_option: 'B',
      time_limit: 20,
      explain:
        'A hallucination is not a refusal or a speed problem. It is output that is fluent, confident and wrong — which is exactly why it is dangerous: it does not look wrong.',
    },
    {
      id: 'verify-claim',
      text: 'Which of these is the most reliable way to check whether an AI claim is true?',
      option_a: 'Ask the same AI to repeat the claim more confidently',
      option_b: 'Find an independent primary source that states the same fact',
      option_c: 'Check whether the sentence reads fluently',
      option_d: 'Ask a second AI whether it agrees',
      correct_option: 'B',
      time_limit: 20,
      explain:
        "Fluency and confidence are a hallucination's camouflage, and another model can share the same wrong assumption. A claim is only as good as an independent primary source that states it.",
    },
  ],

  data: [
    {
      id: 'ai-chat-paste',
      text: 'A colleague pastes a customer email into a public AI chatbot to draft a reply. What is the main problem?',
      option_a: 'The draft will sound too formal',
      option_b: "Personal data has left the company's control",
      option_c: 'The chatbot will refuse to help',
      option_d: 'It uses too much electricity',
      correct_option: 'B',
      time_limit: 20,
      explain:
        'The quality of the reply is not the issue. The moment the text is pasted, a customer’s name, contact details and complaint sit in a system the company does not control, and nobody can say where that copy lives or who can read it.',
    },
    {
      id: 'safe-to-publish',
      text: 'A post about a successful AI pilot is going public. Which of these is safe to include?',
      option_a: "A customer's name and their renewal date",
      option_b: 'A photo of the whiteboard with a client name on it',
      option_c: 'The share of tickets the pilot handled automatically',
      option_d: 'The internal hostname of the model server',
      correct_option: 'C',
      time_limit: 20,
      explain:
        'An aggregate number describes the work without describing a person. A name, a whiteboard and a hostname each hand an outsider something they can act on, and none of them make the post any better.',
    },
  ],

  // Hong Kong and AI. Short for now - this is the round that will grow.
  ultimate: [
    {
      id: 'hk-ai-framework',
      text: 'Which Hong Kong body published the “Artificial Intelligence: Model Personal Data Protection Framework” in 2024?',
      option_a: 'The Hong Kong Monetary Authority',
      option_b: 'The Office of the Privacy Commissioner for Personal Data',
      option_c: 'The Securities and Futures Commission',
      option_d: 'The Office of the Government Chief Information Officer',
      correct_option: 'B',
      time_limit: 20,
      explain:
        'The PCPD issued the framework in June 2024 as guidance for organisations using AI, built on the existing PDPO principles rather than a new law. The other three cover money, markets and government IT — not personal data.',
    },
    {
      id: 'hk-pdpo-principle',
      text: 'Under Hong Kong’s PDPO, which of these is one of the six Data Protection Principles?',
      option_a: 'All personal data must be stored in Hong Kong',
      option_b: 'Personal data must not be kept longer than is necessary',
      option_c: 'Data subjects must be paid when their data is used',
      option_d: 'Consent must be renewed every twelve months',
      correct_option: 'B',
      time_limit: 20,
      explain:
        'DPP2 requires data to be accurate and kept no longer than necessary for the purpose it was collected. There is no localisation rule, no payment for data and no fixed twelve-month consent cycle — those are exactly the plausible-sounding inventions a hallucination would offer.',
    },
  ],
}

/** `score` on the flow's quiz node names the section, so it also names the deck.
 *  An unknown key falls back to the first deck rather than blanking the screen. */
export function quizDeckFor(section: string | undefined): QuizDeck {
  if (section === 'data' || section === 'ultimate') return section
  return 'hallucination'
}

export function questionsFor(deck: QuizDeck): QuizQuestion[] {
  return DECKS[deck]
}

export function optionsOf(question: QuizQuestion): Array<{ letter: string; text: string }> {
  return [
    { letter: 'A', text: question.option_a },
    { letter: 'B', text: question.option_b },
    { letter: 'C', text: question.option_c },
    { letter: 'D', text: question.option_d },
  ]
}
