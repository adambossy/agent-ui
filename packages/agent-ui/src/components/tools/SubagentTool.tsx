import { useState } from "react";
import { ChevronRight, Sparkles, ExternalLink, Loader2, Check } from "lucide-react";
import type { ToolRendererProps } from "../../tools/registry";
import { useSubagent } from "../../state/subagentStore";
import { resolveToolRenderer } from "../../tools/registry";
import { Reasoning } from "../Reasoning";
import { Markdown } from "../Markdown";
import type { UIMessagePart } from "../../types";

// Color tint hashed from agent name — same name always gets the same hue.
function tintFor(agentName: string): string {
  let h = 0;
  for (let i = 0; i < agentName.length; i++) h = (h * 31 + agentName.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 55%)`;
}

type Props = ToolRendererProps & { allowExpand?: boolean };

export function SubagentTool({ part, allowExpand = true }: Props) {
  const sub = useSubagent(part.toolCallId);
  const [open, setOpen] = useState(false);
  const agentName = sub?.agentName ?? part.type.slice("tool-".length);
  const tint = tintFor(agentName);
  const status: "starting" | "running" | "done" | "error" = (() => {
    if (!sub) return "starting";
    if (sub.status === "done") return "done";
    if (sub.status === "error") return "error";
    return "running";
  })();

  const isRunning = status === "running" || status === "starting";
  const childSessionId = sub?.sessionId ?? (part.output as { sessionId?: string } | undefined)?.sessionId;
  const counts = countActivity(sub?.parts ?? []);
  const elapsed = sub?.startedAt
    ? Math.max(0, Math.round(((sub.endedAt ?? Date.now()) - sub.startedAt) / 100) / 10)
    : null;

  return (
    <div
      className="my-2 rounded-lg border bg-card overflow-hidden max-w-full"
      style={{ borderColor: tint, boxShadow: `0 0 0 1px ${tint}22 inset` }}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {allowExpand && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse subagent" : "Expand subagent"}
            className="inline-flex items-center justify-center w-7 h-7 -ml-1 rounded hover:bg-accent cursor-pointer"
          >
            <ChevronRight
              size={14}
              className={"transition-transform " + (open ? "rotate-90" : "")}
            />
          </button>
        )}
        <Sparkles size={14} style={{ color: tint }} className="shrink-0" />
        <span className="font-medium truncate">{agentName}</span>
        <StatusBadge status={status} tint={tint} />
        <span className="ml-auto inline-flex items-center gap-3 text-[11px] text-muted-foreground">
          {counts.tools > 0 && <span>{counts.tools} tools</span>}
          {elapsed !== null && <span>{elapsed}s</span>}
          {childSessionId && (
            <a
              href={`/c/${childSessionId}`}
              onClick={(e) => {
                e.preventDefault();
                // openSession primitive — for MVP just navigate via the router.
                window.history.pushState({}, "", `/c/${childSessionId}`);
                window.dispatchEvent(new PopStateEvent("popstate"));
              }}
              className="inline-flex items-center gap-1 hover:text-foreground"
              aria-label={`Open ${agentName} as session`}
            >
              Open <ExternalLink size={11} />
            </a>
          )}
        </span>
      </div>

      {allowExpand && open && (
        <div
          className="border-t px-3 py-3"
          style={{
            borderColor: `${tint}33`,
            background: `${tint}08`,
          }}
        >
          {!sub || sub.parts.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              <Loader2 size={12} className="inline mr-1 animate-spin" />
              Subagent is starting…
            </div>
          ) : (
            <SubagentTranscript parts={sub.parts} isRunning={isRunning} />
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  tint,
}: {
  status: "starting" | "running" | "done" | "error";
  tint: string;
}) {
  if (status === "running" || status === "starting") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider"
        style={{ background: `${tint}22`, color: tint }}
      >
        <span className="pulse-dot">●</span>
        running
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/30">
        <Check size={10} />
        done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider text-destructive bg-destructive/10">
      error
    </span>
  );
}

function SubagentTranscript({
  parts,
  isRunning,
}: {
  parts: UIMessagePart[];
  isRunning: boolean;
}) {
  const lastReasoningIdx = lastIndexOf(parts, (p) => p.type === "reasoning");
  const lastTextIdx = lastIndexOf(parts, (p) => p.type === "text");
  return (
    <div className="text-[13px] leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === "reasoning") {
          return (
            <Reasoning
              key={i}
              text={part.text}
              isStreaming={(part.state === "streaming") || (isRunning && i === lastReasoningIdx && part.state !== "done")}
            />
          );
        }
        if (part.type === "text") {
          const streaming =
            part.state === "streaming" || (isRunning && i === lastTextIdx && part.state !== "done");
          return (
            <div
              key={i}
              className={"my-2 " + (streaming ? "streaming-caret" : "")}
            >
              <Markdown isStreaming={streaming}>{part.text}</Markdown>
            </div>
          );
        }
        if (part.type.startsWith("tool-")) {
          const toolPart = part as Extract<UIMessagePart, { type: `tool-${string}` }>;
          const toolName = toolPart.type.slice("tool-".length);
          const R = resolveToolRenderer(toolName, { insideSubagent: true });
          return <R key={i} part={toolPart} />;
        }
        return null;
      })}
    </div>
  );
}

function countActivity(parts: UIMessagePart[]): { tools: number } {
  let tools = 0;
  for (const p of parts) if (p.type.startsWith("tool-")) tools++;
  return { tools };
}

function lastIndexOf<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}
