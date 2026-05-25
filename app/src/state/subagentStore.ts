import { create } from "zustand";
import type { UIMessagePart } from "../types";

/**
 * Substore for `data-subagent-event` records.
 *
 * Each subagent invocation is keyed by its parent's `toolCallId` (stable for
 * the lifetime of the parent's stream). The substore reduces the inner
 * AI-SDK events (reasoning-*, tool-input-*, tool-output-*, text-*) into a
 * single `parts: UIMessagePart[]` array that the `SubagentTool` renders.
 */
export type SubagentEvent =
  | {
      kind: "start";
      sessionId: string;
      parentToolCallId: string;
      agentName: string;
      parentSessionId?: string;
    }
  | { kind: "stop"; sessionId: string; parentToolCallId: string }
  | {
      kind: "event";
      sessionId: string;
      parentToolCallId: string;
      event: WireEvent;
    };

type WireEvent =
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-output-available"; toolCallId: string; output: unknown }
  | { type: "tool-output-error"; toolCallId: string; errorText: string };

export type SubagentSession = {
  sessionId: string;
  parentToolCallId: string;
  agentName: string;
  status: "pending" | "running" | "done" | "error";
  startedAt: number | null;
  endedAt: number | null;
  parts: UIMessagePart[];
  /** Per-id status for in-flight reasoning/text streams. */
  streaming: { reasoning: Set<string>; text: Set<string> };
};

type State = {
  byParentToolCallId: Record<string, SubagentSession>;
  apply: (e: SubagentEvent) => void;
  reset: () => void;
};

function emptySession(
  sessionId: string,
  parentToolCallId: string,
  agentName: string
): SubagentSession {
  return {
    sessionId,
    parentToolCallId,
    agentName,
    status: "pending",
    startedAt: null,
    endedAt: null,
    parts: [],
    streaming: { reasoning: new Set(), text: new Set() },
  };
}

function clone(s: SubagentSession): SubagentSession {
  return {
    ...s,
    parts: s.parts.slice(),
    streaming: {
      reasoning: new Set(s.streaming.reasoning),
      text: new Set(s.streaming.text),
    },
  };
}

function applyEvent(session: SubagentSession, ev: WireEvent): SubagentSession {
  const next = clone(session);
  switch (ev.type) {
    case "reasoning-start": {
      next.parts.push({ type: "reasoning", text: "", state: "streaming" });
      next.streaming.reasoning.add(ev.id);
      // Tag the part with its id by attaching to a private field is overkill — instead
      // assume reasoning-* events arrive in order and target the latest open block.
      return next;
    }
    case "reasoning-delta": {
      const idx = lastIndexOf(next.parts, (p) => p.type === "reasoning" && p.state === "streaming");
      if (idx === -1) return next;
      const prev = next.parts[idx] as Extract<UIMessagePart, { type: "reasoning" }>;
      next.parts[idx] = { ...prev, text: prev.text + ev.delta };
      return next;
    }
    case "reasoning-end": {
      const idx = lastIndexOf(next.parts, (p) => p.type === "reasoning" && p.state === "streaming");
      if (idx === -1) return next;
      const prev = next.parts[idx] as Extract<UIMessagePart, { type: "reasoning" }>;
      next.parts[idx] = { ...prev, state: "done" };
      next.streaming.reasoning.delete(ev.id);
      return next;
    }
    case "text-start": {
      next.parts.push({ type: "text", text: "", state: "streaming" });
      next.streaming.text.add(ev.id);
      return next;
    }
    case "text-delta": {
      const idx = lastIndexOf(next.parts, (p) => p.type === "text" && p.state === "streaming");
      if (idx === -1) return next;
      const prev = next.parts[idx] as Extract<UIMessagePart, { type: "text" }>;
      next.parts[idx] = { ...prev, text: prev.text + ev.delta };
      return next;
    }
    case "text-end": {
      const idx = lastIndexOf(next.parts, (p) => p.type === "text" && p.state === "streaming");
      if (idx === -1) return next;
      const prev = next.parts[idx] as Extract<UIMessagePart, { type: "text" }>;
      next.parts[idx] = { ...prev, state: "done" };
      next.streaming.text.delete(ev.id);
      return next;
    }
    case "tool-input-available": {
      next.parts.push({
        type: `tool-${ev.toolName}`,
        toolCallId: ev.toolCallId,
        state: "input-available",
        input: ev.input,
      });
      return next;
    }
    case "tool-output-available": {
      const idx = next.parts.findIndex(
        (p) => p.type.startsWith("tool-") && (p as { toolCallId: string }).toolCallId === ev.toolCallId
      );
      if (idx === -1) return next;
      next.parts[idx] = {
        ...(next.parts[idx] as Extract<UIMessagePart, { type: `tool-${string}` }>),
        state: "output-available",
        output: ev.output,
      };
      return next;
    }
    case "tool-output-error": {
      const idx = next.parts.findIndex(
        (p) => p.type.startsWith("tool-") && (p as { toolCallId: string }).toolCallId === ev.toolCallId
      );
      if (idx === -1) return next;
      next.parts[idx] = {
        ...(next.parts[idx] as Extract<UIMessagePart, { type: `tool-${string}` }>),
        state: "output-error",
        errorText: ev.errorText,
      };
      return next;
    }
    default:
      return next;
  }
}

function lastIndexOf<T>(arr: T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

export const useSubagentStore = create<State>((set) => ({
  byParentToolCallId: {},
  apply(e) {
    set((s) => {
      const existing = s.byParentToolCallId[e.parentToolCallId];
      let session =
        existing ??
        emptySession(
          e.kind === "start" ? e.sessionId : "unknown",
          e.parentToolCallId,
          e.kind === "start" ? e.agentName : "subagent"
        );

      if (e.kind === "start") {
        session = {
          ...session,
          sessionId: e.sessionId,
          agentName: e.agentName,
          status: "running",
          startedAt: session.startedAt ?? Date.now(),
        };
      } else if (e.kind === "stop") {
        session = { ...session, status: "done", endedAt: Date.now() };
      } else {
        session = applyEvent(session, e.event);
      }

      return {
        byParentToolCallId: {
          ...s.byParentToolCallId,
          [e.parentToolCallId]: session,
        },
      };
    });
  },
  reset() {
    set({ byParentToolCallId: {} });
  },
}));

/** Convenience hook scoped to a single parent tool-call id. */
export function useSubagent(parentToolCallId: string): SubagentSession | undefined {
  return useSubagentStore((s) => s.byParentToolCallId[parentToolCallId]);
}
