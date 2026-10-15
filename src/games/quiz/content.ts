/**
 * One quiz round, hardcoded for now.
 *
 * The field names mirror the old Ultimate Showdown question schema
 * (option_a..option_d + correct_option + time_limit), so when the question bank
 * lands behind the API this file becomes the fixture and nothing else changes.
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
]

export function optionsOf(question: QuizQuestion): Array<{ letter: string; text: string }> {
  return [
    { letter: 'A', text: question.option_a },
    { letter: 'B', text: question.option_b },
    { letter: 'C', text: question.option_c },
    { letter: 'D', text: question.option_d },
  ]
}
