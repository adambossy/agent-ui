import type { ServerResponse } from "node:http";
import { getLiveComponent } from "@adambossy/agent-ui";
import type { LiveOpEvent } from "@adambossy/agent-ui";

/**
 * Mock-backend in-memory doc store.
 *
 * One `Map<docId, LiveDocRecord>` per Vite-plugin process. Survives HMR
 * (module identity preserved); lost on full server restart.
 */

export type LiveDocRecord = {
  docId: string;
  kind: string;
  schemaVersion: number;
  payload: unknown;
  serverSeq: number;
  /** Open SSE responses that should receive broadcasts. */
  subscribers: Set<ServerResponse>;
};

const docs = new Map<string, LiveDocRecord>();

export function createDoc(kind: string, docId: string, seed?: unknown): LiveDocRecord {
  const manifest = getLiveComponent(kind);
  const initial = manifest?.initialState(seed) ?? { schemaVersion: 1, payload: {} };
  const record: LiveDocRecord = {
    docId,
    kind,
    schemaVersion: initial.schemaVersion,
    payload: initial.payload,
    serverSeq: 0,
    subscribers: new Set(),
  };
  docs.set(docId, record);
  return record;
}

export function getDoc(docId: string): LiveDocRecord | undefined {
  return docs.get(docId);
}

export function getOrCreateDoc(kind: string, docId: string, seed?: unknown): LiveDocRecord {
  return docs.get(docId) ?? createDoc(kind, docId, seed);
}

export function subscribe(record: LiveDocRecord, res: ServerResponse): void {
  record.subscribers.add(res);
  res.on("close", () => record.subscribers.delete(res));
}

export function broadcast(record: LiveDocRecord, event: LiveOpEvent): void {
  const frame = `data: ${JSON.stringify({ type: "data-live-op", data: event, transient: false })}\n\n`;
  for (const res of record.subscribers) {
    try {
      res.write(frame);
    } catch {
      record.subscribers.delete(res);
    }
  }
}

/**
 * Apply an op server-side, advance seq, broadcast op-applied to all
 * subscribers, and return the new payload.
 */
export function applyOpToDoc(
  record: LiveDocRecord,
  op: unknown,
  origin: "llm" | "user",
  opId: string = crypto.randomUUID()
): { serverSeq: number; payload: unknown } | { error: string } {
  const manifest = getLiveComponent(record.kind);
  if (!manifest) return { error: `unknown kind "${record.kind}"` };
  const parsed = manifest.opCodec.safeParse(op);
  if (!parsed.ok) return { error: parsed.error };
  try {
    const reducer = manifest.mockServerReducer ?? manifest.reducer;
    record.payload = reducer(record.payload, parsed.op);
    record.serverSeq += 1;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  broadcast(record, {
    kind: "op-applied",
    docId: record.docId,
    componentKind: record.kind,
    opId,
    op: parsed.op,
    serverSeq: record.serverSeq,
    origin,
  });
  return { serverSeq: record.serverSeq, payload: record.payload };
}

export function emitDocInit(record: LiveDocRecord, res: ServerResponse): void {
  subscribe(record, res);
  const frame: LiveOpEvent = {
    kind: "doc-init",
    docId: record.docId,
    componentKind: record.kind,
    schemaVersion: record.schemaVersion,
    payload: record.payload,
    serverSeq: record.serverSeq,
  };
  res.write(`data: ${JSON.stringify({ type: "data-live-op", data: frame, transient: false })}\n\n`);
}
