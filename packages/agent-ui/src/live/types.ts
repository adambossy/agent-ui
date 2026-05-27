import type { ComponentType } from "react";

/**
 * Live components — public types.
 *
 * The chat core depends on these abstractly: it never imports a specific
 * extension. Adding an extension means writing a new `LiveComponentManifest`
 * and calling `registerLiveComponent(manifest)` at module load.
 */

export type OpCodec<Op> = {
  parse(input: unknown): Op;
  safeParse(input: unknown): { ok: true; op: Op } | { ok: false; error: string };
};

export type ConflictPolicy = "reject-on-conflict" | "commute-by-id" | "commute-by-delta" | "lww";

export type LiveDocMeta = {
  kind: string;
  docId: string;
  schemaVersion: number;
  serverSeq: number;
  pending: Array<{ opId: string }>;
  status: DocStatus;
  lastError: string | null;
};

export type DocStatus = "hydrating" | "ready" | "desynced" | "error";

export type LiveRendererProps<S, Op> = {
  doc: S;
  dispatch: (op: Op) => void;
  meta: LiveDocMeta;
};

export type LiveComponentManifest<S, Op> = {
  /** Stable kind identifier — used as the doc-store key half. */
  kind: string;

  /** Versions of the payload schema this manifest renders. */
  schemaVersions: number[];

  /** Construct an empty doc payload (for client-side preview / mock seeding). */
  initialState: (seed?: unknown) => { schemaVersion: number; payload: S };

  /** Pure reducer. Must be referentially transparent — used both for
   *  optimistic apply on the client and for the mock server. */
  reducer: (state: S, op: Op) => S;

  /** Validates and parses unknown ops at the wire boundary. */
  opCodec: OpCodec<Op>;

  /** Per-op conflict policy. Default `reject-on-conflict`. */
  conflictPolicyFor?: (op: Op) => ConflictPolicy;

  /** Tool names this extension owns. The chat-core marks them at register
   *  time so the tool-renderer registry knows to route them through the
   *  live-component host instead of the default tool renderer. */
  toolNames: {
    /** Tool(s) that, when called, OPEN the document in the UI. */
    primary: string[];
    /** Tools that only emit ops; they don't get their own tool card. */
    op: string[];
  };

  /** React component that displays the doc + accepts user dispatch. */
  renderer: ComponentType<LiveRendererProps<S, Op>>;

  /** Optional migration from older payloads. */
  migrate?: (d: { schemaVersion: number; payload: unknown }) => { schemaVersion: number; payload: S };

  /** Server-side reducer (mock backend). Defaults to the client reducer. */
  mockServerReducer?: (state: S, op: Op) => S;
};

/**
 * The single SSE channel that carries live-doc traffic. Mirrors the
 * data-subagent-event pattern.
 *
 *   data: {"type":"data-live-op","data":LiveOpEvent}
 */
export type LiveOpEvent =
  | {
      kind: "doc-init";
      docId: string;
      componentKind: string;
      schemaVersion: number;
      payload: unknown;
      serverSeq: number;
    }
  | {
      kind: "op-applied";
      docId: string;
      componentKind: string;
      opId: string;
      op: unknown;
      serverSeq: number;
      origin: "llm" | "user";
    }
  | { kind: "op-rejected"; docId: string; opId: string; reason: string }
  | {
      kind: "doc-snapshot";
      docId: string;
      componentKind: string;
      schemaVersion: number;
      payload: unknown;
      serverSeq: number;
    };

/** Outbound op POSTed by the user via LiveOpClient. */
export type OutboundOpRequest = {
  opId: string;
  op: unknown;
  baseSeq: number;
  sessionId: string;
};
