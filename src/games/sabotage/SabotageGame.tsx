import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { sabotageTeam, sabotageVote } from '../../api'
import { useTicker } from '../../hooks/useTicker'
import {
  useGameStore,
  type SabotageBuild,
  type SabotageDomain,
  type SabotageState,
  type SabotageTeam,
} from '../../store/gameStore'
import { CARD_ICONS, deckHasArt } from './cardIcons'
import { revealLine, roundTitle, selectBrief } from './revealCopy'
import './SabotageGame.css'

const DOMAIN_LABEL: Record<SabotageDomain, string> = {
  data: 'Data',
  people: 'People',
  infra: 'Infra',
}

/** How wide a bar is at full strength. Three cards at 3 plus a fourth at 3 is
 *  the theoretical ceiling, so the scale runs to 12. */
const BAR_FULL = 12

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const TEAM_LABEL: Record<SabotageTeam, string> = { red: 'Team A', blue: 'Team B' }

function teamName(team: SabotageTeam | undefined): string {
  return team ? TEAM_LABEL[team].toUpperCase() : '—'
}

/** Round numbers in the game-show register the rest of this screen is written in. */
function roman(value: number): string {
  return ['I', 'II', 'III', 'IV'][value - 1] ?? String(value)
}

/** Money as the players think about it: $14,000, never 14000. */
function money(amount: number): string {
  return `$${Math.max(0, amount).toLocaleString('en-US')}`
}

function roleName(role: string | undefined): string {
  if (role === 'attacker') return 'ATTACKER'
  if (role === 'defender') return 'DEFENDER'
  // A device that signed in after the draw is in no team: say so instead of
  // leaving a dash where the player's job should be.
  return 'SPECTATOR'
}

const DOMAINS: SabotageDomain[] = ['data', 'people', 'infra']

/** One domain on a card: a label, three pips and the number.
 *
 *  Three pips is the whole scale, so the shape of a card reads before the
 *  numbers do - a card that is all pips in one column is a specialist, one
 *  spread over three is a compromise. The round's target row is the only one
 *  that carries the brand, because it is the only one that decides the round. */
function CardVector({ vector }: { vector: [number, number, number] }) {
  return (
    <span className="sab__vec">
      {DOMAINS.map((domain, index) => (
        <span key={domain} className="sab__vecrow">
          <b>{DOMAIN_LABEL[domain]}</b>
          <span className="sab__pips" aria-hidden="true">
            {[0, 1, 2].map((pip) => (
              <i key={pip} className={pip < vector[index] ? 'is-on' : ''} />
            ))}
          </span>
          <em>{vector[index]}</em>
        </span>
      ))}
    </span>
  )
}

function Bars({ vector, target }: { vector: number[]; target: SabotageDomain }) {
  const domains: SabotageDomain[] = ['data', 'people', 'infra']
  return (
    <div className="sab__bars">
      {domains.map((domain, index) => (
        <div key={domain} className={`sab__bar ${domain === target ? 'is-target' : ''}`}>
          <span className="sab__barlabel">{DOMAIN_LABEL[domain]}</span>
          <span className="sab__bartrack">
            <span
              className="sab__barfill"
              style={{ width: `${Math.min(100, ((vector[index] ?? 0) / BAR_FULL) * 100)}%` }}
            />
          </span>
          <span className="sab__barnum">{vector[index] ?? 0}</span>
        </div>
      ))}
    </div>
  )
}

export default function SabotageGame({ room, team }: { room: string; team?: string }) {
  const sabotage = useGameStore((state) => state.sabotage)
  const now = useTicker()

  // My own hand for this round. The team's build comes from the server, which
  // is the only place that knows what everyone voted. The round number is kept
  // beside the cards rather than reset in an effect: a stale hand from the
  // previous round simply does not match, so it reads as empty.
  const round = sabotage?.round ?? 0
  const [hand, setHand] = useState<{ round: number; cards: string[] }>({
    round: -1,
    cards: [],
  })
  const mine = hand.round === round ? hand.cards : []
  const setMine = (cards: string[]) => setHand({ round, cards })
  const [build, setBuild] = useState<SabotageBuild | null>(null)
  const [refused, setRefused] = useState<string | null>(null)

  const phase = sabotage?.phase
  const selecting = phase === 'select'
  // The three phases where the player needs their own side: the draw (which
  // team am I), the rules, and the picks. Outside those, nothing changes.
  const needsTeam = phase === 'team_reveal' || phase === 'brief' || selecting

  const refresh = useCallback(async () => {
    try {
      setBuild(await sabotageTeam(room))
    } catch {
      // Not in the game yet, or the engine is mid-restart: the poll retries.
    }
  }, [room])

  // Polled rather than pushed: the broadcast is public, so a live build on it
  // would hand the other team the answer. This keeps the two sides blind until
  // the reveal, and doubles as the retry when the first ask lands too early.
  useEffect(() => {
    if (!needsTeam) return
    // Prime out of band: a fetch on the effect's synchronous path lands a
    // setState in the same commit, which React asks us not to do.
    const prime = window.setTimeout(() => void refresh(), 200)
    const id = window.setInterval(() => void refresh(), 2000)
    return () => {
      window.clearTimeout(prime)
      window.clearInterval(id)
    }
  }, [needsTeam, refresh, phase])

  const myTeam = (team as SabotageTeam | undefined) ?? build?.team
  const myRole = build && build.team === myTeam ? build.role : undefined

  if (!sabotage) {
    return (
      <div className="hud hud--game">
        <div className="hud__matrix" aria-hidden="true" />
        <div className="hud__frame sab__frame">
          <div className="hud__inner sab__inner">
            <p className="sab__syncing">Setting the board…</p>
          </div>
        </div>
      </div>
    )
  }

  const remaining = sabotage.paused
    ? sabotage.heldMs
    : sabotage.endsAt !== null
      ? Math.max(0, sabotage.endsAt - now)
      : sabotage.remaining_ms

  const deck = build?.deck ?? (sabotage.decks[myTeam ?? 'red'] ?? [])
  const withArt = deckHasArt(deck)
  const mineCost = mine.reduce((sum, id) => sum + (sabotage.cards[id]?.cost ?? 0), 0)
  // The team's money, not this round's: `round_budget` is what it walked in
  // with, so an unvoted hand comes straight off the same number the server
  // charges against.
  const roundBudget = build?.round_budget ?? sabotage.total_budget
  const budgetLeft = roundBudget - mineCost
  const teamVector = build?.vector ?? [0, 0, 0]

  const toggle = (id: string) => {
    if (!selecting) return
    const next = mine.includes(id) ? mine.filter((entry) => entry !== id) : [...mine, id]
    const before = mine
    setMine(next)
    setRefused(null)
    void sabotageVote(room, next)
      .then(() => refresh())
      .catch((error: unknown) => {
        // Put the hand back: a refused vote must not leave the card looking
        // bought while the team's build says otherwise.
        setMine(before)
        setRefused(error instanceof Error ? error.message : 'That hand was refused')
      })
  }

  const fits = (id: string) =>
    mine.includes(id) ||
    (mine.length < 4 && mineCost + (sabotage.cards[id]?.cost ?? 0) <= roundBudget)

  return (
    // The whole screen takes the player's job, not their team: purple for the
    // attacker, blue for the defender. Spectators keep the plain brand.
    <div className={`hud hud--game sab is-${sabotage.phase} ${myRole ? `is-${myRole}` : ''}`}>
      <div className="hud__matrix" aria-hidden="true" />
      <div className="hud__frame sab__frame">
        <div className="hud__inner sab__inner">
          <span className="hud__corner hud__corner--tl" aria-hidden="true" />
          <span className="hud__corner hud__corner--tr" aria-hidden="true" />
          <span className="hud__corner hud__corner--bl" aria-hidden="true" />
          <span className="hud__corner hud__corner--br" aria-hidden="true" />

          <div className="sab__head">
            <span className="sab__headleft">
              <span className="hud__chevrons" aria-hidden="true" />
              {/* The only place the pause shows. It used to sit in the corner of
                  the spend card, where it read as part of the money. */}
              {sabotage.paused && <span className="sab__paused">Game Paused</span>}
            </span>
            <div className="hud__tab">AI Sabotage</div>
            <div className="sab__headright">
              <span className="sab__round">
                R{sabotage.round}/{sabotage.rounds}
              </span>
              <span className={`sab__timer ${remaining <= 10_000 ? 'is-urgent' : ''}`}>
                {clock(remaining)}
              </span>
              <span className="hud__chevrons hud__chevrons--flip" aria-hidden="true" />
            </div>
          </div>

          {sabotage.phase === 'team_reveal' && (
            <div className="sab__intro">
              <p className="sab__kicker">You are</p>
              <p className="sab__teamname">{teamName(myTeam)}</p>
              <p className="sab__role">
                You are{' '}
                <b
                  className={`sab__roleword ${
                    myRole === 'attacker' ? 'is-atk' : myRole === 'defender' ? 'is-def' : ''
                  }`}
                >
                  {roleName(myRole)}
                </b>{' '}
                in round {roman(sabotage.round)}
              </p>
            </div>
          )}

          {sabotage.phase === 'brief' && <Rules sabotage={sabotage} />}

          {/* The colour legend sits at the foot of the draw screen only - it is
              a reminder of where to walk, not part of the rules card. */}
          {sabotage.phase === 'team_reveal' && (
            <p className="sab__legend">
              <span className="sab__legendatk">Purple round to attack</span>
              <span className="sab__legendsep" aria-hidden="true">
                ·
              </span>
              <span className="sab__legenddef">Blue round to defend</span>
            </p>
          )}

          {selecting && (
            <div className="sab__stage">
              {/* Two panels across the top: the story on the left, the money on
                  the right. Reading order is "what is happening" then "what can
                  I still afford", and the hand underneath is where both are
                  acted on. */}
              <div className="sab__top">
                {/* The round's name, then one instruction that starts with who
                    you are. Everything else the header used to carry - the round
                    number, the target badge, who attacks - is gone: the cards are
                    the only thing to act on, so nothing may compete with them. */}
                <div className="sab__scene">
                  <p className="sab__scenetitle">{roundTitle(sabotage.round, sabotage.theme)}</p>
                  <p className="sab__scenebrief">
                    <RoleSentence
                      sentence={selectBrief(sabotage.round, myRole)}
                      role={myRole === 'defender' ? 'Defender' : 'Attacker'}
                    />
                  </p>
                  {!myTeam && (
                    <p className="sab__spectator">
                      You signed in after the teams were drawn, so you are watching this round.
                    </p>
                  )}
                </div>

                {/* The live cost of the hand being assembled. Two numbers, not
                    four: what is left for the match, and what this round costs
                    so far. */}
                <div className="sab__build">
                  <div className="sab__buildhead">
                    <span className="sab__budgetnum">{money(budgetLeft)}</span>
                  </div>
                  <div className="sab__spend">
                    <span className="sab__spendrow is-now">
                      <b>Spend for this round</b>
                      <em>{money(mineCost)}</em>
                    </span>
                  </div>
                  <Bars vector={teamVector} target={sabotage.target} />
                  <div className="sab__buildfoot">
                    <span className="sab__picked">
                      {mine.length} card{mine.length === 1 ? '' : 's'} of 4
                    </span>
                    <span className="sab__tally">
                      {build
                        ? `${build.voters}/${build.members} voted`
                        : 'collecting votes'}
                    </span>
                  </div>
                  {refused && <p className="sab__refused">{refused}</p>}
                </div>
              </div>

              <div className="sab__cards">
                {deck.map((id) => {
                  const card = sabotage.cards[id]
                  if (!card) return null
                  const on = mine.includes(id)
                  const allowed = fits(id)
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`sab__card ${withArt ? 'has-icon' : ''} ${on ? 'is-on' : ''} ${
                        allowed ? '' : 'is-locked'
                      }`}
                      onClick={() => toggle(id)}
                    >
                      {/* Only a fully illustrated deck reserves a slot: a
                          deck with no art starts at the name instead of
                          carrying an empty band under the timer. */}
                      {withArt && (
                        <span className="sab__cardicon">
                          <img src={CARD_ICONS[id]} alt="" decoding="async" />
                        </span>
                      )}
                      <span className="sab__cardtop">
                        <span className="sab__cardname">{card.name}</span>
                      </span>
                      <span className="sab__cardblurb">{card.blurb}</span>
                      {/* Price at the foot of the card, not in the corner: a
                          dollar figure is three times the width of the two-digit
                          number it replaced, and in the corner it squeezed every
                          name down to "Jailbreak the…". */}
                      <span className="sab__cardfoot">
                        <CardVector vector={card.vector} />
                        <span className="sab__cardcost">{money(card.cost)}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

            </div>
          )}

          {sabotage.phase === 'reveal' && sabotage.last_result && (
            <Reveal sabotage={sabotage} myTeam={myTeam} />
          )}

          {(sabotage.phase === 'final' || sabotage.phase === 'done') && (
            <Final sabotage={sabotage} myTeam={myTeam} />
          )}
        </div>
      </div>
    </div>
  )
}

/** The round's instruction with the job word painted in its own colour.
 *
 *  The sentence is the client's, so nothing is rewritten here: the job word is
 *  found inside it and wrapped, which keeps the copy identical with the colours
 *  switched off. */
function RoleSentence({ sentence, role }: { sentence: string | undefined; role: string }) {
  if (!sentence) return null
  const at = sentence.indexOf(role)
  if (at === -1) return <>{sentence}</>
  return (
    <>
      {sentence.slice(0, at)}
      <b className={`sab__roleword ${role === 'Defender' ? 'is-def' : 'is-atk'}`}>{role}</b>
      {sentence.slice(at + role.length)}
    </>
  )
}

/** The rules, on one screen, readable in twenty seconds. */
function Rules({ sabotage }: { sabotage: SabotageState & { endsAt: number | null; heldMs: number } }) {
  const step = (index: number) => ({ '--step': index }) as CSSProperties
  return (
    <div className="sab__rules">
      <h2 className="sab__rulestitle sab__rulestep" style={step(0)}>
        Four Rounds, One Team Wins
      </h2>
      <ul className="sab__rulelist">
        <li className="sab__rulestep" style={step(1)}>
          Your team will share a <b>{money(sabotage.total_budget)}</b> budget for all four
          rounds
        </li>
        <li className="sab__rulestep" style={step(2)}>
          You will switch between <b className="is-atk">Attacker</b> and{' '}
          <b className="is-def">Defender</b>
        </li>
        <li className="sab__rulestep" style={step(3)}>
          Choose your cards to build your <b className="is-atk">Attack</b> /{' '}
          <b className="is-def">Defense</b>, up to four cards each round
        </li>
        <li className="sab__rulestep" style={step(4)}>
          Discuss with your teammates, for the best combination
        </li>
      </ul>
      <p className="sab__rulesfoot sab__rulestep" style={step(5)}>
        Sharpest Spear vs Most Balanced Shield
      </p>
    </div>
  )
}

function Reveal({
  sabotage,
  myTeam,
}: {
  sabotage: SabotageState & { endsAt: number | null; heldMs: number }
  myTeam: SabotageTeam | undefined
}) {
  const result = sabotage.last_result
  if (!result) return null
  const attacker = result.attacker
  const defender = result.defender
  // A device with no team (a spectator) reads the attack's side of the story.
  const asAttacker = myTeam === undefined || myTeam === attacker
  const mineWon = result.winner !== null && result.winner === myTeam
  const rows: SabotageDomain[] = ['data', 'people', 'infra']

  // The headline is the same fact told from whichever side is holding the
  // tablet: breaking the target is a success for one and a failure for the
  // other, and "Narrow breach" said neither of those things to either of them.
  const headline = asAttacker
    ? result.broke_target
      ? 'Successfully Attacked'
      : 'Attack Failed'
    : result.broke_target
      ? 'Defense Failed'
      : 'Successfully Defended'

  return (
    <div
      className={`sab__reveal ${result.broke_target ? 'is-breached' : 'is-held'} ${
        myTeam ? (mineWon ? 'is-my-win' : 'is-my-loss') : ''
      }`}
    >
      <p className="sab__verdict">{headline}</p>

      {/* One row a column: the two numbers first, then one sentence in this
          side's voice, then the win or the loss of that column. The target is
          the only row that carries the brand, because it is the row that
          decided the round. */}
      <ul className="sab__lines">
        {rows.map((domain) => {
          const dim = result.dims.find((entry) => entry.domain === domain)
          if (!dim) return null
          const broke = dim.result === 'break'
          const line = revealLine(result.round, domain, broke, asAttacker)
          const mine = asAttacker ? broke : !broke
          return (
            <li
              key={domain}
              className={`sab__line is-${dim.result} ${dim.target ? 'is-target' : ''}`}
            >
              <span className="sab__linename">{DOMAIN_LABEL[domain]}</span>
              <span className="sab__linescore">
                <b className={broke ? 'is-ahead' : ''}>{dim.attack}</b>
                <em>vs</em>
                <b className={!broke ? 'is-ahead' : ''}>{dim.defence}</b>
              </span>
              <span className="sab__linetext">{line}</span>
              <span className={`sab__linewin ${mine ? 'is-win' : 'is-lose'}`}>
                {mine ? 'WIN' : 'LOSE'}
              </span>
            </li>
          )
        })}
      </ul>

      {/* Both sides on one line each: what the round paid, then what it cost
          and what it left. Read across, the two columns are the whole round. */}
      <div className="sab__score">
        <span className={`sab__scorecol ${attacker === myTeam ? 'is-me' : ''}`}>
          <span className="sab__scorewho">
            Attacker{attacker === myTeam ? ' (You)' : ''}
          </span>
          <span className="sab__scorepts">+{result.points[attacker]}</span>
          <span className="sab__scorespend">
            {money(result.attack_cost)} spent ({money(sabotage.budget[attacker] ?? 0)} left)
          </span>
        </span>
        <span className="sab__scorediv" aria-hidden="true">:</span>
        <span className={`sab__scorecol ${defender === myTeam ? 'is-me' : ''}`}>
          <span className="sab__scorewho">
            Defender{defender === myTeam ? ' (You)' : ''}
          </span>
          <span className="sab__scorepts">+{result.points[defender]}</span>
          <span className="sab__scorespend">
            {money(result.defence_cost)} spent ({money(sabotage.budget[defender] ?? 0)} left)
          </span>
        </span>
      </div>
    </div>
  )
}

function Final({
  sabotage,
  myTeam,
}: {
  sabotage: SabotageState & { endsAt: number | null; heldMs: number }
  myTeam: SabotageTeam | undefined
}) {
  const red = sabotage.scores.red ?? 0
  const blue = sabotage.scores.blue ?? 0
  const leader = red === blue ? null : red > blue ? 'red' : 'blue'
  const mine = myTeam ? sabotage.scores[myTeam] : 0
  return (
    <div className="sab__finale">
      <p className="sab__kicker">Final score</p>
      <div className="sab__finalscore">
        <span className={`is-red ${leader === 'red' ? 'is-ahead' : ''}`}>{red}</span>
        <span className="sab__finaldash">—</span>
        <span className={`is-blue ${leader === 'blue' ? 'is-ahead' : ''}`}>{blue}</span>
      </div>
      <p className="sab__role">
        {leader ? `${TEAM_LABEL[leader]} wins` : 'Drawn'} · your side scored {mine}
      </p>
      <ol className="sab__recap">
        {sabotage.history.map((entry) => (
          <li key={entry.round} className={entry.winner && entry.winner === myTeam ? 'is-mine' : ''}>
            <span className="sab__recapround">R{entry.round}</span>
            <span className="sab__recaptheme">{entry.theme}</span>
            <span className="sab__recapout">{entry.outcome}</span>
            <span className="sab__recappts">
              {entry.points.red}—{entry.points.blue}
            </span>
          </li>
        ))}
      </ol>
      <p className="sab__sidenote">
        {TEAM_LABEL.red} finished with {money(sabotage.budget.red ?? 0)} · {TEAM_LABEL.blue}{' '}
        with {money(sabotage.budget.blue ?? 0)}
      </p>
      <p className="sab__sidenote">Your team score is already on the board.</p>
    </div>
  )
}
