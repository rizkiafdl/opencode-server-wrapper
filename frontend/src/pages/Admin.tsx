import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, GitMerge, Layers, Monitor, Bot, BarChart2 } from "lucide-react";
import { MergeQueue } from "../components/admin/MergeQueue";
import { SessionMonitor } from "../components/admin/SessionMonitor";
import { AgentRegistry } from "../components/admin/AgentRegistry";
import { Aggregator } from "../components/admin/Aggregator";
import { RepoAnalysis } from "../components/admin/RepoAnalysis";

const TABS = [
  { id: "queue", label: "Merge Queue", icon: GitMerge, component: MergeQueue },
  { id: "sessions", label: "Sessions", icon: Monitor, component: SessionMonitor },
  { id: "agents", label: "Agents", icon: Bot, component: AgentRegistry },
  { id: "aggregator", label: "Aggregator", icon: Layers, component: Aggregator },
  { id: "analysis", label: "Analysis", icon: BarChart2, component: RepoAnalysis },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Admin() {
  const [tab, setTab] = useState<TabId>("queue");
  const ActiveTab = TABS.find((t) => t.id === tab)!.component;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-3">
        <Link to="/chat" className="btn-ghost flex items-center gap-1.5 text-xs">
          <ArrowLeft size={13} /> Back
        </Link>
        <h1 className="text-sm font-bold text-zinc-100">Admin Dashboard</h1>
      </header>

      <div className="flex h-[calc(100vh-49px)]">
        {/* Sidebar tabs */}
        <nav className="w-48 border-r border-zinc-800 p-3 space-y-1 shrink-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`w-full flex items-center gap-2 text-xs px-3 py-2 rounded transition-colors ${
                tab === id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <ActiveTab />
        </main>
      </div>
    </div>
  );
}
