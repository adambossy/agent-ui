import { useEffect } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { useLiveDoc } from "./store";
import { getLiveComponent, getLiveComponentByToolName } from "./registry";
import { useLiveUIStore } from "./ui-store";
import type { ToolRendererProps } from "../tools/registry";

/**
 * Inline pill for a live document.
 *
 * Registered against the tool-renderer registry for every primary tool
 * name of every registered live component. When the LLM emits the
 * tool-input-available, this renders a compact pill in the transcript,
 * auto-opens the doc in the side panel, and lets the user re-open by
 * clicking the pill later.
 *
 * The full interactive renderer lives in <LiveDocsPanel> (see panel.tsx).
 */
export function LiveComponentHost({ part }: ToolRendererProps) {
  const toolName = part.type.slice("tool-".length);
  const binding = getLiveComponentByToolName(toolName);
  const docId = (part.input as { docId?: string } | undefined)?.docId;

  if (!binding || !docId) {
    return (
      <div className="my-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <code>{toolName}</code>: live component not bound (no docId).
      </div>
    );
  }
  return <LiveDocPill kind={binding.kind} docId={docId} />;
}

function LiveDocPill({ kind, docId }: { kind: string; docId: string }) {
  const entry = useLiveDoc(kind, docId);
  const openDoc = useLiveUIStore((s) => s.openDoc);
  const activeDoc = useLiveUIStore((s) => s.activeDoc);
  const manifest = getLiveComponent(kind);

  // Auto-open this doc in the panel on first mount (artifact-style UX).
  useEffect(() => {
    openDoc(kind, docId);
    // Intentional: only on first mount of THIS pill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isActive = activeDoc?.docId === docId;
  const title = describeDoc(kind, entry?.payload);

  return (
    <button
      type="button"
      onClick={() => openDoc(kind, docId)}
      className={
        "my-2 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-left transition-colors " +
        (isActive
          ? "bg-accent/60 border-foreground/30"
          : "bg-card border-border hover:bg-accent/40")
      }
      aria-label={`Open ${manifest?.kind ?? kind} in panel`}
    >
      <FileText size={14} className="text-muted-foreground shrink-0" />
      <span className="font-medium truncate max-w-[28ch]">{title}</span>
      <span className="text-[11px] text-muted-foreground shrink-0">
        {isActive ? "open ↗" : "open in panel ↗"}
      </span>
      <ExternalLink size={12} className="text-muted-foreground/70 shrink-0" />
    </button>
  );
}

/**
 * Best-effort doc title. Per-kind labelling lives here so the chat core
 * gets useful pills without each extension reimplementing the same
 * "what to put in the pill" logic. Extensions can override later by
 * adding a `summarize(payload)` field to the manifest.
 */
function describeDoc(kind: string, payload: unknown): string {
  if (kind === "todo-list" && payload && typeof payload === "object" && "items" in payload) {
    const items = (payload as { items: unknown[] }).items;
    const count = Array.isArray(items) ? items.length : 0;
    return `Todo list · ${count} item${count === 1 ? "" : "s"}`;
  }
  return kind;
}

/** Hidden renderer for op-emitter tools — returns null so they do not
 *  clutter the transcript. The live doc updates via the SSE broadcast. */
export function HiddenLiveOpTool(): null {
  return null;
}
