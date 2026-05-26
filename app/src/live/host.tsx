import { useCallback, useMemo } from "react";
import { useLiveDoc } from "./store";
import { LiveOpClient } from "./client";
import { getLiveComponent, getLiveComponentByToolName } from "./registry";
import type { ToolRendererProps } from "../tools/registry";
import type { LiveDocMeta } from "./types";

/**
 * Generic host for live-component renderers.
 *
 * Registered against the tool-renderer registry for every primary tool
 * name of every registered live component. When a `tool-<primary>` part
 * appears, the host:
 *   - extracts docId from the tool input
 *   - looks up the manifest by tool name → kind
 *   - subscribes to the doc store at (kind, docId)
 *   - hands the manifest renderer the current payload + a dispatch fn
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
  return <LiveDocView kind={binding.kind} docId={docId} />;
}

/** Renders a doc by kind + id, regardless of which tool call surfaced it. */
function LiveDocView({ kind, docId }: { kind: string; docId: string }) {
  const entry = useLiveDoc(kind, docId);
  const manifest = getLiveComponent(kind);

  const client = useMemo(() => new LiveOpClient(`session:${docId}`), [docId]);

  const dispatch = useCallback(
    (op: unknown) => {
      void client.send(kind, docId, op);
    },
    [client, kind, docId]
  );

  if (!manifest) {
    return (
      <div className="my-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Unknown live component kind: <code>{kind}</code>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="my-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        Loading <code>{kind}</code> document <code>{docId.slice(0, 8)}</code>…
      </div>
    );
  }

  if (!manifest.schemaVersions.includes(entry.schemaVersion)) {
    return (
      <div className="my-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        Unsupported {kind} schema version: {entry.schemaVersion}
      </div>
    );
  }

  const meta: LiveDocMeta = {
    kind: entry.kind,
    docId: entry.docId,
    schemaVersion: entry.schemaVersion,
    serverSeq: entry.serverSeq,
    pending: entry.pendingOps.map((p) => ({ opId: p.opId })),
    status: entry.status,
    lastError: entry.lastError,
  };

  const Renderer = manifest.renderer as React.ComponentType<{
    doc: unknown;
    dispatch: (op: unknown) => void;
    meta: LiveDocMeta;
  }>;

  return (
    <div className="my-3">
      <Renderer doc={entry.payload} dispatch={dispatch} meta={meta} />
      {meta.lastError && (
        <div className="mt-1 text-[11px] text-destructive">{meta.lastError}</div>
      )}
    </div>
  );
}

/** Hidden renderer for op-emitter tools — returns null so they don't
 *  clutter the transcript. The live doc updates via the SSE broadcast. */
export function HiddenLiveOpTool(): null {
  return null;
}
