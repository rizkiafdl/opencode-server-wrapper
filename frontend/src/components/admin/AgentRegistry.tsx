import { Bot, RefreshCw } from "lucide-react";
import { useAgents } from "../../api/agents";

export function AgentRegistry() {
  const { data, isLoading, refetch } = useAgents();
  const agents = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Agent Registry</h2>
        <button onClick={() => refetch()} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {isLoading && <div className="text-zinc-500 text-sm">Loading…</div>}

      {!isLoading && agents.length === 0 && (
        <div className="text-zinc-600 text-sm py-8 text-center">
          No agents configured — add .md files to opencode-config/agents/
        </div>
      )}

      <div className="grid gap-2">
        {agents.map((agent) => (
          <div key={agent.name} className="card p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Bot size={14} className="text-blue-400 shrink-0" />
              <span className="text-zinc-100 text-sm font-medium">{agent.name}</span>
              {agent.mode && (
                <span className={agent.mode === "primary" ? "badge-blue" : "badge-zinc"}>
                  {agent.mode}
                </span>
              )}
              {agent.model && <span className="badge-zinc text-xs">{agent.model}</span>}
            </div>
            {agent.description && (
              <p className="text-xs text-zinc-500 mt-2 leading-relaxed">{agent.description}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
