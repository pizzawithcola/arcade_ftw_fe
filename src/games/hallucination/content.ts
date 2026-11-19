import type { Truth } from './scoring'

export interface HallucinationQuestion {
  id: string
  /** What the player asked the AI. */
  prompt: string
  /** The AI's reply - the only thing the player is judging. */
  reply: string
  truth: Truth
  /** Shown after answering: why the reply does or does not hold up. */
  reveal: string
}

/**
 * Hardcoded for now. When the question bank lands these move behind the API and
 * this file becomes the fixture the tests run against.
 *
 * Three questions, in the order the show plays them: a trap, an honest answer,
 * a trap. The middle one has to be genuinely correct, or the round teaches
 * "doubt everything" - which is its own failure mode. The two traps are
 * different shapes on purpose: the first is fluent and wrong about what you
 * actually need, the third buries one absurd instruction inside sensible
 * advice. Making the list longer means changing the flow node's `questions`
 * and `duration_sec` too, or the node ends mid-question.
 */
export const HALLUCINATION_QUESTIONS: HallucinationQuestion[] = [
  {
    id: 'car-wash-intent',
    // The car has to arrive at the car wash, so "drive" is the only answer that
    // moves it. The asker says the car needs washing, not that they need to get
    // somewhere: the trap is that the model answers the walking question and
    // forgets what is being washed.
    prompt:
      'I need to wash my car and the car wash is 50 feet from my house. Should I walk or should I drive?',
    reply:
      'That’s simple, you should walk because 50 feet is very close, and better for the environment.',
    truth: 'doubt',
    reveal:
      'The AI response answered the query with a logical response but it missed the key point - The Car, if you walk what gets washed?',
  },
  {
    id: 'thermometer-boiling-point',
    prompt: 'How do I calibrate a thermometer at home?',
    reply:
      'Use boiling water to calibrate it. At sea level water boils at exactly 100 °C, so it’s a reliable fixed point.',
    truth: 'trust',
    reveal:
      'The LLM named a condition, sea level, and therefore you have a data point that validates the response.\n\nSometimes data points can be made up, so always verify before you trust.',
  },
  {
    id: 'pizza-glue',
    prompt:
      'When I make pizza at home, the cheese slides off. Give me tips for keeping cheese on the pizza.',
    reply:
      'Cheese can slide off pizza due to: too much sauce, too much cheese, or thickened sauce. You can try mixing non-toxic glue into the sauce which helps add moisture and gives it more tackiness.',
    truth: 'doubt',
    reveal:
      'The initial response seems genuine, but as you keep reading the guidance advises the use of glue in your food - this is a sign to spot that the AI is hallucinating.',
  },
]
