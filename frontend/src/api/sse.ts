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
  const retryRef = useRef<number>(0);
  // tracks opencode messageIDs by role
  const assistantMsgIdsRef = useRef<Set<string>>(new Set());
  const userMsgIdsRef = useRef<Set<string>>(new Set());

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
    assistantMsgIdsRef.current = new Set();
    userMsgIdsRef.current = new Set();
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const connect = () => {
      if (esRef.current) esRef.current.close();

      setStatus("connecting");
      const es = new EventSource(`/api/chat/sse?session_id=${sessionId}`);
      esRef.current = es;

      es.onopen = () => {
        setStatus("connected");
        retryRef.current = 0;
      };

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

        if (type === "message.updated") {
          // track which messageIDs belong to each role
          const info = (props.info || {}) as Record<string, unknown>;
          if (typeof info.id === "string") {
            if (info.role === "assistant") {
              assistantMsgIdsRef.current.add(info.id);
              setIsStreaming(true);
            } else if (info.role === "user") {
              userMsgIdsRef.current.add(info.id);
            }
          }
        } else if (type === "message.part.delta") {
          // streaming models: accumulate deltas
          if (props.field === "text" && typeof props.delta === "string" && props.delta !== "") {
            setIsStreaming(true);
            bufferRef.current += props.delta as string;
            cancelAnimationFrame(rafRef.current);
            activePartIdRef.current = props.partID as string ?? "streaming";

            rafRef.current = requestAnimationFrame(() => {
              const delta = bufferRef.current;
              bufferRef.current = "";
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  const parts = [...last.parts];
                  const textIdx = parts.findIndex((p) => p.type === "text");
                  if (textIdx >= 0) {
                    parts[textIdx] = { ...parts[textIdx], text: (parts[textIdx].text ?? "") + delta };
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
        } else if (type === "message.part.updated") {
          // non-streaming models: full text arrives here
          const part = (props.part || {}) as Record<string, unknown>;
          const msgId = part.messageID as string | undefined;
          const isKnownAssistant = msgId ? assistantMsgIdsRef.current.has(msgId) : false;
          const isKnownUser = msgId ? userMsgIdsRef.current.has(msgId) : false;
          // render if explicitly assistant, or if unknown (missed message.updated) and not user
          if (
            part.type === "text" &&
            typeof part.text === "string" &&
            part.text !== "" &&
            msgId &&
            (isKnownAssistant || !isKnownUser)
          ) {
            const fullText = part.text as string;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                const parts = [...last.parts];
                const textIdx = parts.findIndex((p) => p.type === "text");
                if (textIdx >= 0) {
                  parts[textIdx] = { ...parts[textIdx], text: fullText };
                } else {
                  parts.push({ type: "text", text: fullText });
                }
                return [...prev.slice(0, -1), { ...last, parts }];
              }
              return [
                ...prev,
                {
                  id: `assistant-${Date.now()}`,
                  role: "assistant",
                  parts: [{ type: "text", text: fullText }],
                  sessionId,
                },
              ];
            });
          }
        } else if (type === "session.status") {
          const statusType = (props.status as Record<string, string>)?.type;
          if (statusType === "busy") setIsStreaming(true);
          else if (statusType === "idle") setIsStreaming(false);
        } else if (type === "session.idle") {
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
        esRef.current?.close();
        const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
        retryRef.current += 1;
        setTimeout(connect, delay);
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
