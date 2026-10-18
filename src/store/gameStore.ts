import { create } from 'zustand'

export type Phase = 'idle' | 'playing' | 'paused' | 'finished'
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
  phase: 'idle',
  index: 0,
  nodeCount: 0,
  node: null,
  endsAt: null,
  heldMs: 0,
  question: null,
  sawPlaying: false,

  setConnection: (connection) => set({ connection }),

  resetForRoom: () =>
    set({
      phase: 'idle',
      index: 0,
      nodeCount: 0,
      node: null,
      endsAt: null,
      heldMs: 0,
      question: null,
      sawPlaying: false,
    }),

  applyMessage: (message) => {
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
