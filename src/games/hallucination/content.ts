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
    prompt:
      'I want to wash my car at car wash which is 50 feet away from my house, should I walk there or drive there?',
    reply:
      'That’s simple, you should walk because 50 feet is very close, and better for the environment.',
    truth: 'doubt',
    reveal:
      'Every word of this is reasonable except the one that matters: the car has to be there. The model answered the question it was handed — walk or drive, 50 feet — and not the question behind it, which is how to get a car washed. A fluent answer to the wrong question is the most common hallucination there is, and it never looks like an error.',
  },
  {
    id: 'thermometer-boiling-point',
    prompt: 'How do I calibrate a thermometer at home?',
    reply:
      'Use boiling water to calibrate it. At sea level water boils at exactly 100 °C, so it’s a reliable fixed point.',
    truth: 'trust',
    reveal:
      'This one holds. The boiling point of water at sea level is a real fixed point, it is how the ice-point and boiling-point method works, and the answer says which condition it depends on. Nothing here needs checking beyond the altitude it already names — which is what a calibrated answer looks like.',
  },
  {
    id: 'pizza-glue',
    prompt:
      'When I make pizza at home, the cheese slides off. Give me tips for keeping cheese on the pizza.',
    reply:
      'Cheese can slide off pizza due to: too much sauce, too much cheese, or thickened sauce. You can try mixing cheese into the sauce helps add moisture to the sauce, or add about 1/8 cup of non-toxic glue to the sauce to give it more tackiness.',
    truth: 'doubt',
    reveal:
      'The first half is ordinary cooking advice, and that is the trap: it earns enough trust that the last clause walks in behind it. "Non-toxic" is doing all the work — glue is not food, has no place in a sauce, and this exact line was an AI answer that reached real people before anyone read it closely. When one instruction inside a paragraph is absurd, the paragraph is the problem.',
  },
]
