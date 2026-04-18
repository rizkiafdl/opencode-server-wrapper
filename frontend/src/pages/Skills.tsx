import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "../api/client";

interface Skill {
  id: string;
  name: string;
  description: string;
  path: string;
}

export default function Skills() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["skills"],
    queryFn: () => apiFetch<{ skills: Skill[] }>("/api/skills"),
  });

  const { data: skillDetail } = useQuery({
    queryKey: ["skill", selected],
    queryFn: () => apiFetch<{ id: string; content: string }>(`/api/skills/${selected}`),
    enabled: !!selected,
  });

  const skills = (data?.skills ?? []).filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link to="/chat" className="btn-ghost flex items-center gap-1.5 text-xs">
            <ArrowLeft size={13} /> Back
          </Link>
          <h1 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <BookOpen size={18} /> Skills Browser
          </h1>
        </div>

        <div className="flex gap-4">
          {/* Sidebar */}
          <div className="w-72 shrink-0 space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skills…"
                className="input pl-8 py-1.5 text-xs"
              />
            </div>
            {skills.length === 0 && (
              <div className="text-zinc-600 text-sm py-4 text-center">
                No skills found
                <br />
                <span className="text-xs">Add .md files to opencode-config/skills/</span>
              </div>
            )}
            {skills.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`w-full text-left card p-3 transition-colors hover:border-zinc-600 ${
                  selected === s.id ? "border-blue-700 bg-blue-950/20" : ""
                }`}
              >
                <div className="text-sm font-medium text-zinc-200">{s.name}</div>
                {s.description && (
                  <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{s.description}</div>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 card p-5 min-h-64">
            {!selected && (
              <div className="text-zinc-600 text-sm flex items-center justify-center h-48">
                Select a skill to view its content
              </div>
            )}
            {selected && skillDetail && (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {skillDetail.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
