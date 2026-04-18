import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "../store/session";
import { useStartSession } from "../api/sessions";

export default function Login() {
  const [username, setUsername] = useState("");
  const { setUser, setSession, model, agent } = useSessionStore();
  const navigate = useNavigate();
  const start = useStartSession();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;

    try {
      const data = await start.mutateAsync({ username: u, model: model ?? undefined, agent: agent ?? undefined });
      setUser(u);
      setSession(data.session_id, data.branch);
      navigate("/chat");
    } catch {
      // error shown below
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">OpenWiki</h1>
          <p className="text-zinc-500 text-sm mt-1">Multi-user AI workspace</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
            className="input"
            autoFocus
            required
            pattern="[a-zA-Z0-9_-]+"
            title="Letters, numbers, hyphens and underscores only"
          />

          {start.isError && (
            <p className="text-red-400 text-xs">{(start.error as Error).message}</p>
          )}

          <button
            type="submit"
            disabled={start.isPending || !username.trim()}
            className="btn-primary w-full py-2"
          >
            {start.isPending ? "Starting session…" : "Start Session"}
          </button>
        </form>

        <p className="text-center text-xs text-zinc-600">
          Sessions auto-end after 15 min of inactivity
        </p>
      </div>
    </div>
  );
}
