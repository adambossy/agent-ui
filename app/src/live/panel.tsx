import { useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { useLiveDoc } from "./store";
import { LiveOpClient } from "./client";
import { getLiveComponent } from "./registry";
import { useLiveUIStore } from "./ui-store";
import type { LiveDocMeta } from "./types";

/**
 * The right-side artifact panel.
 *
 * Mounted at chat-screen level. Reads the UI store's `activeDoc` and
 * renders the matching manifest's renderer. The renderer receives a
 * dispatch fn bound to the live op client; user clicks mutate the
 * server-authoritative doc.
 *
 * One panel per chat, one doc per panel at a time. Multiple docs in a
 * session share the panel — opening a different pill swaps which doc
 * is shown.
 */
export function LiveDocsPanel() {
  const active = useLiveUIStore((s) => s.activeDoc);
  const close = useLiveUIStore((s) => s.closeDoc);

  if (!active) return null;
  return <LiveDocPanelBody kind={active.kind} docId={active.docId} onClose={close} />;
}

function LiveDocPanelBody({
  kind,
  docId,
  onClose,
}: {
  kind: string;
  docId: string;
  onClose: () => void;
}) {
  const entry = useLiveDoc(kind, docId);
  const manifest = getLiveComponent(kind);

  const client = useMemo(() => new LiveOpClient(`session:${docId}`), [docId]);
  const dispatch = useCallback(
    (op: unknown) => {
      void client.send(kind, docId, op);
    },
    [client, kind, docId]
  );

  const title = manifest?.kind ?? kind;

  return (
    <section
      aria-label={`${title} document panel`}
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <header className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Live · {title}
          </span>
          <code className="text-[11px] text-muted-foreground/70 truncate">
            {docId.slice(0, 8)}
          </code>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="inline-flex items-center justify-center w-9 h-9 -mr-2 rounded-md hover:bg-accent"
        >
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {!manifest ? (
          <Fallback>
            Unknown live component kind: <code>{kind}</code>
          </Fallback>
        ) : !entry ? (
          <Fallback>
            Loading <code>{kind}</code> document <code>{docId.slice(0, 8)}</code>…
          </Fallback>
        ) : !manifest.schemaVersions.includes(entry.schemaVersion) ? (
          <Fallback>
            Unsupported {kind} schema version: {entry.schemaVersion}
          </Fallback>
        ) : (
          (() => {
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
              <div className="max-w-xl mx-auto">
                <Renderer doc={entry.payload} dispatch={dispatch} meta={meta} />
                {meta.lastError && (
                  <div className="mt-2 text-xs text-destructive">{meta.lastError}</div>
                )}
              </div>
            );
          })()
        )}
      </div>
    </section>
  );
}

function Fallback({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
      {children}
    </div>
  );
}
