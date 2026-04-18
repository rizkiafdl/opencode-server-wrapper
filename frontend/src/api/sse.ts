import { useCallback, useEffect, useRef, useState } from "react";

export interface MessagePart {
  type: "text" | "tool-invocation" | "file" | "error";
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  filePath?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  parts: MessagePart[];
  sessionId?: string;
}

type SSEStatus = "connecting" | "connected" | "error" | "idle";

export function useSSE(sessionId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<SSEStatus>("idle");
  const [isStreaming, setIsStreaming] = useState(false);

  const esRef = useRef<EventSource | null>(null);
  const bufferRef = useRef<string>("");
  const rafRef = useRef<number>(0);
  const activePartIdRef = useRef<string | null>(null);

  const appendUserMessage = useCallback((text: string) => {
    const id = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id, role: "user", parts: [{ type: "text", text }] },
    ]);
  }, []);

  const reset = useCallback(() => {
    setMessages([]);
    setIsStreaming(false);
    setStatus("idle");
    activePartIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const connect = () => {
      if (esRef.current) esRef.current.close();

      setStatus("connecting");
      const es = new EventSource(`/api/chat/sse?session_id=${sessionId}`);
      esRef.current = es;

      es.onopen = () => setStatus("connected");

      es.onmessage = (e) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(e.data);
        } catch {
          return;
        }

        const type = event.type as string;
        const props = (event.properties || {}) as Record<string, unknown>;
        const eventSessionId = props.sessionID as string | undefined;

        // filter to our session
        if (eventSessionId && eventSessionId !== sessionId) return;

        if (type === "message.part.delta") {
          if (props.field === "text" && typeof props.delta === "string") {
            setIsStreaming(true);
            bufferRef.current += props.delta;
            cancelAnimationFrame(rafRef.current);
            const partId = props.partID as string ?? "streaming";
            activePartIdRef.current = partId;

            rafRef.current = requestAnimationFrame(() => {
              const delta = bufferRef.current;
              bufferRef.current = "";
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  const parts = [...last.parts];
                  const textPart = parts.findIndex((p) => p.type === "text");
                  if (textPart >= 0) {
                    parts[textPart] = { ...parts[textPart], text: (parts[textPart].text ?? "") + delta };
                  } else {
                    parts.push({ type: "text", text: delta });
                  }
                  return [...prev.slice(0, -1), { ...last, parts }];
                }
                return [
                  ...prev,
                  {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    parts: [{ type: "text", text: delta }],
                    sessionId,
                  },
                ];
              });
            });
          }
        } else if (type === "session.idle" || (type === "session.status" && (props.status as Record<string, string>)?.type === "idle")) {
          setIsStreaming(false);
          activePartIdRef.current = null;
        } else if (type === "error") {
          setIsStreaming(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              role: "system",
              parts: [{ type: "error", text: JSON.stringify(props) }],
            },
          ]);
        }
      };

      es.onerror = () => {
        setStatus("error");
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      cancelAnimationFrame(rafRef.current);
    };
  }, [sessionId]);

  return { messages, status, isStreaming, appendUserMessage, reset };
}
