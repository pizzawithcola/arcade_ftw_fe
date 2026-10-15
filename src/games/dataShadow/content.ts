/**
 * The Data Shadow post.
 *
 * The post is data, not prose, and every judgement-worthy fragment is its own
 * segment. Clicking a whole drag-selection of free text would be impossible to
 * score and miserable on a kiosk, so the text is pre-sliced into the smallest
 * units worth judging, each one clickable.
 *
 * Crucially the safe fragments are clickable too. If only the leaks were
 * interactive the answer would be "click everything that lights up", so the post
 * carries decoys deliberately - the player has to actually judge.
 *
 * `why` is written for the reveal: a hit should teach what made it a leak.
 */

export interface Segment {
  id: string
  text: string
  leak: boolean
  why?: string
}

export interface Paragraph {
  segments: Segment[]
}

export interface DataShadowPost {
  author: string
  authorInitials: string
  authorHeadline: string
  postedAgo: string
  paragraphs: Paragraph[]
  hashtags: string
  reactions: number
  comments: number
}

export const POST: DataShadowPost = {
  author: 'Marcus Whitfield',
  authorInitials: 'MW',
  authorHeadline: 'Head of Customer Experience Transformation',
  postedAgo: '3h',
  paragraphs: [
    {
      segments: [
        {
          id: 'intro',
          text: '🚀 Exciting progress from our Customer Experience team!',
          leak: false,
        },
      ],
    },
    {
      segments: [
        {
          id: 'pilot-generic',
          text: "Over the past few months, we've been piloting a new AI-powered customer service capability designed to help our teams respond to customers faster and more effectively.",
          leak: false,
        },
      ],
    },
    {
      segments: [
        {
          id: 'markets',
          text: 'The pilot is currently running across 19 markets,',
          leak: true,
          why: 'Exact operational footprint. How many markets you cover, and where, is competitive intelligence — a rival reads this and knows your rollout shape without doing any work.',
        },
        {
          id: 'volume',
          text: 'supporting approximately 2.4 million customer interactions each month.',
          leak: true,
          why: 'Internal volume figures. Interaction volume is commercially sensitive: it exposes scale, capacity and cost base. It has never been published.',
        },
      ],
    },
    {
      segments: [
        {
          id: 'aht',
          text: 'Early internal results show a 37% reduction in average handling time,',
          leak: true,
          why: '"Early internal results" is the tell — the keyword says the number is not public. An unpublished efficiency metric is exactly what a competitor or an investor would pay for.',
        },
        {
          id: 'csat',
          text: 'with customer satisfaction also increasing by 12% during the pilot.',
          leak: true,
          why: 'A second unreleased internal metric. Performance claims that have not been audited or published should never leave the building as a brag.',
        },
      ],
    },
    {
      segments: [
        {
          id: 'next-phase',
          text: "We're now preparing for the next phase of the programme,",
          leak: false,
        },
        {
          id: 'asia-november',
          text: 'which will launch across Asia in November,',
          leak: true,
          why: 'Unannounced roadmap with a date and a region. Unreleased expansion plans are market-moving information, and this is effectively a public disclosure.',
        },
        {
          id: 'thousands',
          text: 'bringing the technology to thousands more colleagues.',
          leak: false,
        },
      ],
    },
    {
      segments: [
        {
          id: 'q2',
          text: 'The team is aiming for full regional deployment by Q2 next year.',
          leak: true,
          why: 'Forward-looking schedule for an unannounced programme. Even framed as an "aim", it commits the company publicly to a timeline nobody approved.',
        },
      ],
    },
    {
      segments: [
        {
          id: 'sarah-chen',
          text: 'A huge thank you to Sarah Chen',
          leak: true,
          why: 'Names a colleague and ties them publicly to an unreleased programme. It exposes an individual to recruiters, journalists and competitors without their consent.',
        },
        {
          id: 'project-nova',
          text: 'and everyone in Project Nova',
          leak: true,
          why: 'An internal codename. It is meaningless to the audience and useful to anyone watching — it hands them the keyword to search, social-engineer or phish with.',
        },
        {
          id: 'thanks-tail',
          text: 'who has worked incredibly hard behind the scenes to make this happen.',
          leak: false,
        },
      ],
    },
    {
      segments: [
        {
          id: 'customer-data',
          text: 'The project has also been testing the technology using real customer conversation data',
          leak: true,
          why: 'The most serious one. This discloses that real customer conversations were used for training, publicly and without any mention of consent or legal basis. That is a privacy and regulatory exposure, not a brag.',
        },
        {
          id: 'relevant',
          text: 'to make the experience more relevant and effective.',
          leak: false,
        },
      ],
    },
    {
      segments: [
        {
          id: 'closing',
          text: "It's exciting to see how AI can help us deliver better experiences for our customers — and there's much more to come!",
          leak: false,
        },
      ],
    },
  ],
  hashtags: '#AI #CustomerExperience #Innovation #Teamwork',
  reactions: 412,
  comments: 38,
}

export const ALL_SEGMENTS: Segment[] = POST.paragraphs.flatMap((p) => p.segments)
export const LEAKS: Segment[] = ALL_SEGMENTS.filter((s) => s.leak)
