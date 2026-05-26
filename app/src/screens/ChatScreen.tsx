import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { Message } from "../components/Message";
import { Composer } from "../components/Composer";
import { useSubagentStore, type SubagentEvent } from "../state/subagentStore";
import { BACKEND_MODE, isUuid, makeTransport, newSessionId, primeRealBackend } from "../backend";
import { useLiveDocStore } from "../live";
import type { LiveOpEvent } from "../live";
import type { UIMessage } from "../types";

export function ChatScreen() {
  const params = useParams();
  const navigate = useNavigate();

  // Pick a stable session id. In real mode we always need a UUID (the
  // template's POST /api/chat schema requires it); in mock mode anything
  // is fine but using a UUID keeps the URL shareable across modes.
  const sessionId = useMemo(() => {
    if (params.sessionId && (BACKEND_MODE !== "real" || isUuid(params.sessionId))) {
      return params.sessionId;
    }
    return newSessionId();
  }, [params.sessionId]);

  // If we minted a fresh id (URL was "/" or had a non-UUID), reflect it.
  useEffect(() => {
    if (params.sessionId !== sessionId) {
      navigate(`/c/${sessionId}`, { replace: true });
    }
  }, [sessionId, params.sessionId, navigate]);

  // Real backend needs a guest cookie before the first POST.
  useEffect(() => {
    void primeRealBackend();
  }, []);

  const applySubagent = useSubagentStore((s) => s.apply);
  const applyLiveOp = useLiveDocStore((s) => s.apply);
  const transport = useMemo(() => makeTransport(sessionId), [sessionId]);

  const { messages, sendMessage, status } = useChat({
    id: sessionId,
    transport,
    // Real backend (vercel/chatbot template) requires UUIDs for user message
    // ids. Using crypto.randomUUID() for every generated id keeps mock + real
    // happy.
    generateId: () => crypto.randomUUID(),
    onData: (part) => {
      if (part.type === "data-subagent-event") {
        applySubagent(part.data as SubagentEvent);
      } else if (part.type === "data-live-op") {
        applyLiveOp(part.data as LiveOpEvent);
      }
    },
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
            <EmptyState
              backend={BACKEND_MODE}
              onPick={(prompt) => sendMessage({ text: prompt })}
            />
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

function EmptyState({
  backend,
  onPick,
}: {
  backend: "mock" | "real";
  onPick: (prompt: string) => void;
}) {
  const mockPrompts = [
    { label: "What's the weather in San Francisco?", demo: "weather" },
    { label: "Compare the weather in San Francisco, Tokyo, and London in parallel.", demo: "parallel · uniform" },
    { label: "Build me a quick AAPL dossier — stock, weather at HQ, recent earnings.", demo: "parallel · staggered" },
    { label: "Research the Roman aqueducts and have a writer draft an opening.", demo: "subagent" },
    { label: "Make me a packing list for a 3-day Tokyo trip.", demo: "live · todo-list" },
  ];
  const realPrompts = [
    {
      label: "What's the weather in San Francisco?",
      demo: "single tool · getWeather",
    },
    {
      label:
        "What's the current weather in San Francisco, Tokyo, and London? Call getWeather for each city in parallel.",
      demo: "parallel tool calls · 3× getWeather",
    },
    {
      label:
        "Look up the weather in San Francisco, then create a short markdown document summarising it.",
      demo: "staggered · getWeather + createDocument",
    },
    {
      label: "Write a short markdown document explaining how a transformer model works.",
      demo: "artifact · createDocument",
    },
  ];
  const prompts = backend === "real" ? realPrompts : mockPrompts;
  return (
    <div className="flex h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="text-2xl sm:text-3xl font-semibold">What can I help with?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {backend === "real" ? (
          <>
            <strong>Real backend</strong> — talking to the vercel/chatbot template on
            <code className="ml-1">localhost:3001</code> via Claude Sonnet 4.5. The template
            exposes <code>getWeather</code> and the <code>createDocument</code> artifact tool; <em>subagent</em> delegation
            is not implemented in the template and would require a backend addition.
          </>
        ) : (
          <>Try one of the mock demos below — keywords like <em>parallel</em> or <em>research</em> route to different scripted turns.</>
        )}
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
