import { DefaultChatTransport } from "ai";
import type { ChatTransport, UIMessage } from "ai";

declare const __BACKEND_MODE__: string;
export const BACKEND_MODE: "mock" | "real" =
  (typeof __BACKEND_MODE__ !== "undefined" ? __BACKEND_MODE__ : "mock") as "mock" | "real";

export const DEFAULT_REAL_MODEL = "claude-sonnet-4-5-20250929";

/**
 * Returns a transport bound to the active backend. In "real" mode the
 * request body is reshaped to match the vercel/chatbot template's schema
 * (`{ id, message, selectedChatModel, selectedVisibilityType }`).
 */
export function makeTransport(_sessionId: string): ChatTransport<UIMessage> {
  if (BACKEND_MODE === "real") {
    return new DefaultChatTransport<UIMessage>({
      api: "/api/chat",
      credentials: "include",
      prepareSendMessagesRequest: ({ id, messages, trigger }) => {
        // The template expects a single `message` (latest user message), not the
        // whole array. Tool-approval flow uses `messages: [...]` instead; we
        // don't exercise that path yet.
        const latest = messages[messages.length - 1];
        if (trigger === "submit-message" && latest?.role === "user") {
          return {
            body: {
              id,
              message: {
                id: latest.id,
                role: "user",
                parts: latest.parts,
              },
              selectedChatModel: DEFAULT_REAL_MODEL,
              selectedVisibilityType: "private",
            },
          };
        }
        // Regenerate / other triggers — send messages as a fallback.
        return {
          body: {
            id,
            messages,
            selectedChatModel: DEFAULT_REAL_MODEL,
            selectedVisibilityType: "private",
          },
        };
      },
    });
  }

  // Mock mode — DefaultChatTransport defaults are fine; our mock plugin
  // accepts the AI SDK's standard body shape.
  return new DefaultChatTransport<UIMessage>({
    api: "/api/chat",
  });
}

/**
 * Prime auth in real mode by hitting GET / once. The chatbot template's
 * middleware sees no auth cookie and 307s to /api/auth/guest which mints a
 * guest session and sets the cookie on the proxied origin (our 5173).
 */
let primed = false;
export async function primeRealBackend(): Promise<void> {
  if (BACKEND_MODE !== "real" || primed) return;
  primed = true;
  try {
    await fetch("/", { credentials: "include" });
  } catch {
    // Non-fatal — the next real request will retry and surface the error.
    primed = false;
  }
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function newSessionId(): string {
  return crypto.randomUUID();
}
