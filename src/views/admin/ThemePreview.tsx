import DesignPage from './DesignPage'
import './AdminPage.css'
import '../display/DisplayPage.css'

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
