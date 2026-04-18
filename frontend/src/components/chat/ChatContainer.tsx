import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "../../api/sse";

interface Props {
  messages: Message[];
  isStreaming: boolean;
}

export function ChatContainer({ messages, isStreaming }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const msg = messages[i];
      const text = msg?.parts[0]?.text ?? "";
      return Math.max(60, Math.ceil(text.length / 80) * 22 + 40);
    },
    overscan: 5,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end", behavior: "smooth" });
    }
  }, [messages.length, virtualizer]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
        Start a conversation below
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => (
          <MessageBubble
            key={item.key}
            message={messages[item.index]}
            style={{
              position: "absolute",
              top: item.start,
              left: 0,
              right: 0,
            }}
          />
        ))}
      </div>
      {isStreaming && (
        <div className="px-4 py-2 flex justify-start">
          <div className="flex gap-1 items-center">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      )}
    </div>
  );
}
