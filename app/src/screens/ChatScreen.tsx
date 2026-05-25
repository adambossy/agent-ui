import { useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Message } from "../components/Message";
import { Composer } from "../components/Composer";
import type { UIMessage } from "../types";

export function ChatScreen() {
  const params = useParams();
  const sessionId = params.sessionId ?? "new";

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    []
  );

  const { messages, sendMessage, status } = useChat({
    id: sessionId,
    transport,
  });

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const isStreaming = status === "streaming" || status === "submitted";
  const showEmpty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-3 sm:px-4 pt-4 pb-2">
          {showEmpty ? (
            <EmptyState onPick={(prompt) => sendMessage({ text: prompt })} />
          ) : (
            messages.map((m, i) => (
              <Message
                key={m.id ?? i}
                message={m as unknown as UIMessage}
                isStreaming={isStreaming && i === messages.length - 1}
              />
            ))
          )}
        </div>
      </div>

      <Composer
        disabled={isStreaming}
        onSend={(text) => sendMessage({ text })}
      />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  const prompts: { label: string; demo: string }[] = [
    { label: "What's the weather in San Francisco?", demo: "weather" },
    {
      label: "Compare the weather in San Francisco, Tokyo, and London in parallel.",
      demo: "parallel · uniform",
    },
    {
      label: "Build me a quick AAPL dossier — stock, weather at HQ, recent earnings.",
      demo: "parallel · staggered",
    },
    {
      label: "Research the Roman aqueducts and have a writer draft an opening.",
      demo: "subagent",
    },
  ];
  return (
    <div className="flex h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="text-2xl sm:text-3xl font-semibold">What can I help with?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Try one of the mock demos below — keywords like <em>parallel</em> or <em>research</em> route to different scripted turns.
      </p>
      <div className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2">
        {prompts.map((p) => (
          <button
            key={p.demo}
            type="button"
            onClick={() => onPick(p.label)}
            className="text-left text-sm border border-border rounded-xl px-4 py-3 hover:bg-accent transition-colors"
          >
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
              {p.demo}
            </span>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
