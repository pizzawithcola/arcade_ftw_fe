import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties } from 'react'

import { findOpening } from '../../games/openings'
import { BLOCKS, IMAGES, LEAKS, POST_META } from '../../games/dataShadow/content'
import { targetCount } from '../../games/dataShadow/scoring'
import { ReportKindIcon } from '../../games/dataShadow/ReportKindIcon'
import DesignPage from './DesignPage'
import './AdminPage.css'
import '../display/DisplayPage.css'
import '../hud.css'
import '../../games/hallucination/HallucinationGame.css'
import '../../games/quiz/QuizGame.css'
import '../../games/dataShadow/DataShadowGame.css'

/**
 * Every console block on one page, with no sign-in and no socket.
 *
 * The console needs an admin password and a live room before it renders
 * anything, which makes it the slowest screen to check a colour change against.
 * This page paints the same class names with static content, so the theme can be
 * reviewed in one screenshot. Development only - it is not worth a route in the
 * shipped bundle.
 */
const PHASES = ['waiting', 'playing', 'paused', 'finished'] as const
const PHASE_LABELS: Record<(typeof PHASES)[number], string> = {
  waiting: 'Waiting',
  playing: 'Live',
  paused: 'Paused',
  finished: 'Finished',
}
const ACTIONS = ['start', 'pause', 'resume', 'finish', 'reset']

const JUMP_GROUPS = [
  { title: 'Hallucination', buttons: ['challenge', 'quiz', 'ranking'] },
  { title: 'Data', buttons: ['challenge', 'quiz', 'ranking'] },
  { title: 'Sabotage', buttons: ['challenge', 'ranking'] },
  { title: 'Ultimate', buttons: ['quiz', 'ranking'] },
]

const ROWS = [
  { code: 'R-007', created: '10/29/2026, 11:02:19 AM', players: 8, state: 'open', current: true },
  { code: 'R-006', created: '10/28/2026, 5:14:24 PM', players: 4, state: 'open', current: false },
  { code: 'R-005', created: '10/25/2026, 11:25:04 PM', players: 8, state: 'closed', current: false },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="admin__panel">
      <div className="admin__panel-head">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  )
}

/** The picture strip, with the same tap-to-enlarge behaviour as the real game. */
function PreviewGallery() {
  const [zoomed, setZoomed] = useState<string | null>(null)
  const [flagged, setFlagged] = useState<string[]>([])
  const toggle = (id: string) =>
    setFlagged((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  return (
    <>
      <div className="post__gallery">
        {IMAGES.map((image) => (
          <figure className={`post__shot ${flagged.includes(image.id) ? 'is-flagged' : ''}`} key={image.id}>
            <button
              type="button"
              className="post__shotview"
              onClick={() => setZoomed((current) => (current === image.id ? null : image.id))}
            >
              <img className="post__shotimg" src={image.src} alt="" loading="lazy" />
            </button>
            <figcaption className="post__shotcap">{image.label}</figcaption>
            <button
              type="button"
              className="post__shotflag"
              aria-pressed={flagged.includes(image.id)}
              aria-label="Add picture to report"
              onClick={() => toggle(image.id)}
            >
              {flagged.includes(image.id) ? (
                '✓'
              ) : (
                <svg
                  className="post__shoticon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M12 5.4v8.8" />
                  <circle cx="12" cy="18.5" r="1.4" />
                </svg>
              )}
            </button>
          </figure>
        ))}
      </div>
      {zoomed &&
        createPortal(
          <div className="shotzoom" onClick={() => setZoomed(null)}>
            <figure className="shotzoom__frame">
              <img
                className="shotzoom__img"
                src={IMAGES.find((i) => i.id === zoomed)?.src}
                alt={IMAGES.find((i) => i.id === zoomed)?.alt}
              />
              <figcaption className="shotzoom__hint">tap anywhere to close</figcaption>
            </figure>
          </div>,
          document.body,
        )}
    </>
  )
}

export default function ThemePreview() {
  return (
    <main className="admin">
      <div className="admin__bar">
        <h1>Arcade FTW · Theme</h1>
        <span className="admin__current">dev only · no auth · no room</span>
      </div>

      <div className="admin__shell">
        <nav className="admin__side" aria-label="Sections">
          <button type="button" className="is-active">
            <span className="admin__side-label">Arcade Console</span>
            <span className="admin__side-note">Run the show</span>
          </button>
          <button type="button">
            <span className="admin__side-label">Arcade Data</span>
            <span className="admin__side-note">Rooms and players</span>
          </button>
          <button type="button">
            <span className="admin__side-label">Game Setting</span>
            <span className="admin__side-note">Coming later</span>
          </button>
          <button type="button">
            <span className="admin__side-label">Design</span>
            <span className="admin__side-note">Tokens and palette</span>
          </button>
        </nav>

        <div className="admin__content">
          <section className="admin__panel">
            <div className="admin__panel-head">
              <h2>Show control</h2>
              <div className="admin__head-tools">
                <div className="admin__toggle admin__toggle--screens">
                  <button type="button" className="is-active">
                    display
                  </button>
                  <button type="button">player</button>
                </div>
                <span className="admin__current">
                  room <strong>R-007</strong>
                </span>
                <button type="button" className="admin__new-round">
                  new room
                </button>
              </div>
            </div>

            <div className="admin__stage">
              <div className="admin__state">
                <p className="admin__node">
                  Hallucination
                  <span className="admin__node-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="admin__phase is-playing">{PHASE_LABELS.playing}</span>
                </p>
                <p className="admin__hint">8 joined · 2 online</p>
                <div className="admin__controls admin__controls--stacked">
                  {ACTIONS.map((action) => (
                    <button key={action} type="button">
                      {action}
                    </button>
                  ))}
                </div>
              </div>
              <div className="admin__tv">
                <p className="admin__placeholder">screen preview</p>
              </div>
            </div>

            <div className="admin__progress">
              <p className="admin__hint">Jump straight to a node instead of waiting for the clock:</p>
              <div className="admin__jumps">
                {JUMP_GROUPS.map((group) => (
                  <div className="admin__jumpgroup" key={group.title}>
                    <span className="admin__jumpgroup-title">{group.title}</span>
                    <div className="admin__jumpgroup-buttons">
                      {group.buttons.map((button, index) => (
                        <button
                          key={button}
                          type="button"
                          className={index === 0 && group.title === 'Hallucination' ? 'is-current' : ''}
                        >
                          {button}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <Section title="Show states">
            <p className="admin__hint">
              {PHASES.map((phase) => (
                <span key={phase} className={`admin__phase is-${phase}`}>
                  {PHASE_LABELS[phase]}{' '}
                </span>
              ))}
            </p>
            <p className="admin__error">A failed action reports here.</p>
          </Section>

          <section className="admin__panel">
            <div className="admin__panel-head">
              <h2>Arcade Data</h2>
              <div className="admin__toggle">
                <button type="button" className="is-active">
                  Rooms
                </button>
                <button type="button">Players</button>
              </div>
            </div>
            <p className="admin__table-note">
              3 rooms · newest first · a room is one-shot: it records who joined, then closes
            </p>

            <div className="admin__editor">
              <span className="admin__editor-title">New player</span>
              <label>
                Nickname
                <input defaultValue="NeonFox" />
              </label>
              <label>
                Event
                <select defaultValue="cyber">
                  <option value="cyber">Cyber</option>
                </select>
              </label>
              <div className="admin__editor-actions">
                <button type="submit">save</button>
                <button type="button">cancel</button>
              </div>
            </div>

            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Created</th>
                    <th>Players</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.code} className={row.current ? 'is-current' : ''}>
                      <td>{row.code}</td>
                      <td>{row.created}</td>
                      <td className={row.players === 0 ? 'admin__dim' : ''}>{row.players}</td>
                      <td>{row.state}</td>
                      <td>
                        <div className="admin__row-actions">
                          <button type="button">delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin__panel-head" style={{ marginTop: '0.9rem' }}>
              <h2>Standings</h2>
              <button type="button" className="admin__create">
                create
              </button>
            </div>
            <div className="admin__table-wrap">
              <table className="admin__table">
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>NeonFox</td>
                    <td>4200</td>
                    <td className="admin__total">4200</td>
                  </tr>
                  <tr>
                    <td>2</td>
                    <td>ByteMe</td>
                    <td>3100</td>
                    <td className="admin__total">3100</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <Section title="Opening · rules half">
            <p className="admin__hint">
              The last 12s of the 15s opening: the name has already held for 3s, then
              these points arrive one at a time.
            </p>
            {['hallucination'].map((key) => {
              const entry = findOpening(key)
              if (!entry) return null
              return (
                <div className="hud hud--brief" key={key}>
                  <div className="hud__matrix" aria-hidden="true" />
                  <div className="hud__frame">
                    <div className="hud__inner">
                      <span className="hud__corner hud__corner--tl" aria-hidden="true" />
                      <span className="hud__corner hud__corner--tr" aria-hidden="true" />
                      <span className="hud__corner hud__corner--bl" aria-hidden="true" />
                      <span className="hud__corner hud__corner--br" aria-hidden="true" />
                      <div className="hud__tab">How to play</div>
                      <div className="hud__bar">
                        <span className="hud__chevrons" aria-hidden="true" />
                        <span className="hud__event">{entry.name}</span>
                        <span className="hud__status">
                          <span className="hud__dot" aria-hidden="true" />
                          briefing
                        </span>
                        <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
                      </div>
                      <div className="hud__stage hud__stage--brief">
                        <ul className="brief__rules">
                          {(entry.rules ?? []).map((rule) => {
                            const line = typeof rule === 'string' ? rule : rule.text
                            return <li key={line}>{line}</li>
                          })}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </Section>

          <Section title="Hallucination · chat">
            <div className="hud hud--game hallu">
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
                    <span className="hallu__count">1 / 2</span>
                    <span className="hallu__timer">28s</span>
                  </div>
                  <div className="hud__stage hallu__stage">
                    <div className="chat">
                      <div className="chat__ask">
                        <span className="chat__avatar" aria-hidden="true">
                          <span className="chat__avatar-head" />
                          <span className="chat__avatar-body" />
                        </span>
                        <div className="chat__bubble">
                          <span className="chat__who">You asked</span>
                          <p className="chat__text">
                            I want to wash my car at car wash which is 50 feet away from my house,
                            should I walk there or drive there?
                          </p>
                        </div>
                      </div>
                      <div className="chat__answer">
                        <div className="chat__aihead">
                          <span className="chat__aibadge" aria-hidden="true" />
                          <span className="chat__ainame">Assistant</span>
                          <span className="chat__aistamp">generated · unverified</span>
                        </div>
                        <p className="chat__text chat__text--ai">
                          That&apos;s simple, you should walk because 50 feet is very close, and
                          better for the environment.
                        </p>
                        <div className="chat__actions">
                          <button type="button" className="chat__action" title="Good answer">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.3a2 2 0 0 0 2-1.7l1.4-9a2 2 0 0 0-2-2.3z" />
                              <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                            </svg>
                          </button>
                          <button type="button" className="chat__action" title="Bad answer">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.7a2 2 0 0 0-2 1.7l-1.4 9a2 2 0 0 0 2 2.3z" />
                              <path d="M17 2h2.3A2.3 2.3 0 0 1 22 4.3v7A2.3 2.3 0 0 1 19.3 14H17" />
                            </svg>
                          </button>
                          <button type="button" className="chat__action" title="Copy the answer">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="9" y="9" width="12" height="12" rx="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="hallu__choices">
                      <p className="hallu__question">How much do you trust this answer?</p>
                      {/* The live control is a drag scale, so the preview shows the
                          same widget at a sample setting rather than a mock-up. */}
                      <div className="hallu__slider is-trust">
                        <div className="hallu__labels" aria-hidden="true">
                          <span className="hallu__label">Doubt</span>
                          <span className="hallu__label">Not sure</span>
                          <span className="hallu__label is-on">Trust</span>
                        </div>
                        <div
                          className="hallu__trackwrap"
                          style={
                            { '--fill-left': '15%', '--fill-width': '35%' } as CSSProperties
                          }
                        >
                          <span className="hallu__track" aria-hidden="true">
                            <span className="hallu__ticks" />
                            <span className="hallu__fill" />
                            <span className="hallu__notch" />
                          </span>
                          <input
                            type="range"
                            className="hallu__range"
                            min={-200}
                            max={200}
                            step={10}
                            defaultValue={140}
                            aria-label="Trust scale preview"
                          />
                        </div>
                        <p className="hallu__readout">
                          <span className="hallu__gain">+140</span>
                          <span className="hallu__gainnote">
                            if you are correct · −70 if you are wrong
                          </span>
                        </p>
                      </div>
                      <p className="hallu__hint">
                        Drag left to doubt, right to trust. Every step is +10.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Data Shadow · readable post">
            <p className="admin__hint">
              Dark like the rest of the app, but the post itself stays plain: no glow, no display
              face, no red inside the card. It has to read as an ordinary social post.
            </p>
            <div className="hud hud--game shadow">
              <div className="hud__matrix" aria-hidden="true" />
              <div className="hud__frame shadow__frame">
                <div className="hud__inner shadow__inner">
                  <span className="hud__corner hud__corner--tl" aria-hidden="true" />
                  <span className="hud__corner hud__corner--tr" aria-hidden="true" />
                  <span className="hud__corner hud__corner--bl" aria-hidden="true" />
                  <span className="hud__corner hud__corner--br" aria-hidden="true" />
                  <div className="shadow__head">
                    <span className="hud__chevrons" aria-hidden="true" />
                    <div className="hud__tab">Data Shadow</div>
                    <div className="shadow__headright">
                      <span className="shadow__timer">32s</span>
                      <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="hud__stage shadow__stage">
                    <div className="shadow__main">
                      <p className="shadow__task">
                        Drag to select the words that should never have been posted.
                      </p>
                      <article className="post">
                        <header className="post__head">
                          <span className="post__avatar">{POST_META.initials}</span>
                          <span className="post__who">
                            <span className="post__name">{POST_META.author}</span>
                            <span className="post__headline">{POST_META.headline}</span>
                            <span className="post__time">
                              {POST_META.ago} · <span className="post__globe">🌐</span>
                            </span>
                          </span>
                        </header>
                        <div className="post__body">
                          {BLOCKS.slice(0, 4).map((text, index) => (
                            <p className="post__para" key={index}>
                              {text}
                            </p>
                          ))}
                        </div>
                        <PreviewGallery />
                        <footer className="post__foot">
                          <span className="post__reactions">
                            <span>👍</span>
                            <span>❤️</span>
                            <span>💡</span>
                            <span className="post__count">{POST_META.reactions}</span>
                          </span>
                          <span className="post__count">{POST_META.comments} comments</span>
                        </footer>
                      </article>
                    </div>
                    <aside className="report">
                      <header className="report__head">
                        <h2 className="report__title">Your report</h2>
                        <span className="report__count">
                          2<span className="report__total">/{targetCount(LEAKS, IMAGES)}</span>
                        </span>
                      </header>
                      <div className="report__list">
                        <div className="report__item">
                          <ReportKindIcon kind="text" />
                          <span className="report__text">“2.4 million conversations”</span>
                          <button type="button" className="report__remove" aria-label="Remove">
                            ×
                          </button>
                        </div>
                        <div className="report__item report__item--shot">
                          <ReportKindIcon kind="image" />
                          <span className="report__text">Meeting Memory</span>
                          <button type="button" className="report__remove" aria-label="Remove">
                            ×
                          </button>
                        </div>
                      </div>
                      <footer className="report__foot">
                        <button type="button" className="report__submit">
                          Submit report
                        </button>
                      </footer>
                    </aside>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Data Shadow · on the wall">
            <p className="admin__hint">
              The wall uses the same dark card and puts it straight under the bar, so a long post
              is never pushed out of the panel.
            </p>
            <div className="hud hud--display hud--stage">
              <div className="hud__matrix" aria-hidden="true" />
              <div className="hud__frame">
                <div className="hud__inner">
                  <span className="hud__corner hud__corner--tl" aria-hidden="true" />
                  <span className="hud__corner hud__corner--tr" aria-hidden="true" />
                  <span className="hud__corner hud__corner--bl" aria-hidden="true" />
                  <span className="hud__corner hud__corner--br" aria-hidden="true" />
                  <div className="hud__tab">Arcade FTW</div>
                  <div className="hud__bar">
                    <span className="hud__chevrons" aria-hidden="true" />
                    <span className="hud__event">Data Shadow</span>
                    <span className="hud__status">
                      <span className="hud__dot" aria-hidden="true" />
                      live
                    </span>
                    <span className="display__clock">0:41</span>
                    <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
                  </div>
                  <div className="hud__stage display__stage" data-screen="data_shadow">
                    <article className="display__post">
                      <header className="display__posthead">
                        <span className="display__avatar">{POST_META.initials}</span>
                        <span>
                          <strong>{POST_META.author}</strong>
                          <em>{POST_META.headline}</em>
                        </span>
                      </header>
                      {BLOCKS.slice(0, 5).map((text, index) => (
                        <p key={index}>{text}</p>
                      ))}
                    </article>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Quiz">
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
                    <span className="quiz__count">1 / 2</span>
                    <span className="quiz__timer">18s</span>
                  </div>
                  <div className="hud__stage quiz__stage">
                    <p className="quiz__question">
                      What is the primary risk of AI hallucination?
                    </p>
                    <div className="quiz__options">
                      <button type="button" className="quiz__option is-answer">
                        <span className="quiz__letter">A</span>
                        <span className="quiz__optiontext">
                          AI generates false but convincing information
                        </span>
                      </button>
                      <button type="button" className="quiz__option is-wrong">
                        <span className="quiz__letter">B</span>
                        <span className="quiz__optiontext">AI models become too fast to control</span>
                      </button>
                      <button type="button" className="quiz__option">
                        <span className="quiz__letter">C</span>
                        <span className="quiz__optiontext">AI deletes its training data</span>
                      </button>
                      <button type="button" className="quiz__option">
                        <span className="quiz__letter">D</span>
                        <span className="quiz__optiontext">AI refuses to answer questions</span>
                      </button>
                    </div>
                    <div className="quiz__reveal is-bad">
                      <p className="quiz__explain">
                        Fluency is not evidence: a model produces a confident sentence as easily as
                        a correct one, and the confidence is the least reliable signal it gives you.
                      </p>
                      <p className="quiz__correct">The answer was A.</p>
                      <p className="quiz__autonext">Next question in 5s</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Game states">
            <p className="admin__hint">Hallucination · five steps from doubt to trust</p>
            <div className="admin__jumps">
              <button type="button">very doubt</button>
              <button type="button">doubt</button>
              <button type="button">not sure</button>
              <button type="button">partial trust</button>
              <button type="button">full trust</button>
            </div>
            <p className="admin__hint">Quiz · wrong pick earns the red, the answer stays white</p>
            <div className="admin__jumps">
              <button type="button">picked</button>
              <button type="button" className="is-current">
                answer
              </button>
              <button type="button">wrong</button>
            </div>
            <p className="admin__hint">Sabotage · red team and the second team</p>
            <div className="admin__jumps">
              <button type="button" className="is-current">
                red
              </button>
              <button type="button">blue</button>
            </div>
          </Section>

          <DesignPage />
        </div>
      </div>
    </main>
  )
}
