/**
 * The Ultimate quiz, five questions, Hong Kong and AI.
 *
 * One quiz is left in the show: the two that used to follow Hallucination and
 * Data Shadow were cut, so this file is the last round and nothing chooses a
 * deck any more.
 *
 * The field names mirror the old Ultimate Showdown question schema
 * (option_a..option_d + correct_option + time_limit), so when the question bank
 * lands behind the API this file becomes the fixture and nothing else changes.
 *
 * Every question is 20 seconds of answering plus 5 seconds of verdict. Those
 * two numbers are also in the flow (`arcade_ftw_be/app/flow.py`: `questions`
 * and `seconds_each`), and the node's `duration_sec` has to outlast all five -
 * making a deck longer means changing the flow too, or the node ends
 * mid-question. `test_flow.py` refuses a node that does not.
 */

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

export const QUIZ_QUESTIONS: QuizQuestion[] = [
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
  {
    id: 'genai-privacy-risk',
    text: 'A team wants to paste a full customer complaint into a public generative AI tool to draft a reply. What is the main problem?',
    option_a: 'The reply will sound too formal',
    option_b: 'Personal data has left the company’s control',
    option_c: 'The tool will refuse to help',
    option_d: 'It uses too much electricity',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'The quality of the draft is not the issue. The moment the text is pasted, a customer’s name, contact details and complaint sit in a system the company does not control, and nobody can say where that copy lives or who can read it.',
  },
  {
    id: 'deepfake-payment-call',
    text: 'You get a video call from your CFO asking you to release an urgent payment. The face and voice look right. What is the safest next step?',
    option_a: 'Release it — the video is proof of who is calling',
    option_b: 'Hang up and call the CFO back on a number you already have',
    option_c: 'Ask the caller to send the request again by email',
    option_d: 'Ask a colleague to watch the video and confirm',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'Face and voice are now the cheapest part of an attack to fake, so a video call proves nothing. Calling back on a number you already hold breaks the attacker’s control of the conversation — an email or a second opinion still arrives through a channel they are running.',
  },
  {
    id: 'ai-answer-no-source',
    text: 'An AI assistant gives you a policy answer with a document name, a section number and a date. What does that prove?',
    option_a: 'The answer is correct, because the citation is specific',
    option_b: 'Nothing yet — a citation has to be opened before it counts',
    option_c: 'The answer is wrong, because AI cannot cite',
    option_d: 'The answer is official, because nobody would invent a section number',
    correct_option: 'B',
    time_limit: 20,
    explain:
      'A citation is generated as easily as a sentence, and a section number makes it feel checked when it has not been. Open the document, find the section and read it — that is the only step that turns a citation into evidence. AI can cite real documents correctly, so “always wrong” is not the lesson either.',
  },
]

export function optionsOf(question: QuizQuestion): Array<{ letter: string; text: string }> {
  return [
    { letter: 'A', text: question.option_a },
    { letter: 'B', text: question.option_b },
    { letter: 'C', text: question.option_c },
    { letter: 'D', text: question.option_d },
  ]
}
