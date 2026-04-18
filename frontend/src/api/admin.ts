import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";

export interface MergeQueueItem {
  id: number;
  username: string;
  branch: string;
  session_id: string | null;
  pushed_at: string;
  diff_stat: string | null;
  status: "pending" | "approved" | "rejected";
}

export interface AggregationJob {
  id: number;
  triggered_by: string;
  triggered_at: string;
  since_date: string;
  branches_read: string | null;
  output_branch: string | null;
  opencode_session: string | null;
  status: "running" | "done" | "failed";
}

export function useMergeQueue(status = "pending") {
  return useQuery({
    queryKey: ["merge-queue", status],
    queryFn: () => apiFetch<{ items: MergeQueueItem[] }>(`/api/admin/queue?status=${status}`),
    refetchInterval: 20_000,
  });
}

export function useQueueDiff(id: number, enabled: boolean) {
  return useQuery({
    queryKey: ["queue-diff", id],
    queryFn: () => apiFetch<{ diff: string; stat: string; branch: string }>(`/api/admin/queue/${id}/diff`),
    enabled,
    staleTime: 30_000,
  });
}

export function useApprove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approvedBy }: { id: number; approvedBy: string }) =>
      apiFetch(`/api/admin/queue/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approved_by: approvedBy }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merge-queue"] }),
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/queue/${id}/reject`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["merge-queue"] }),
  });
}

export function useAdminSessions() {
  return useQuery({
    queryKey: ["admin-sessions"],
    queryFn: () => apiFetch<{ sessions: { id: string; username: string; branch: string; model: string; last_active: string }[] }>("/api/admin/sessions"),
    refetchInterval: 10_000,
  });
}

export function useKillSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (username: string) =>
      apiFetch(`/api/admin/sessions/${username}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-sessions"] }),
  });
}

export function useAggregations() {
  return useQuery({
    queryKey: ["aggregations"],
    queryFn: () => apiFetch<{ jobs: AggregationJob[] }>("/api/admin/aggregate"),
    refetchInterval: 5_000,
  });
}

export function useTriggerAggregation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { since_date: string; triggered_by: string }) =>
      apiFetch("/api/admin/aggregate", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aggregations"] }),
  });
}

export function useActivityMetrics(sinceDays: number) {
  return useQuery({
    queryKey: ["activity", sinceDays],
    queryFn: () => apiFetch<{ activity: { email: string; commits: number; active_days: number; last_commit: string }[] }>(`/api/admin/analysis/activity?since_days=${sinceDays}`),
    staleTime: 300_000,
  });
}

export function useNlpMetrics() {
  return useQuery({
    queryKey: ["nlp-metrics"],
    queryFn: () => apiFetch<{ files: number; word_count: number; flesch_kincaid: number; flesch_reading_ease: number }>("/api/admin/analysis/nlp"),
    staleTime: 300_000,
  });
}
