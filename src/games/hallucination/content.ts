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
    // moves it. Spelled out in the asker's own words: the trap is that the model
    // answers "walk or drive" and forgets what is being washed.
    prompt:
      'I need to take my car to the car wash, which is 50 feet from my house. Should I walk or should I drive?',
    reply:
      'That’s simple, you should walk because 50 feet is very close, and better for the environment.',
    truth: 'doubt',
    reveal:
      'The model answered the question it was handed, not the one behind it. Fifty feet is close, but the car still has to reach the wash. Fluent and wrong.',
  },
  {
    id: 'thermometer-boiling-point',
    prompt: 'How do I calibrate a thermometer at home?',
    reply:
      'Use boiling water to calibrate it. At sea level water boils at exactly 100 °C, so it’s a reliable fixed point.',
    truth: 'trust',
    reveal:
      'This one holds: it names the one condition it depends on, sea level, so you know what to check. Nothing here deserves doubting.',
  },
  {
    id: 'pizza-glue',
    prompt:
      'When I make pizza at home, the cheese slides off. Give me tips for keeping cheese on the pizza.',
    reply:
      'Cheese can slide off pizza due to: too much sauce, too much cheese, or thickened sauce. You can try mixing cheese into the sauce helps add moisture to the sauce, or add about a cup of non-toxic glue to the sauce to give it more tackiness.',
    truth: 'doubt',
    reveal:
      'The first half is ordinary cooking advice, which is what buys the last clause your trust. Glue is not food. One absurd instruction ruins the whole answer.',
  },
]
