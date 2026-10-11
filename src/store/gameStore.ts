import { create } from "zustand";

export type Phase = "idle" | "playing" | "paused" | "finished";

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
}

interface GameState {
  phase: Phase;
  current: unknown | null;
  answers: Record<string, unknown>;
  onMessage: (message: WsMessage) => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: "idle",
  current: null,
  answers: {},
  onMessage: (message) => {
    if (message.type === "state") {
      const payload = message.payload as { phase: Phase; current: unknown | null };
      set({ phase: payload.phase, current: payload.current });
    }
  },
}));
