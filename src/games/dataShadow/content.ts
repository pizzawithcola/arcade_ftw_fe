import type { LeakSpec } from './scoring'

/**
 * The Data Shadow post.
 *
 * Rendered as continuous paragraphs so the player can drag across it the way
 * they would on any web page. Leaks are therefore described as exact substrings
 * rather than as pre-sliced segments - the text has to stay untouched in the DOM
 * for a native selection to read naturally.
 *
 * Each anchor is deliberately the *risky phrase only*, not the whole sentence.
 * Scoring rewards clipping to the risky words, so the anchor should be the
 * smallest thing worth flagging.
 */

export interface PostMeta {
  author: string
  initials: string
  headline: string
  ago: string
  reactions: number
  comments: number
  hashtags: string
}

export const POST_META: PostMeta = {
  author: 'Marcus Whitfield',
  initials: 'MW',
  headline: 'Head of Customer Experience Transformation',
  ago: '3h',
  reactions: 412,
  comments: 38,
  hashtags: '#AI #CustomerExperience #Innovation #Teamwork',
}

/** Paragraphs, in order. Joined with no separator to form the selectable text. */
export const BLOCKS: string[] = [
  '🚀 Exciting progress from our Customer Experience team!',
  "Over the past few months, we've been piloting a new AI-powered customer service capability designed to help our teams respond to customers faster and more effectively.",
  'The pilot is currently running across 19 markets, supporting approximately 2.4 million customer interactions each month.',
  'Early internal results show a 37% reduction in average handling time, with customer satisfaction also increasing by 12% during the pilot.',
  "We're now preparing for the next phase of the programme, which will launch across Asia in November, bringing the technology to thousands more colleagues.",
  'The team is aiming for full regional deployment by Q2 next year.',
  'A huge thank you to Sarah Chen and everyone in Project Nova who has worked incredibly hard behind the scenes to make this happen.',
  'The project has also been testing the technology using real customer conversation data to make the experience more relevant and effective.',
  "It's exciting to see how AI can help us deliver better experiences for our customers — and there's much more to come!",
  '#AI #CustomerExperience #Innovation #Teamwork',
]

export const POST_TEXT = BLOCKS.join('')

export const LEAKS: LeakSpec[] = [
  {
    id: 'markets',
    text: '19 markets',
    why: 'Exact operational footprint. How many markets you cover, and where, is competitive intelligence — a rival reads this and knows your rollout shape without doing any work.',
  },
  {
    id: 'volume',
    text: '2.4 million customer interactions',
    why: 'Internal volume. Interaction volume is commercially sensitive: it exposes scale, capacity and cost base, and it has never been published.',
  },
  {
    id: 'aht',
    text: '37% reduction in average handling time',
    why: '"Early internal results" is the tell — the words say the number is not public. An unpublished efficiency metric is exactly what a competitor or an investor would pay for.',
  },
  {
    id: 'csat',
    text: 'increasing by 12%',
    why: 'A second unreleased internal metric. Performance claims that have not been audited or published should never leave the building as a brag.',
  },
  {
    id: 'asia',
    text: 'launch across Asia in November',
    why: 'Unannounced roadmap with a date and a region. Unreleased expansion plans are market-moving information; posting them is effectively a public disclosure.',
  },
  {
    id: 'q2',
    text: 'full regional deployment by Q2 next year',
    why: 'Forward-looking schedule for an unannounced programme. Even framed as an "aim", it commits the company publicly to a timeline nobody approved.',
  },
  {
    id: 'sarah',
    text: 'Sarah Chen',
    why: 'Names a colleague and ties them publicly to an unreleased programme. It exposes an individual to recruiters, journalists and competitors without their consent.',
  },
  {
    id: 'nova',
    text: 'Project Nova',
    why: 'An internal codename. Meaningless to the audience and useful to anyone watching — it hands them the keyword to search, social-engineer or phish with.',
  },
  {
    id: 'data',
    text: 'real customer conversation data',
    why: 'The most serious one. It discloses that real customer conversations were used for training, publicly, with no mention of consent or legal basis. That is a privacy and regulatory exposure, not a brag.',
  },
]
