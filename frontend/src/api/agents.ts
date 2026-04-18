import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";

export interface Agent {
  name: string;
  description?: string;
  model?: string;
  mode?: "primary" | "subagent" | "all";
  hidden?: boolean;
}

export interface Provider {
  id: string;
  name: string;
  models?: string[];
}

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => apiFetch<Agent[]>("/api/agents"),
    staleTime: 60_000,
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ["providers"],
    queryFn: () => apiFetch<Provider[]>("/api/providers"),
    staleTime: 60_000,
  });
}
