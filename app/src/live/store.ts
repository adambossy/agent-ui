import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { getLiveComponent } from "./registry";
import type { DocStatus, LiveOpEvent } from "./types";

/**
 * Per-doc state. The chat core knows only `unknown` payloads; per-kind
 * typing happens at the renderer boundary via casting against the
 * manifest's generic params.
 */
export type LiveDocEntry = {
  kind: string;
  docId: string;
  schemaVersion: number;
  payload: unknown;
  pendingOps: Array<{ opId: string; op: unknown }>;
  serverSeq: number;
  status: DocStatus;
  lastError: string | null;
};

type LiveDocStoreState = {
  docs: Record<string, LiveDocEntry>;
  apply(event: LiveOpEvent): void;
  enqueuePending(kind: string, docId: string, opId: string, op: unknown): void;
  resolvePending(docId: string, opId: string): void;
  rollbackPending(docId: string, opId: string, reason: string): void;
  /** Test-only / mock-only seam. */
  reset(): void;
};

function key(kind: string, docId: string): string {
  return `${kind}::${docId}`;
}

function applyOpToState(
  entry: LiveDocEntry,
  unknownOp: unknown
): { ok: true; next: unknown } | { ok: false; error: string } {
  const manifest = getLiveComponent(entry.kind);
  if (!manifest) {
    return { ok: false, error: `no manifest registered for kind="${entry.kind}"` };
  }
  const parsed = manifest.opCodec.safeParse(unknownOp);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const next = manifest.reducer(entry.payload, parsed.op);
    return { ok: true, next };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const useLiveDocStore = create<LiveDocStoreState>((set) => ({
  docs: {},

  apply(event) {
    set((state) => {
      switch (event.kind) {
        case "doc-init": {
          const k = key(event.componentKind, event.docId);
          // If we already saw this doc-init (e.g. resume) keep pending ops.
          const prior = state.docs[k];
          return {
            docs: {
              ...state.docs,
              [k]: {
                kind: event.componentKind,
                docId: event.docId,
                schemaVersion: event.schemaVersion,
                payload: event.payload,
                pendingOps: prior?.pendingOps ?? [],
                serverSeq: event.serverSeq,
                status: "ready",
                lastError: null,
              },
            },
          };
        }
        case "op-applied": {
          const k = key(event.componentKind, event.docId);
          const entry = state.docs[k];
          if (!entry) {
            // No init? Treat as resync needed; we'll wait for a snapshot.
            return state;
          }
          // If this confirms a pending optimistic op, just drop it and
          // advance seq — the payload already reflects the op locally.
          const matchingPending = entry.pendingOps.find((p) => p.opId === event.opId);
          if (matchingPending) {
            return {
              docs: {
                ...state.docs,
                [k]: {
                  ...entry,
                  pendingOps: entry.pendingOps.filter((p) => p.opId !== event.opId),
                  serverSeq: event.serverSeq,
                  status: "ready",
                  lastError: null,
                },
              },
            };
          }
          // Otherwise this is an LLM-originated op (or a peer's op) we
          // haven't applied yet — apply now.
          const result = applyOpToState(entry, event.op);
          if (!result.ok) {
            return {
              docs: {
                ...state.docs,
                [k]: { ...entry, status: "error", lastError: result.error },
              },
            };
          }
          return {
            docs: {
              ...state.docs,
              [k]: {
                ...entry,
                payload: result.next,
                serverSeq: event.serverSeq,
                status: "ready",
                lastError: null,
              },
            },
          };
        }
        case "op-rejected": {
          // We don't have the componentKind on this event, find by docId.
          const k = Object.keys(state.docs).find((kk) => state.docs[kk].docId === event.docId);
          if (!k) return state;
          const entry = state.docs[k];
          const dropped = entry.pendingOps.find((p) => p.opId === event.opId);
          if (!dropped) return state;
          // Rollback: re-derive from confirmed payload by replaying the
          // remaining pending ops on top.
          let payload = entry.payload;
          const manifest = getLiveComponent(entry.kind);
          const remaining = entry.pendingOps.filter((p) => p.opId !== event.opId);
          if (manifest) {
            const start: unknown = entry.payload;
            payload = remaining.reduce<unknown>((acc, p) => {
              const r = applyOpToState({ ...entry, payload: acc }, p.op);
              return r.ok ? r.next : acc;
            }, start);
          }
          return {
            docs: {
              ...state.docs,
              [k]: {
                ...entry,
                payload,
                pendingOps: remaining,
                status: "ready",
                lastError: event.reason,
              },
            },
          };
        }
        case "doc-snapshot": {
          const k = key(event.componentKind, event.docId);
          return {
            docs: {
              ...state.docs,
              [k]: {
                kind: event.componentKind,
                docId: event.docId,
                schemaVersion: event.schemaVersion,
                payload: event.payload,
                pendingOps: [],
                serverSeq: event.serverSeq,
                status: "ready",
                lastError: null,
              },
            },
          };
        }
      }
    });
  },

  enqueuePending(kind, docId, opId, op) {
    set((state) => {
      const k = key(kind, docId);
      const entry = state.docs[k];
      if (!entry) return state;
      const result = applyOpToState(entry, op);
      if (!result.ok) {
        return {
          docs: {
            ...state.docs,
            [k]: { ...entry, status: "error", lastError: result.error },
          },
        };
      }
      return {
        docs: {
          ...state.docs,
          [k]: {
            ...entry,
            payload: result.next,
            pendingOps: [...entry.pendingOps, { opId, op }],
            lastError: null,
          },
        },
      };
    });
  },

  resolvePending(docId, opId) {
    set((state) => {
      const k = Object.keys(state.docs).find((kk) => state.docs[kk].docId === docId);
      if (!k) return state;
      const entry = state.docs[k];
      return {
        docs: {
          ...state.docs,
          [k]: { ...entry, pendingOps: entry.pendingOps.filter((p) => p.opId !== opId) },
        },
      };
    });
  },

  rollbackPending(docId, opId, reason) {
    // Re-uses the op-rejected reducer path.
    useLiveDocStore.getState().apply({ kind: "op-rejected", docId, opId, reason });
  },

  reset() {
    set({ docs: {} });
  },
}));

/* ---------- selector hooks --------------------------------------------- */

export function useLiveDoc(kind: string, docId: string): LiveDocEntry | undefined {
  return useLiveDocStore((s) => s.docs[key(kind, docId)]);
}

export function useLiveDocSelector<T>(
  kind: string,
  docId: string,
  selector: (entry: LiveDocEntry | undefined) => T
): T {
  return useLiveDocStore(useShallow((s) => selector(s.docs[key(kind, docId)])));
}
