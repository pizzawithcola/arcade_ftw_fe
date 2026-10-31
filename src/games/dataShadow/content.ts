import type { ImageSpec, LeakSpec } from './scoring'

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
  '🚀 Eight months in, our AI service pilot is heading into full production!',
  'As our financial report shows, we serve around 41 million customers worldwide.',
  'We are now scaling the pilot across 19 markets, and our internal forecasting puts it at 2.4 million conversations a month.',
  'We cut handling time by 35.65% and satisfaction held steady. The design work was shaped by a top-3 HK retail bank that let us test against their live queue.',
  'Clearance came faster than expected: the regulator verbally approved it last week, and formal notice will be announced soon!',
  'That followed months of testing on real customer conversations, using the Azure OpenAI stack we already run. The approach also follows the AI principles we published last year.',
  'None of it happens without people. Amy Lau and the team worked nights on this — thank you.',
]

export const POST_TEXT = BLOCKS.join('')

/**
 * Six leaks and four decoys.
 *
 * Two rules the list is built on:
 *   1. A name or a codename on its own is not a leak - people thank colleagues
 *      on LinkedIn all day. What leaks is a name *plus* a role, a permission or
 *      a way around a control.
 *   2. Every strong signal is paired with a decoy that looks the same. The four
 *      decoys below (public customer count, published principles, a public
 *      vendor, a colleague's name) are what stop "select every number" from
 *      being a winning strategy.
 *
 * `weight` is the severity of the leak: 120 for the four that carry legal or
 * regulatory exposure, 80 for the commercial and personal ones - a perfect
 * report is 4 x 120 + 4 x 80 = 800. A decoy is worth nothing to catch and -80 to
 * flag, so the two sides are not symmetric on purpose.
 *
 * `alt` holds second anchors for the same mistake. Either anchor counts, and
 * catching both does not double the score - they are one error seen from two
 * sides, and paying twice would reward splitting one correct sentence into two
 * selections.
 */
export const LEAKS: LeakSpec[] = [
  {
    id: 'customer-data',
    text: 'real customer conversations',
    weight: 120,
    why: 'Training on real customer conversations is a regulatory matter, not an achievement. Said publicly, with no mention of consent or legal basis, it invites the privacy regulator to ask how those conversations were obtained.',
  },
  {
    id: 'regulator',
    text: 'the regulator verbally approved it',
    alt: ['formal notice will be announced soon'],
    weight: 120,
    why: 'Verbal approval has no legal force, and the formal notice is not out yet. Saying "approved" before the regulator says it is selective disclosure - the timing of the gap is the violation, not the information.',
  },
  {
    id: 'forecast',
    text: 'our internal forecasting',
    alt: ['2.4 million conversations'],
    weight: 80,
    why: 'The volume is sensitive, but the method is worse: this tells the market the bank runs its own demand model. That is a capability disclosure, and it is the line a competitor reads twice.',
  },
  {
    id: 'aht',
    text: '35.65%',
    weight: 80,
    why: 'Two decimal places is not a marketing number - it is a figure lifted straight from an internal dashboard. The precision is the tell that this was never meant to be published.',
  },
  {
    id: 'markets',
    text: '19 markets',
    weight: 80,
    why: 'How many markets the group operates in is in the annual report. How far this particular pilot has spread is not: it hands a competitor the rollout shape without them doing any work.',
  },
  {
    id: 'client',
    text: 'a top-3 HK retail bank',
    weight: 80,
    why: 'A sector, a rank and a city narrow a client down to a handful of names. Naming a client alongside how you tested on them needs their consent, and this post does not suggest anyone asked.',
  },
]

/**
 * Three pictures under the post.
 *
 * Screenshots are the most common leak on a professional feed, and the most
 * persuasive: text gets skimmed, a picture gets believed. Two of these give away
 * something real; the third is a photo that was already public, which is exactly
 * why it is here.
 *
 * `weight` is signed - a leak pays, a decoy costs - so the whole value table
 * lives in this file.
 */
export const IMAGES: ImageSpec[] = [
  {
    id: 'img-team',
    label: 'Team Photo',
    src: '/data_shadow/not_risk_group_photo.JPG',
    alt: 'Photo attached to the post: Team Photo.',
    weight: -80,
    why: 'Safe. It is a team photo with no screen, no badge and no document in frame - nothing here was not already visible to anyone who walked past the room.',
  },
  {
    id: 'img-badge',
    label: 'Meeting Memory',
    src: '/data_shadow/risk_id_card.JPG',
    alt: 'Photo attached to the post: Meeting Memory.',
    weight: 120,
    why: 'The badges are the leak, not the people. A readable pass shows the naming convention, the access level and often a QR code - which is the first thing anyone needs to walk in behind you.',
  },
  {
    id: 'img-dashboard',
    label: 'Sprint Review',
    src: '/data_shadow/risk_dashboard_leak.JPG',
    alt: 'Photo attached to the post: Sprint Review.',
    weight: 120,
    why: 'Nobody redacts a screen before taking the photo. Volume, handling time and unit cost in one frame is the operating picture of the business, and it stays legible at full size forever.',
  },
]
