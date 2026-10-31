import { GAME_ORDER } from './openings'
import './Welcome.css'

/**
 * The opening screen: what tonight is, and the four games it is made of.
 *
 * Nothing used to be here. The intro node fell through to the generic
 * placeholder, so the one moment with the whole room's attention showed the
 * words "Placeholder screen" - and then the first game arrived with no map for
 * it. This lays that map out: a name, a promise, then one card per game rising
 * into place.
 *
 * The reveal is driven by the caller's elapsed clock rather than by CSS
 * `animation-delay`, because the operator can pause the show: a paused welcome
 * has to stop mid-reveal, not keep unpacking itself off-screen. CSS owns each
 * card's own entrance; the clock only decides when a card is allowed to start.
 *
 * Both screens render this, `size` being the only difference, so the wall and
 * every iPad unfurl the same list at the same moment.
 */

/**
 * When the subhead lands, when the first card does, and the beat between them.
 *
 * The four cards have to be finished by the fifth second of a ten-second node:
 * each one lands in 520ms and sweeps its rule for another 880ms, so the last
 * card (1.2 + 3 x 0.9 = 3.9s) is fully settled at 4.8s and the footer has
 * arrived with it. The remaining five seconds are for reading, not animation.
 */
const SUBHEAD_AT = 500
const CARD_AT = 1200
const CARD_STAGGER = 900
const FOOTER_AT = 4200

export default function Welcome({
  elapsedMs,
  size = 'device',
}: {
  elapsedMs: number
  size?: 'device' | 'display'
}) {
  const shown = (at: number) => elapsedMs >= at
  const lastCardDone = CARD_AT + (GAME_ORDER.length - 1) * CARD_STAGGER

  return (
    <div className={`welcome welcome--${size}`}>
      <span className="welcome__scan" aria-hidden="true" />

      <header className="welcome__head">
        <p className="welcome__kicker">
          <span className="welcome__dot" aria-hidden="true" />
          {GAME_ORDER.length} games · one board
        </p>
        {/* The one red-lit thing on the screen, exactly as on the game cards:
            the brand marks the name, never the copy. */}
        <h1 className="welcome__title" data-text="AI CYBER ARCADE">
          AI CYBER ARCADE
        </h1>
        <span className={`welcome__rule ${shown(SUBHEAD_AT) ? 'is-in' : ''}`} aria-hidden="true" />
        <p className={`welcome__sub ${shown(SUBHEAD_AT) ? 'is-in' : ''}`}>
          Four games. Four scores. One winner at the end of the night.
        </p>
      </header>

      {/* All four slots exist from the first frame, transparent until their turn:
          mounting them late would shove the footer up as each one arrived. */}
      <ol className="welcome__games">
        {GAME_ORDER.map((game, index) => {
          const at = CARD_AT + index * CARD_STAGGER
          return (
            <li key={game.key} className={`wcard ${shown(at) ? 'is-in' : ''}`} aria-hidden={!shown(at)}>
              <span className="wcard__num">{String(index + 1).padStart(2, '0')}</span>
              {/* The mark carries what the game is at a glance; a sentence
                  under the name was never read from the back of the room. */}
              <img className="wcard__icon" src={game.icon} alt="" draggable={false} />
              <span className="wcard__name">{game.name}</span>
              <span className="wcard__line" aria-hidden="true" />
            </li>
          )
        })}
      </ol>

      <p className={`welcome__foot ${shown(lastCardDone) && shown(FOOTER_AT) ? 'is-in' : ''}`}>
        A ranking after every game — and Sabotage splits the room into two teams.
      </p>
    </div>
  )
}
