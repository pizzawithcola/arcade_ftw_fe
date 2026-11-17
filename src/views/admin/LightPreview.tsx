/**
 * The arcade in daylight: the app's own elements, recoloured.
 *
 * Every frame below is real markup - `.hud` with its notched bezel, corner
 * brackets, title tab and chevrons; `.wcard` for the welcome line-up; `.ldb` for
 * the board - rendered at 1200×750 and scaled to fit the frame. The only thing
 * that changes is `src/design/light.css`, which remaps the palette under
 * `[data-theme='light']` in `design/light.css`.
 *
 * That is the point of doing it this way: if the recolor is right here, the light
 * mode is a class on the root and a token block, not a second design.
 *
 * What a token swap cannot do by itself, and `light.css` therefore adjusts:
 *   - glows become drop shadows (a red bloom on paper reads as a blur);
 *   - the three rules that put `--c-text` on a red fill are pinned to white;
 *   - the meter bars become tints, because a lit red bar on white looks like an
 *     error state.
 */
import { useEffect, useRef, useState } from 'react'

import '../../design/light.css'
import './LightPreview.css'

/** The screen the frames photograph, before scaling. */
const BASE_WIDTH = 1200

interface Swatch {
  name: string
  value: string
  note: string
}

const PALETTE: Swatch[] = [
  { name: 'canvas', value: '#F5F3EF', note: 'paper, not white' },
  { name: 'surface', value: '#FFFFFF', note: 'panel inside the bezel' },
  { name: 'border', value: '#E2DED8', note: 'every rule' },
  { name: 'text', value: '#1A1A1A', note: '15.7:1 on paper' },
  { name: 'text-muted', value: '#5F5A55', note: '6.2:1' },
  { name: 'brand', value: '#A5000D', note: 'lines and marks' },
  { name: 'brand-deep', value: '#DB0011', note: 'fills; white on it 5.2:1' },
]

const BOARD = [
  { rank: 1, name: 'KH', score: 2313 },
  { rank: 2, name: 'Nanny', score: 2284 },
  { rank: 3, name: 'Ray2', score: 2157 },
  { rank: 4, name: 'RB', score: 2095 },
  { rank: 5, name: 'YK', score: 1999 },
  { rank: 6, name: 'Alisa', score: 1977 },
  { rank: 7, name: 'Cynthia', score: 1946 },
]

const CARDS = [
  { num: '01', name: 'AI Hallucination', icon: '/game_icons/hallucination_icon.PNG' },
  { num: '02', name: 'Data Shadow', icon: '/game_icons/data_icon.PNG' },
  { num: '03', name: 'Ultimate Showdown', icon: '/game_icons/ultimate_icon.PNG' },
]

const OPTIONS = [
  { letter: 'A', text: 'It proves the ruling is real', picked: true },
  { letter: 'B', text: 'It proves nothing at all', picked: false },
  { letter: 'C', text: 'The model is slow today', picked: false },
  { letter: 'D', text: 'The model is being honest', picked: false },
]

/** Scale the 1200px screen to whatever width the frame ended up. */
function useFitScale() {
  const frame = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const measure = () => setScale(element.clientWidth / BASE_WIDTH)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { frame, scale }
}

function Frame({
  caption,
  detail,
  children,
}: {
  caption: string
  detail: string
  children: React.ReactNode
}) {
  const { frame, scale } = useFitScale()
  return (
    <figure className="lt__figure">
      <div className="lt__frame" ref={frame}>
        <div className="lt__screen" data-theme="light" style={{ transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
      <figcaption className="lt__caption">
        <span>{caption}</span>
        <code>{detail}</code>
      </figcaption>
    </figure>
  )
}

export default function LightPreview() {
  return (
    <div className="lt">
      <h3>Light mode · the same screens, recoloured</h3>
      <p className="lt__note">
        Every element here is the one the games already draw - notched bezel, corner brackets,
        title tab, chevrons, chamfered progress segments, the dot matrix, the meter bars, the
        welcome cards. Only the palette changes, plus the three rules a token swap cannot fix:
        <strong> glows become shadows</strong>, type that sits on a red fill is pinned to white,
        and the meter bars become tints because a lit red bar on paper reads as an error.
      </p>

      <ul className="lt__swatches">
        {PALETTE.map((swatch) => (
          <li className="lt__swatch" key={swatch.name}>
            <span className="lt__chip" style={{ background: swatch.value }} aria-hidden="true" />
            <span className="lt__swatch-name">{swatch.name}</span>
            <span className="lt__swatch-value">
              {swatch.value} · {swatch.note}
            </span>
          </li>
        ))}
      </ul>

      <div className="lt__frames">
        <Frame caption="iPad · the Ultimate round" detail="hud chassis, recoloured">
          <div className="hud hud--game quiz">
            <div className="hud__matrix" aria-hidden="true" />
            <div className="hud__frame">
              <div className="hud__inner">
                <span className="hud__corner hud__corner--tl" aria-hidden="true" />
                <span className="hud__corner hud__corner--tr" aria-hidden="true" />
                <span className="hud__corner hud__corner--bl" aria-hidden="true" />
                <span className="hud__corner hud__corner--br" aria-hidden="true" />
                <div className="hud__tab">Quiz</div>
                <div className="hud__bar">
                  <span className="hud__chevrons" aria-hidden="true" />
                  <span className="hud__event">Pick one</span>
                  <span className="quiz__bonus">bonus ×2</span>
                  <span className="quiz__count">2 / 3</span>
                  <span className="quiz__timer">18s</span>
                  <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
                </div>
                <div className="hud__stage quiz__stage">
                  <p className="quiz__from">Phishing and Data Shadow</p>
                  <p className="quiz__question">
                    An AI answer cites a court ruling, with a case name and a year. What does that
                    prove?
                  </p>
                  <div className="quiz__options">
                    {OPTIONS.map((option) => (
                      <div className="quiz__slot" key={option.letter}>
                        <button
                          type="button"
                          className={`quiz__option${option.picked ? ' is-picked' : ''}`}
                        >
                          <span className="quiz__letter">{option.letter}</span>
                          <span className="quiz__optiontext">{option.text}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Frame>

        <Frame caption="Big screen · a round" detail="same chassis, wall scale">
          <div className="hud hud--game hallucination">
            <div className="hud__matrix" aria-hidden="true" />
            <div className="hud__frame">
              <div className="hud__inner">
                <span className="hud__corner hud__corner--tl" aria-hidden="true" />
                <span className="hud__corner hud__corner--tr" aria-hidden="true" />
                <span className="hud__corner hud__corner--bl" aria-hidden="true" />
                <span className="hud__corner hud__corner--br" aria-hidden="true" />
                <div className="hud__tab">Hallucination</div>
                <div className="hud__bar">
                  <span className="hud__chevrons" aria-hidden="true" />
                  <span className="hud__event">Ask the model</span>
                  <span className="hud__status">
                    <span className="hud__dot" aria-hidden="true" />3 / 3
                  </span>
                  <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
                </div>
                <div className="hud__stage hallu__stage">
                  <div className="hallu__prompt">
                    <p className="hallu__label">You asked</p>
                    <p>
                      I need to take my car to the car wash, which is 50 feet from my house. Should
                      I walk or should I drive?
                    </p>
                  </div>
                  <div className="hallu__reply">
                    <p className="hallu__label">Assistant · generated</p>
                    <p>
                      That&rsquo;s simple, you should walk because 50 feet is very close, and better
                      for the environment.
                    </p>
                  </div>
                  {/* The trust slider, exactly as the game draws it. */}
                  <div className="hallu__choices">
                    <p className="hallu__question">
                      Can you trust this AI response, or should you doubt it?
                    </p>
                    <div
                      className="hallu__slider is-trust"
                      style={{ ['--intensity' as string]: 0.4 }}
                    >
                      <div className="hallu__labels" aria-hidden="true">
                        <span className="hallu__label">
                          <span className="hallu__arrow">←</span> Doubt
                        </span>
                        <span className="hallu__label">Not sure</span>
                        <span className="hallu__label is-on">
                          Trust <span className="hallu__arrow">→</span>
                        </span>
                      </div>
                      <div
                        className="hallu__trackwrap"
                        style={
                          {
                            ['--fill-left' as string]: '50%',
                            ['--fill-width' as string]: '30%',
                          } as React.CSSProperties
                        }
                      >
                        <span className="hallu__track" aria-hidden="true">
                          <span className="hallu__ticks" />
                          <span className="hallu__fill" />
                          <span className="hallu__notch" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Frame>

        <Frame caption="Waiting room · welcome" detail="welcome cards, recoloured">
          <div className="welcome welcome--wall">
            <span className="welcome__scan" aria-hidden="true" />
            <div className="welcome__head">
              <p className="welcome__eyebrow">HK Fintech Week</p>
              <h1 className="welcome__title" data-text="AI CYBER ARCADE">
                AI Cyber Arcade
              </h1>
              <span className="welcome__rule is-in" aria-hidden="true" />
              <p className="welcome__sub is-in">Three Games, One Winner!</p>
            </div>
            <ol className="welcome__games" style={{ ['--wgame-cols' as string]: CARDS.length }}>
              {CARDS.map((card) => (
                <li className="wcard is-in" key={card.name}>
                  <span className="wcard__num">{card.num}</span>
                  <img className="wcard__icon" src={card.icon} alt="" draggable={false} />
                  <span className="wcard__name">{card.name}</span>
                  <span className="wcard__line" aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </Frame>

        <Frame caption="Waiting room · leaderboard" detail="meter bars as tints">
          <div className="ldb standby">
            <div className="ldb__rail" aria-hidden="true" />
            <div className="ldb__frame">
              <p className="ldb__live">
                <span className="ldb__pulse" />
                Top players
              </p>
              <div className="ldb__legend standby__legend" aria-hidden="true">
                <div className="standby__legendcol">
                  <span>rank</span>
                  <span>player</span>
                  <span>score</span>
                </div>
              </div>
              <ol className="ldb__list">
                {BOARD.map((row) => (
                  <li className={`ldb__row ${row.rank === 1 ? 'is-rank-1' : ''}`} key={row.name}>
                    <span
                      className="ldb__fill"
                      aria-hidden="true"
                      style={{ ['--fill' as string]: `${Math.round((row.score / BOARD[0].score) * 100)}%` }}
                    />
                    <span className="ldb__rank">{String(row.rank).padStart(2, '0')}</span>
                    <span className="ldb__name">{row.name}</span>
                    <span className="ldb__score">{row.score.toLocaleString('en-US')}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Frame>
      </div>
    </div>
  )
}
