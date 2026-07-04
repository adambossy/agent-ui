import type { UIMessage, UIMessagePart } from "../types";
import { resolveToolRenderer } from "../tools/registry";
import { Reasoning } from "./Reasoning";
import { Markdown } from "./Markdown";
import { stripSystemReminders } from "../reminders";

type Props = { message: UIMessage; isStreaming?: boolean };

function reasoningStreaming(
  part: Extract<UIMessagePart, { type: "reasoning" }>,
  fallback: boolean
): boolean {
  // If the AI SDK gave us a definitive state, trust it. Otherwise (part.state
  // undefined) fall back to "is the whole message still streaming?".
  if (part.state === "streaming") return true;
  if (part.state === "done") return false;
  return fallback;
}

function textStreaming(
  part: Extract<UIMessagePart, { type: "text" }>,
  fallback: boolean
): boolean {
  if (part.state === "streaming") return true;
  if (part.state === "done") return false;
  return fallback;
}

export function Message({ message, isStreaming }: Props) {
  if (message.role === "user") {
    const text = stripSystemReminders(
      message.parts
        .filter((p): p is Extract<UIMessagePart, { type: "text" }> => p.type === "text")
        .map((p) => p.text)
        .join(""),
    );
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-[78%] rounded-2xl bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 max-w-full">
      {message.parts.map((part, i) => {
        if (part.type === "reasoning") {
          const stream = reasoningStreaming(
            part,
            isStreaming === true && part === lastReasoning(message)
          );
          return <Reasoning key={i} text={part.text} isStreaming={stream} />;
        }
        if (part.type === "text") {
          const stream = textStreaming(
            part,
            isStreaming === true && part === lastText(message)
          );
          return (
            <div
              key={i}
              className={
                "text-[15px] leading-relaxed " + (stream ? "streaming-caret" : "")
              }
            >
              <Markdown isStreaming={stream}>{part.text}</Markdown>
            </div>
          );
        }
        if (part.type.startsWith("tool-")) {
          const toolPart = part as Extract<UIMessagePart, { type: `tool-${string}` }>;
          const toolName = toolPart.type.slice("tool-".length);
          const R = resolveToolRenderer(toolName);
          return <R key={i} part={toolPart} />;
        }
        // start-step / finish-step / file / data-* — ignored at this level.
        return null;
      })}
    </div>
  );
}

function lastReasoning(m: UIMessage) {
  for (let i = m.parts.length - 1; i >= 0; i--) {
    if (m.parts[i].type === "reasoning") return m.parts[i];
  }
  return null;
}
function lastText(m: UIMessage) {
  for (let i = m.parts.length - 1; i >= 0; i--) {
    if (m.parts[i].type === "text") return m.parts[i];
  }
  return null;
}
