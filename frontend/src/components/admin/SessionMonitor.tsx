import { Trash2, RefreshCw } from "lucide-react";
import { useAdminSessions, useKillSession } from "../../api/admin";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

export function SessionMonitor() {
  const { data, isLoading, refetch } = useAdminSessions();
  const kill = useKillSession();
  const sessions = data?.sessions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Active Sessions</h2>
        <button onClick={() => refetch()} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {isLoading && <div className="text-zinc-500 text-sm">Loading…</div>}

      {!isLoading && sessions.length === 0 && (
        <div className="text-zinc-600 text-sm py-8 text-center">No active sessions</div>
      )}

      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.id} className="card p-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-100 text-sm font-medium">{s.username}</span>
                <span className="badge-green">active</span>
                {s.model && <span className="badge-zinc">{s.model}</span>}
              </div>
              <div className="text-xs text-zinc-500 mt-1 truncate">
                {s.branch} · idle {relTime(s.last_active)}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Kill session for ${s.username}?`)) {
                  kill.mutate(s.username);
                }
              }}
              className="btn-danger shrink-0"
              disabled={kill.isPending}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
