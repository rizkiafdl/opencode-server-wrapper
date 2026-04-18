import { Link } from "react-router-dom";
import { ArrowLeft, User, GitBranch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import { useSessionStore } from "../store/session";

interface SessionRow {
  id: string;
  username: string;
  branch: string;
  model: string | null;
  last_active: string;
  status: string;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export default function Sessions() {
  const { username } = useSessionStore();
  const { data, isLoading } = useQuery({
    queryKey: ["session-list"],
    queryFn: () => apiFetch<{ sessions: SessionRow[] }>("/api/session/list"),
    refetchInterval: 15_000,
  });
  const sessions = data?.sessions ?? [];

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/chat" className="btn-ghost flex items-center gap-1.5 text-xs">
            <ArrowLeft size={13} /> Back
          </Link>
          <h1 className="text-lg font-bold text-zinc-100">Active Sessions</h1>
        </div>

        {isLoading && <div className="text-zinc-500 text-sm">Loading…</div>}

        {!isLoading && sessions.length === 0 && (
          <div className="text-zinc-600 text-sm py-12 text-center">No active sessions</div>
        )}

        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`card p-4 ${s.username === username ? "border-blue-800" : ""}`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-zinc-500" />
                  <span className="text-zinc-100 font-medium">{s.username}</span>
                  {s.username === username && <span className="badge-blue">you</span>}
                  <span className="badge-green">{s.status}</span>
                  {s.model && <span className="badge-zinc text-xs">{s.model}</span>}
                </div>
                <span className="text-xs text-zinc-500">{relTime(s.last_active)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-zinc-500">
                <GitBranch size={11} />
                <span className="font-mono">{s.branch}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
