import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  username: string | null;
  sessionId: string | null;
  branch: string | null;
  model: string | null;
  agent: string | null;
  setUser: (username: string) => void;
  setSession: (sessionId: string, branch: string) => void;
  setModel: (model: string) => void;
  setAgent: (agent: string) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      username: null,
      sessionId: null,
      branch: null,
      model: null,
      agent: null,
      setUser: (username) => set({ username }),
      setSession: (sessionId, branch) => set({ sessionId, branch }),
      setModel: (model) => set({ model }),
      setAgent: (agent) => set({ agent }),
      clear: () => set({ username: null, sessionId: null, branch: null, model: null, agent: null }),
    }),
    { name: "openwiki-session" }
  )
);
