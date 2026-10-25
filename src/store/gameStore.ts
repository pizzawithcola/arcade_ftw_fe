import { create } from 'zustand'

export type Phase = 'waiting' | 'playing' | 'paused' | 'finished'
export type Connection = 'connecting' | 'open' | 'closed'

export interface QuestionState {
  index: number
  count: number
  seconds_each: number
  remaining_ms: number
}

export interface FlowNode {
  type: string
  title?: string
  game?: string
  /** Leaderboard nodes: which board to show. */
  section?: string
  /** Scored nodes: which score column they add to. */
  score?: string
  duration_sec?: number
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

export interface SabotageScenario {
  attacker: 'red' | 'blue'
  defender: 'red' | 'blue'
  attack_title: string
  attack_prompt: string
  defence_title: string
  defence_prompt: string
  learning: string
}

export interface SabotageResult {
  round: number
  attacker: 'red' | 'blue'
  defender: 'red' | 'blue'
  attack_card: string
  defence_card: string
  outcome: 'blocked' | 'partial' | 'failed'
  attack_delta: number
  defence_delta: number
  winner?: 'red' | 'blue'
  payout?: number
}

/**
 * The Sabotage engine's own snapshot, broadcast as its own `sabotage` message
 * rather than folded into the main `state`. The main flow still owns the node
 * clock; this carries the game inside the node.
 */
export interface SabotageCard {
  name: string
  description: string
  cost: number
  success: number
  fail: number
}

export interface SabotageState {
  code: string
  phase: 'setup' | 'team_reveal' | 'attack' | 'defend' | 'tie_break' | 'resolve' | 'team_result' | 'payout' | 'done'
  paused: boolean
  round: number
  attacker: 'red' | 'blue' | null
  defender: 'red' | 'blue' | null
  remaining_ms: number
  budgets: { red: number; blue: number }
  scores: { red: number; blue: number }
  spent: string[]
  scenario: SabotageScenario | null
  voting_team: 'red' | 'blue' | null
  options: string[]
  tie_candidates: string[]
  attack_card: string | null
  defence_card: string | null
  last_result: SabotageResult | null
  cards: { attack: Record<string, SabotageCard>; defence: Record<string, SabotageCard> }
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
