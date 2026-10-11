import { create } from 'zustand'

export type Phase = 'idle' | 'playing' | 'paused' | 'finished'
export type Connection = 'connecting' | 'open' | 'closed'

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

  setConnection: (connection) => set({ connection }),

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
    })
  },
}))
