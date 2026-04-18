import { ChevronDown, Cpu } from "lucide-react";
import { useProviders } from "../../api/agents";

interface Props {
  value: string | null;
  onChange: (model: string) => void;
}

export function ModelPicker({ value, onChange }: Props) {
  const { data, isLoading } = useProviders();
  const providers = Array.isArray(data) ? data : [];

  return (
    <div className="relative flex items-center gap-1.5">
      <Cpu size={14} className="text-zinc-500 shrink-0" />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs text-zinc-400 border-0 outline-none cursor-pointer pr-5 appearance-none max-w-[200px]"
        disabled={isLoading}
      >
        <option value="">Default model</option>
        {providers.map((p) =>
          (p.models ?? []).map((m: string) => (
            <option key={`${p.id}/${m}`} value={`${p.id}/${m}`}>
              {p.id}/{m}
            </option>
          ))
        )}
      </select>
      <ChevronDown size={12} className="text-zinc-500 pointer-events-none absolute right-0" />
    </div>
  );
}
