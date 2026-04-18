import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../../api/sse";

interface Props {
  message: Message;
  style?: React.CSSProperties;
}

function _MessageBubble({ message, style }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    const part = message.parts[0];
    const isError = part?.type === "error";
    return (
      <div
        style={style}
        className={`text-xs text-center py-1 px-3 ${isError ? "text-red-400" : "text-zinc-500"}`}
      >
        {part?.text ?? ""}
      </div>
    );
  }

  return (
    <div
      style={style}
      className={`flex ${isUser ? "justify-end" : "justify-start"} px-4 py-1`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-900/60 border border-blue-700/50 text-zinc-100"
            : "bg-zinc-900 border border-zinc-800 text-zinc-200"
        }`}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return isUser ? (
              <span key={i} className="whitespace-pre-wrap break-words">
                {part.text}
              </span>
            ) : (
              <div key={i} className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const isBlock = className?.includes("language-");
                      return isBlock ? (
                        <code
                          className={`${className} block bg-zinc-950 rounded p-3 overflow-x-auto text-xs my-2`}
                          {...props}
                        >
                          {children}
                        </code>
                      ) : (
                        <code className="bg-zinc-800 rounded px-1 py-0.5 text-xs" {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre({ children }) {
                      return <pre className="overflow-x-auto my-2">{children}</pre>;
                    },
                  }}
                >
                  {part.text ?? ""}
                </ReactMarkdown>
              </div>
            );
          }
          if (part.type === "tool-invocation") {
            return (
              <div key={i} className="text-xs text-zinc-500 italic py-1">
                ⚙ {part.toolName}({JSON.stringify(part.toolInput)?.slice(0, 80)}…)
              </div>
            );
          }
          if (part.type === "file") {
            return (
              <div key={i} className="text-xs text-blue-400 py-1">
                📄 {part.filePath}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export const MessageBubble = memo(_MessageBubble);
