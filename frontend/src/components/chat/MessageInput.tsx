import { useRef, useState, KeyboardEvent } from "react";
import { Send } from "lucide-react";

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
    }
    onSend(text);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "40px";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex gap-2 p-3 border-t border-zinc-800 bg-zinc-950">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        disabled={disabled}
        placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
        className="input flex-1 resize-none min-h-[40px] max-h-40 py-2 leading-relaxed"
        rows={1}
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="btn-primary px-3 self-end shrink-0"
        aria-label="Send"
      >
        <Send size={16} />
      </button>
    </div>
  );
}
