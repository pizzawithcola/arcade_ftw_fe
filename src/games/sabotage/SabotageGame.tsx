import { useCallback, useEffect, useState } from 'react'
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

function teamName(team: SabotageTeam | undefined): string {
  return team === 'red' ? 'RED' : team === 'blue' ? 'BLUE' : '—'
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
            <span className="hud__chevrons" aria-hidden="true" />
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
              <p className={`sab__teamname is-${myTeam ?? 'red'}`}>{teamName(myTeam)}</p>
              <p className="sab__role">
                {roleName(myRole)} in round {sabotage.round}
              </p>
              <p className="sab__sidenote">
                {build ? `${build.members} on your side` : 'Finding your side'} · sit with
                your team
              </p>
            </div>
          )}

          {sabotage.phase === 'brief' && <Rules sabotage={sabotage} />}

          {selecting && (
            <div className="sab__stage">
              {/* Two panels across the top: the story on the left, the money on
                  the right. Reading order is "what is happening" then "what can
                  I still afford", and the hand underneath is where both are
                  acted on. */}
              <div className="sab__top">
                {/* Which round, who attacks, what it is scored on, and the one
                    line that says what is happening. A player who reads nothing
                    else on this screen still knows what they are doing. */}
                <div className="sab__scene">
                  <div className="sab__scenehead">
                    <span className="sab__sceneround">
                      Round {sabotage.round} of {sabotage.rounds}
                    </span>
                    <span className="sab__sceneattacker">
                      {sabotage.attacker.toUpperCase()} attacks
                    </span>
                    <span className={`sab__targetbadge is-${sabotage.target}`}>
                      Target · {DOMAIN_LABEL[sabotage.target]}
                    </span>
                    <span className={`sab__myrole is-${myRole ?? 'spectator'}`}>
                      You are {roleName(myRole).toLowerCase()}
                    </span>
                  </div>
                  <p className="sab__scenetitle">{sabotage.theme}</p>
                  <p className="sab__scenebrief">
                    {myRole === 'defender' ? sabotage.defence_brief : sabotage.attack_brief}
                  </p>
                  {!myTeam && (
                    <p className="sab__spectator">
                      You signed in after the teams were drawn, so you are watching this round.
                    </p>
                  )}
                </div>

                {/* The live cost of the hand being assembled: what the team has
                    already committed, what this round costs so far, and what is
                    left to spend for the rest of the match. */}
                <div className="sab__build">
                  <div className="sab__buildhead">
                    <span className="sab__buildlabel">Live spend</span>
                    <span className="sab__budgetnum">{money(budgetLeft)}</span>
                    <span className="sab__budgetlabel">left for all four rounds</span>
                  </div>
                  <div className="sab__spend">
                    <span className="sab__spendrow">
                      <b>Earlier rounds</b>
                      <em>{money(build?.spent ?? 0)}</em>
                    </span>
                    <span className="sab__spendrow is-now">
                      <b>This round</b>
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

/** The rules, on one screen, readable in twenty seconds. */
function Rules({ sabotage }: { sabotage: SabotageState & { endsAt: number | null; heldMs: number } }) {
  return (
    <div className="sab__rules">
      <h2 className="sab__rulestitle">Four rounds. One budget.</h2>
      <ul className="sab__rulelist">
        <li>
          Your team has <b>{money(sabotage.total_budget)}</b> for <b>all four rounds</b>. What
          you spend now is gone in round four.
        </li>
        <li>
          Every card scores in three areas: <b>Data</b>, <b>People</b>, <b>Infra</b>. Cards cost
          <b> $1,000 to $14,000</b>.
        </li>
        <li>
          Each round names <b>one target</b>. Only that column decides who wins the round.
        </li>
        <li>
          Up to <b>4 cards a round</b>. A dearer card is not a stronger one.
        </li>
        <li>
          Your team votes; the most-voted cards get bought. <b>Talk to each other.</b>
        </li>
      </ul>
      <p className="sab__rulesfoot">
        Four rounds: attack, defend, attack, defend · round 1 is{' '}
        <b>{sabotage.theme}</b> · target <b>{DOMAIN_LABEL[sabotage.target]}</b> ·{' '}
        {sabotage.attacker.toUpperCase()} attacks
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
  const iWon = result.winner !== null && result.winner === myTeam
  const attacker = result.attacker
  const defender = result.defender
  const rows: SabotageDomain[] = ['data', 'people', 'infra']
  return (
    <div className={`sab__reveal ${result.broke_target ? 'is-breached' : 'is-held'}`}>
      <p className="sab__verdict">{result.outcome.toUpperCase()}</p>
      <p className="sab__verdictsub">
        {attacker.toUpperCase()} attacked {defender.toUpperCase()} on{' '}
        {DOMAIN_LABEL[result.target].toUpperCase()}
      </p>

      <div className="sab__dims">
        {rows.map((domain, index) => {
          const dim = result.dims.find((entry) => entry.domain === domain)
          if (!dim) return null
          return (
            <div
              key={domain}
              className={`sab__dim is-${dim.result} ${dim.target ? 'is-target' : ''}`}
            >
              <span className="sab__dimname">{DOMAIN_LABEL[rows[index]]}</span>
              <span className="sab__dimnum">{dim.attack}</span>
              <span className="sab__dimvs">vs</span>
              <span className="sab__dimnum">{dim.defence}</span>
              <span className="sab__dimmark">
                {dim.result === 'break' ? 'BREACH' : dim.result === 'tie' ? 'TIE' : 'HELD'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="sab__points">
        <span className={attacker === myTeam ? 'is-me' : ''}>
          {attacker.toUpperCase()} +{result.points[attacker]}
        </span>
        <span className={defender === myTeam ? 'is-me' : ''}>
          {defender.toUpperCase()} +{result.points[defender]}
        </span>
      </div>
      <p className="sab__spend">
        {attacker.toUpperCase()} spent {money(result.attack_cost)} · {defender.toUpperCase()}{' '}
        spent {money(result.defence_cost)}
      </p>
      <p className="sab__spend">
        Left to spend — RED {money(sabotage.budget.red ?? 0)} · BLUE{' '}
        {money(sabotage.budget.blue ?? 0)}
      </p>
      <p className="sab__verdictsub">
        {result.void
          ? 'Neither side bought a card, so the round scores nothing'
          : myTeam
            ? iWon
              ? 'Your side won the round'
              : 'Your side lost the round'
            : ''}
      </p>
      {sabotage.no_bid?.[result.attacker] && (
        <p className="sab__nobid">{result.attacker.toUpperCase()} bought no cards</p>
      )}
      {sabotage.no_bid?.[result.defender] && (
        <p className="sab__nobid">{result.defender.toUpperCase()} bought no cards</p>
      )}
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
        {leader ? `${leader.toUpperCase()} wins` : 'Drawn'} · your side scored {mine}
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
        Red finished with {money(sabotage.budget.red ?? 0)} · Blue with{' '}
        {money(sabotage.budget.blue ?? 0)}
      </p>
      <p className="sab__sidenote">Your team score is already on the board.</p>
    </div>
  )
}
