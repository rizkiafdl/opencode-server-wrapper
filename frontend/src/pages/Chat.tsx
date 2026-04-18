import { useNavigate, Link } from "react-router-dom";
import { GitBranch, LogOut, Settings, BookOpen, LayoutDashboard } from "lucide-react";
import { useSessionStore } from "../store/session";
import { useEndSession } from "../api/sessions";
import { useSSE } from "../api/sse";
import { ChatContainer } from "../components/chat/ChatContainer";
import { MessageInput } from "../components/chat/MessageInput";
import { AgentPicker } from "../components/chat/AgentPicker";
import { ModelPicker } from "../components/chat/ModelPicker";
import { apiFetch } from "../api/client";

export default function Chat() {
  const { username, sessionId, branch, model, agent, setModel, setAgent, clear } = useSessionStore();
  const navigate = useNavigate();
  const endSession = useEndSession();
  const { messages, isStreaming, appendUserMessage } = useSSE(sessionId);

  const handleSend = async (text: string) => {
    if (!sessionId) return;
    appendUserMessage(text);
    try {
      await apiFetch(`/api/chat/${sessionId}/message`, {
        method: "POST",
        body: JSON.stringify({ parts: [{ type: "text", text }] }),
      });
    } catch (e) {
      console.error("Send failed:", e);
    }
  };

  const handleEnd = async () => {
    if (!username || !confirm("End session? Changes will be pushed to your branch.")) return;
    await endSession.mutateAsync(username);
    clear();
    navigate("/login");
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-950 shrink-0">
        <span className="font-bold text-zinc-100 text-sm">OpenWiki</span>
        <div className="flex items-center gap-1 ml-2">
          <span className="badge-blue">{username}</span>
          {branch && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <GitBranch size={11} /> {branch}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 ml-4">
          <AgentPicker value={agent} onChange={setAgent} />
          <ModelPicker value={model} onChange={setModel} />
        </div>

        <div className="flex items-center gap-1 ml-auto">
          <Link to="/sessions" className="btn-ghost flex items-center gap-1.5 text-xs">
            <Settings size={13} /> Sessions
          </Link>
          <Link to="/skills" className="btn-ghost flex items-center gap-1.5 text-xs">
            <BookOpen size={13} /> Skills
          </Link>
          <Link to="/admin" className="btn-ghost flex items-center gap-1.5 text-xs">
            <LayoutDashboard size={13} /> Admin
          </Link>
          <button
            onClick={handleEnd}
            disabled={endSession.isPending}
            className="btn-danger flex items-center gap-1.5 text-xs"
          >
            <LogOut size={13} /> End Session
          </button>
        </div>
      </header>

      {/* Chat area */}
      <ChatContainer messages={messages} isStreaming={isStreaming} />

      {/* Input */}
      <MessageInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
