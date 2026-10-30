import { create } from 'zustand'

export type Phase = 'waiting' | 'playing' | 'paused' | 'finished'
export type Connection = 'connecting' | 'open' | 'closed'

export interface QuestionState {
  index: number
  count: number
  seconds_each: number
  remaining_ms: number
  /** Milliseconds left on the quiz's title card; 0 once the questions start. */
  intro_ms?: number
}

export interface FlowNode {
  type: string
  title?: string
  game?: string
  /** Leaderboard nodes: which board to show. */
  section?: string
  /** Scored nodes: which score column they add to. */
  score?: string
  /** Brief nodes: which game's "how to play" copy to show. */
  brief?: string
  duration_sec?: number
  /** Question nodes: how many, and how long each cycle runs. */
  questions?: number
  seconds_each?: number
  /** Quiz nodes: a title card before the first question. */
  intro_sec?: number
}
interface StateMessage {
  phase: Phase
  index: number
  node_count: number
  node: FlowNode | null
  remaining_ms: number
  question: QuestionState | null
  server_time_ms: number
}

export interface WsMessage {
  type: string
  payload: unknown
}

export type SabotageTeam = 'red' | 'blue'
export type SabotageDomain = 'data' | 'people' | 'infra'

/** A card is three numbers and a price in dollars. The price is not a power
 *  ranking: a cheap card can be the strongest thing in the deck. */
export interface SabotageCard {
  name: string
  blurb: string
  cost: number
  vector: [number, number, number]
}

export interface SabotageDim {
  domain: SabotageDomain
  attack: number
  defence: number
  result: 'break' | 'hold' | 'tie'
  target: boolean
}

export interface SabotageRoundResult {
  round: number
  theme: string
  target: SabotageDomain
  attacker: SabotageTeam
  defender: SabotageTeam
  attack: string[]
  defence: string[]
  attack_vector: number[]
  defence_vector: number[]
  /** What each side paid for its hand, in dollars. */
  attack_cost: number
  defence_cost: number
  /** null when neither side bought anything: the round scores nothing. */
  winner: SabotageTeam | null
  void: boolean
  points: Record<SabotageTeam, number>
  broke_target: boolean
  flanks: number
  outcome: string
  dims: SabotageDim[]
}

export interface SabotageBuild {
  team: SabotageTeam
  role: 'attacker' | 'defender'
  round: number
  target: SabotageDomain
  deck: string[]
  build: string[]
  /** Dollars the team walked into this round with, before its build. */
  round_budget: number
  /** Dollars left once the team's build is paid for. */
  budget: number
  /** Dollars already committed in the rounds before this one. */
  spent: number
  total_budget: number
  vector: number[]
  votes: Record<string, number>
  dropped: { card: string; reason: 'budget' | 'slots' }[]
  voters: number
  members: number
}

/**
 * The Sabotage engine's own snapshot, broadcast as its own `sabotage` message
 * rather than folded into the main `state`. The main flow still owns the node
 * clock; this carries the game inside the node.
 */
export interface SabotageState {
  code: string
  phase: 'setup' | 'team_reveal' | 'brief' | 'select' | 'reveal' | 'final' | 'done'
  paused: boolean
  round: number
  rounds: number
  remaining_ms: number
  target: SabotageDomain
  theme: string
  attacker: SabotageTeam
  defender: SabotageTeam
  attack_brief: string
  defence_brief: string
  teams: Record<SabotageTeam, number[]>
  scores: Record<SabotageTeam, number>
  rounds_won: Record<SabotageTeam, number>
  decks: Record<SabotageTeam, string[]>
  /** Empty while selecting: both sides commit at the same time. */
  builds: Partial<Record<SabotageTeam, string[]>>
  /** One pool per team for the whole match, in dollars. */
  total_budget: number
  /** Committed so far; during select it covers the finished rounds only. */
  spent: Record<SabotageTeam, number>
  /** Dollars the team can still spend. */
  budget: Record<SabotageTeam, number>
  vectors: Partial<Record<SabotageTeam, number[]>>
  votes: Partial<Record<SabotageTeam, Record<string, number>>>
  dropped: Partial<Record<SabotageTeam, { card: string; reason: string }[]>>
  /** A side that put nothing in: it forfeits the round. */
  no_bid: Partial<Record<SabotageTeam, boolean>>
  cards: Record<string, SabotageCard>
  domains: SabotageDomain[]
  last_result: SabotageRoundResult | null
  history: SabotageRoundResult[]
}

interface GameState {
  connection: Connection
  phase: Phase
  index: number
  nodeCount: number
  node: FlowNode | null
  /** Local instant the current node ends. Only set while playing. */
  endsAt: number | null
  /** Milliseconds left, held constant while paused. */
  heldMs: number
  /** Which question the engine says is on screen, so every screen agrees. */
  question: QuestionState | null
  /** The Sabotage game state, present only while that game is running. */
  sabotage: (SabotageState & { endsAt: number | null; heldMs: number }) | null
  /**
   * True once this screen has seen the round actually running. Tells a device
   * that was present when the round ended from one that arrived afterwards.
   */
  sawPlaying: boolean
  /** Forget everything about the previous room before connecting to another. */
  resetForRoom: () => void
  setConnection: (connection: Connection) => void
  applyMessage: (message: WsMessage) => void
}

export const useGameStore = create<GameState>((set) => ({
  connection: 'connecting',
  phase: 'waiting',
  index: 0,
  nodeCount: 0,
  node: null,
  endsAt: null,
  heldMs: 0,
  question: null,
  sabotage: null,
  sawPlaying: false,

  setConnection: (connection) => set({ connection }),

  resetForRoom: () =>
    set({
      phase: 'waiting',
      index: 0,
      nodeCount: 0,
      node: null,
      endsAt: null,
      heldMs: 0,
      question: null,
      sabotage: null,
      sawPlaying: false,
    }),

  applyMessage: (message) => {
    if (message.type === 'sabotage') {
      const sabotage = message.payload as SabotageState
      set({
        sabotage: {
          ...sabotage,
          // Same countdown derivation as the main state: a duration anchored to
          // this machine's clock, frozen while the operator has it paused.
          endsAt: sabotage.paused ? null : Date.now() + sabotage.remaining_ms,
          heldMs: sabotage.paused ? sabotage.remaining_ms : 0,
        },
      })
      return
    }
    if (message.type !== 'state') return
    const state = message.payload as StateMessage

    set({
      phase: state.phase,
      index: state.index,
      nodeCount: state.node_count,
      node: state.node,
      // The server sends a duration rather than a deadline, so the countdown is
      // anchored to this machine's clock. A skewed clock shifts the whole
      // display, never the length of the node.
      endsAt: state.phase === 'playing' ? Date.now() + state.remaining_ms : null,
      heldMs: state.phase === 'paused' ? state.remaining_ms : 0,
      question: state.question ?? null,
      sawPlaying:
        state.phase === 'playing' || state.phase === 'paused'
          ? true
          : (useGameStore.getState().sawPlaying ?? false),
    })
  },
}))
