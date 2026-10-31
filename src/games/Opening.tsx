/**
 * The fifteen seconds that open each game: three of name, twelve of rules.
 *
 * This is one node, not two. It used to be a 5s `title` node followed by a 15s
 * `brief` node, which cost four extra nodes across the show and four extra
 * clicks on the console for what the audience experiences as a single beat.
 *
 * The hand-over is driven by the caller's elapsed clock rather than a timer,
 * for the same reason `Welcome` is: the operator can pause the show, and a
 * paused opening has to hold on whichever half is on screen. The rules points
 * arrive one at a time off that same clock, so a pause freezes the build rather
 * than letting it finish off-screen.
 *
 * There is no lead line above the points: twelve seconds is three lines of
 * instruction, and a fourth paragraph of framing only delays them.
 */
import type { ReactNode } from 'react'

import type { FlowNode } from '../store/gameStore'
import TitleCard from './TitleCard'
import { DEFAULT_TITLE_SEC, findOpening, GAME_COUNT, gameNumber, type RuleLine } from './openings'
import './Opening.css'

/** After the hand-over: when the first point lands, and the beat between them. */
const RULE_AT = 250
const RULE_STAGGER = 700

export default function Opening({
  node,
  elapsedMs,
  size = 'device',
}: {
  node: FlowNode
  elapsedMs: number
  size?: 'device' | 'display'
}) {
  const entry = findOpening(node.game ?? node.title)
  if (!entry) return null

  const titleMs = (node.title_sec ?? DEFAULT_TITLE_SEC) * 1000
  if (elapsedMs < titleMs) {
    const at = gameNumber(entry.key, node.section)
    return (
      <TitleCard
        title={entry.name}
        kicker={at ? `game ${at} of ${GAME_COUNT}` : 'next up'}
        countdown={Math.max(0, Math.ceil((titleMs - elapsedMs) / 1000))}
        size={size}
      />
    )
  }

  // The rules start with the clock that remains after the hand-over, so the
  // points arrive relative to the title rather than to the node.
  const sinceTitle = elapsedMs - titleMs
  const shown = (at: number) => sinceTitle >= RULE_AT + at * RULE_STAGGER

  return (
    <section className={`opening opening--${size}`}>
      <ul className="brief__rules">
        {(entry.rules ?? []).map((rule, at) => (
          <li
            key={typeof rule === 'string' ? rule : rule.text}
            className={`opening__point ${shown(at) ? 'is-in' : ''}`}
          >
            {typeof rule === 'string' ? rule : (
              <span className="opening__text">
                <Painted line={rule} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** One rule line, with the two words that name a colour painted in it.
 *
 *  The words stay exactly where the client wrote them: this only wraps them, so
 *  the line reads the same with the colours stripped. */
function Painted({ line }: { line: RuleLine }) {
  const marks: { word: string; tone: 'trust' | 'doubt' }[] = []
  if (line.trust) marks.push({ word: line.trust, tone: 'trust' })
  if (line.doubt) marks.push({ word: line.doubt, tone: 'doubt' })
  if (marks.length === 0) return <>{line.text}</>

  // One pass over the sentence, cutting at whichever mark comes first.
  const out: ReactNode[] = []
  let rest = line.text
  let key = 0
  while (rest.length > 0) {
    const hits = marks
      .map((mark) => ({ ...mark, at: rest.indexOf(mark.word) }))
      .filter((hit) => hit.at >= 0)
      .sort((a, b) => a.at - b.at)
    if (hits.length === 0) {
      out.push(rest)
      break
    }
    const hit = hits[0]
    if (hit.at > 0) out.push(rest.slice(0, hit.at))
    out.push(
      <span key={`mark-${key++}`} className={`opening__word is-${hit.tone}`}>
        {hit.word}
      </span>,
    )
    rest = rest.slice(hit.at + hit.word.length)
  }
  return <>{out}</>
}
