import { Bot, ChevronDown } from "lucide-react";
import { useAgents } from "../../api/agents";

interface Props {
  value: string | null;
  onChange: (agent: string) => void;
}

export function AgentPicker({ value, onChange }: Props) {
  const { data, isLoading } = useAgents();
  const agents = Array.isArray(data) ? data.filter((a) => !a.hidden && a.mode !== "subagent") : [];

  return (
    <div className="relative flex items-center gap-1.5">
      <Bot size={14} className="text-zinc-500 shrink-0" />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs text-zinc-400 border-0 outline-none cursor-pointer pr-5 appearance-none"
        disabled={isLoading}
      >
        <option value="">Default agent</option>
        {agents.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="text-zinc-500 pointer-events-none absolute right-0" />
    </div>
  );
}
