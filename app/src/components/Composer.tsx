import { useState, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, Sparkles } from "lucide-react";
import { BACKEND_MODE } from "../backend";

type Props = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

export function Composer({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");

  function submit() {
    const v = value.trim();
    if (!v || disabled) return;
    setValue("");
    onSend(v);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div
      className="sticky bottom-0 bg-background"
      style={{
        paddingBottom: "calc(var(--safe-bottom) + 0.5rem)",
        paddingTop: "0.5rem",
      }}
    >
      <div className="mx-auto max-w-3xl px-3">
        <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-ring transition-colors">
          <textarea
            className="w-full min-h-[56px] max-h-[180px] resize-none bg-transparent px-4 pt-3 pb-1 text-[15px] outline-none placeholder:text-muted-foreground"
            placeholder="Ask anything…"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            aria-label="Chat input"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Attach file"
                className="inline-flex items-center justify-center w-11 h-11 -ml-1 rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
                disabled
              >
                <Paperclip size={16} />
              </button>
              <div className="inline-flex items-center gap-1 px-2 h-9 rounded-md text-xs text-muted-foreground">
                <Sparkles size={13} />
                <span>
                  {BACKEND_MODE === "real" ? "Claude Sonnet 4.5" : "Mock backend"}
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Send"
              onClick={submit}
              disabled={disabled || !value.trim()}
              className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-2">
          {BACKEND_MODE === "real"
            ? "Connected to vercel/chatbot · Anthropic"
            : "Phase 1 MVP · canned response from /api/chat"}
        </p>
      </div>
    </div>
  );
}
