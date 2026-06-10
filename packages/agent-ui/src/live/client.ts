import { randomUUID } from "../lib/uuid";
import { useLiveDocStore } from "./store";

/**
 * Outbound op dispatcher.
 *
 * Optimistically apply via the doc store, then POST to the server. The
 * server's broadcast (`data-live-op { kind: "op-applied" }`) confirms;
 * `op-rejected` rolls back.
 */
export class LiveOpClient {
  readonly sessionId: string;
  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  async send(kind: string, docId: string, op: unknown): Promise<void> {
    const opId = randomUUID();
    const store = useLiveDocStore.getState();
    const k = `${kind}::${docId}`;
    const entry = store.docs[k];
    const baseSeq = entry?.serverSeq ?? 0;

    store.enqueuePending(kind, docId, opId, op);

    try {
      const res = await fetch(`/api/live/${encodeURIComponent(kind)}/${encodeURIComponent(docId)}/op`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, op, baseSeq, sessionId: this.sessionId }),
      });
      if (!res.ok) {
        const reason = await res
          .json()
          .then((j: { reason?: string; error?: string }) => j.reason ?? j.error ?? String(res.status))
          .catch(() => String(res.status));
        store.rollbackPending(docId, opId, reason);
      }
      // 2xx: the SSE broadcast will resolve the pending entry. No-op here.
    } catch (e) {
      store.rollbackPending(docId, opId, e instanceof Error ? e.message : String(e));
    }
  }
}
