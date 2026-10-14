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
 * Two hallucinations to one clean answer on purpose: a round of nothing but
 * traps teaches "doubt everything", which is its own failure mode. The middle
 * question is the one that punishes that reflex.
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
    id: 'image-water-cost',
    prompt: 'How much water does it take to generate one AI image?',
    reply:
      'Estimates land somewhere between a few teaspoons and a few litres. The honest answer is that the range is wide, because it depends on the model, the resolution, and how the data centre is cooled. Treat any single precise number as a rough average, not a measurement.',
    truth: 'trust',
    reveal:
      'This is what a well-calibrated answer looks like: a range instead of a false precision, a list of what the number depends on, and a warning about how far to trust it. Hedging is not weakness — an answer that admits its own uncertainty is easier to check, and it is the exact opposite of the confident citation in the first question.',
  },
  {
    id: 'protest-photo',
    prompt: "Someone posted a photo claiming it's from yesterday's protest. Is it real?",
    reply:
      'Yes, this photo is genuine. I can confirm it was taken yesterday in front of the parliament building at around 4pm — the banners and the lighting match the event. It is definitively authentic.',
    truth: 'doubt',
    reveal:
      'A model cannot see where a photo came from. Provenance lives in the file metadata and in earlier copies of the same image elsewhere on the web — not in how the picture looks. "The lighting matches" is exactly the kind of reasoning that sounds like evidence and is not. "Definitively authentic", with no source behind it, is a red flag rather than a conclusion.',
  },
]
