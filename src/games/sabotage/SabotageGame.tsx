import { useState } from 'react'
import { sabotageVote } from '../../api'
import { useTicker } from '../../hooks/useTicker'
import { useGameStore, type SabotageState } from '../../store/gameStore'
import './SabotageGame.css'

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function money(cost: number): string {
  const k = cost / 1000
  return Number.isInteger(k) ? `$${k}k` : `$${k.toFixed(1)}k`
}

/** A card may sit in either deck (tie-breaks can revote a defence too). */
function lookupCard(sabotage: SabotageState, id: string) {
  return sabotage.cards.attack[id] ?? sabotage.cards.defence[id] ?? null
}

const PHASE_LABEL: Record<string, string> = {
  team_reveal: 'Find your team',
  attack: 'Choose your attack',
  defend: 'Choose your defence',
  tie_break: 'Revote',
  resolve: 'Round result',
  team_result: 'Team result',
  payout: 'Payout',
  done: 'Complete',
}

export default function SabotageGame({ room, team }: { room: string; team?: string }) {
  const sabotage = useGameStore((state) => state.sabotage)
  const now = useTicker()
  // Remember which vote phase the pick belonged to, so a new phase reads as
  // unpicked without an effect resetting state.
  const [picked, setPicked] = useState<{ key: string; card: string } | null>(null)

  if (!sabotage) {
    return (
      <div className="stage stage--sabotage">
        <p>Syncing…</p>
      </div>
    )
  }

  const voteKey = `${sabotage.phase}-${sabotage.round}-${sabotage.voting_team}`
  const pickedCard = picked?.key === voteKey ? picked.card : null

  const remaining = sabotage.paused
    ? sabotage.heldMs
    : sabotage.endsAt !== null
      ? Math.max(0, sabotage.endsAt - now)
      : sabotage.remaining_ms

  const myTurn = sabotage.voting_team === team && !sabotage.paused
  const scenario = sabotage.scenario
  const isAttack = sabotage.phase === 'attack'
  const isVote = sabotage.phase === 'attack' || sabotage.phase === 'defend' || sabotage.phase === 'tie_break'

  return (
    <div className={`stage stage--game stage--sabotage is-${sabotage.phase}`}>
      <header className="sab__bar">
        <span className="stage__kind">Sabotage</span>
        <span className="sab__phase">
          {PHASE_LABEL[sabotage.phase] ?? sabotage.phase}
          {sabotage.paused && ' · paused'}
        </span>
        <span className="sab__timer">{formatClock(remaining)}</span>
      </header>

      {sabotage.phase === 'team_reveal' && (
        <div className="sab__reveal">
          <p className="sab__teamline">
            {team ? (
              <>
                You are <strong className={`is-${team}`}>{team} team</strong>
              </>
            ) : (
              <>Assigning your team…</>
            )}
          </p>
          <p className="sab__hint">
            Shared team budget: {money(sabotage.budgets[team as 'red' | 'blue'] ?? 0)}
          </p>
        </div>
      )}

      {isVote && scenario && (
        <div className="sab__board">
          <p className="sab__prompt">
            {isAttack ? scenario.attack_prompt : scenario.defence_prompt}
          </p>
          <div className="sab__cards">
            {sabotage.options.map((id) => {
              const card = lookupCard(sabotage, id)
              if (!card) return null
              return (
                <button
                  key={id}
                  type="button"
                  className={`sab__card ${pickedCard === id ? 'is-picked' : ''}`}
                  disabled={!myTurn}
                  onClick={() => {
                    setPicked({ key: voteKey, card: id })
                    void sabotageVote(room, id).catch(() => {
                      // A refused vote just leaves the previous choice in place.
                    })
                  }}
                >
                  <span className="sab__cardname">{card.name}</span>
                  <span className="sab__carddesc">{card.description}</span>
                  <span className="sab__cardcost">{money(card.cost)}</span>
                </button>
              )
            })}
          </div>

          {sabotage.spent.length > 0 && (
            <div className="sab__spent">
              <p className="sab__spentlabel">Used this round</p>
              <ul>
                {sabotage.spent.map((id) => {
                  const card = sabotage.cards.attack[id]
                  return (
                    <li key={id} className="is-spent">
                      {card?.name ?? id} — spent
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {!myTurn && <p className="sab__hint">Waiting for your team…</p>}
        </div>
      )}

      {sabotage.phase === 'resolve' && sabotage.last_result && (
        <div className={`sab__result is-${sabotage.last_result.outcome}`}>
          <p className="sab__verdict">
            {sabotage.last_result.outcome === 'blocked'
              ? 'ATTACK BLOCKED'
              : sabotage.last_result.outcome === 'failed'
                ? 'SABOTAGE SUCCESSFUL'
                : 'STANDOFF'}
          </p>
          <p className="sab__pairing">
            {sabotage.cards.attack[sabotage.last_result.attack_card]?.name ?? sabotage.last_result.attack_card}
            {' vs '}
            {sabotage.cards.defence[sabotage.last_result.defence_card]?.name ?? sabotage.last_result.defence_card}
          </p>
          <div className="sab__scoreline">
            <span className="is-red">Red {sabotage.scores.red}</span>
            <span className="is-blue">Blue {sabotage.scores.blue}</span>
          </div>
        </div>
      )}

      {(sabotage.phase === 'team_result' || sabotage.phase === 'payout') && (
        <div className="sab__final">
          <p className="sab__verdict">
            {sabotage.last_result?.winner
              ? `${sabotage.last_result.winner.toUpperCase()} TEAM WINS`
              : 'Final scores'}
          </p>
          <div className="sab__scoreline">
            <span className="is-red">Red {sabotage.scores.red}</span>
            <span className="is-blue">Blue {sabotage.scores.blue}</span>
          </div>
          <p className="sab__hint">
            Your team scored {sabotage.scores[team as 'red' | 'blue'] ?? 0} points.
          </p>
        </div>
      )}

      {sabotage.phase === 'done' && (
        <div className="sab__final">
          <p className="sab__verdict">Sabotage complete</p>
          <div className="sab__scoreline">
            <span className="is-red">Red {sabotage.scores.red}</span>
            <span className="is-blue">Blue {sabotage.scores.blue}</span>
          </div>
        </div>
      )}
    </div>
  )
}
