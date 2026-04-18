import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

export interface Session {
  id: string;
  username: string;
  worktree: string;
  branch: string;
  model: string | null;
  agent: string | null;
  created_at: string;
  last_active: string;
  status: string;
}

export function useMySession(username: string | null) {
  return useQuery({
    queryKey: ["session", "me", username],
    queryFn: () => apiFetch<{ session: Session | null }>(`/api/session/me?username=${username}`),
    enabled: !!username,
    refetchInterval: 15_000,
  });
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; model?: string; agent?: string }) =>
      apiFetch<{ session_id: string; branch: string; existing: boolean }>("/api/session/start", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

export function useEndSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      apiFetch("/api/session/end", {
        method: "POST",
        body: JSON.stringify({ username }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}
