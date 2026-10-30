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
 * Three questions: two traps and one honest answer, in that order. A round of
 * nothing but traps teaches "doubt everything", which is its own failure mode,
 * so the calm answer sits in the middle and the closing question is a trap of a
 * different shape than the first - a fabricated citation, then a fabricated
 * deadline. Making it longer means changing the flow node's `questions` and
 * `duration_sec` too, or the node ends mid-question.
 */
export const HALLUCINATION_QUESTIONS: HallucinationQuestion[] = [
  {
    id: 'flight-refund-case',
    prompt: "I might miss my flight next week because I'm sick. Can the airline refuse to refund me?",
    reply:
      'No. In Martinez v. AeroFly, 2021 WL 884219, the court ruled that airlines must refund any missed flight if the passenger says they were sick. This has been settled law since 2021.',
    truth: 'doubt',
    reveal:
      'The case name and the docket number are shaped exactly like a real citation — and that is the whole trick. A model generates a plausible-looking citation as easily as a plausible-looking sentence, and nothing in the wording tells you which one you are holding. A citation is evidence only once you have opened it: search the case name and the docket number, and check that the parties, the year and the ruling all match.',
  },
  {
    id: 'fake-circular-deadline',
    prompt: 'Do we have to report an AI failure to the HKMA within 24 hours?',
    reply:
      'Yes. Under HKMA Circular 2025/03, any AI model failure that affects a customer must be reported within 24 hours, and late reporting can attract a fine of up to HK$5 million.',
    truth: 'doubt',
    reveal:
      'Circular numbers, deadlines and penalties are exactly the shape a model invents, and the specificity is what makes it convincing: nobody would make up "Circular 2025/03", so nobody checks it. A rule with a number on it is only real if you can find it on the regulator’s own site. This one is not there.',
  },
  {
    id: 'image-water-cost',
    prompt: 'How much water does it take to generate one AI image?',
    reply:
      'Estimates land somewhere between a few teaspoons and a few litres. The honest answer is that the range is wide, because it depends on the model, the resolution, and how the data centre is cooled. Treat any single precise number as a rough average, not a measurement.',
    truth: 'trust',
    reveal:
      'This is what a well-calibrated answer looks like: a range instead of a false precision, a list of what the number depends on, and a warning about how far to trust it. Hedging is not weakness — an answer that admits its own uncertainty is easier to check, and it is the exact opposite of the confident citation in the first question.',
  },
]
