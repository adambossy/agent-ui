import type { ServerResponse } from "node:http";
import { Profile, ev, randomId, sleep, streamText, toolExecMs } from "../utils";

/**
 * Demonstrates the subagent extension. Two parallel subagents (`researcher`
 * and `writer`) each produce reasoning + tool calls + assistant text; their
 * events are republished on the parent's stream as `data-subagent-event`
 * records and demuxed into a per-subagent substore on the client.
 */
export async function runSubagentTurn(
  res: ServerResponse,
  ctx: { sessionId: string; messages: unknown[] }
) {
  const messageId = randomId("msg");
  const parentTextId = `t_${messageId}`;
  const parentReasonId = `r_${messageId}`;

  const researcher = {
    parentTc: `tc_${messageId}_research`,
    childSession: randomId("sub"),
    agentName: "researcher",
  };
  const writer = {
    parentTc: `tc_${messageId}_write`,
    childSession: randomId("sub"),
    agentName: "writer",
  };

  ev(res, { type: "start", messageId });
  ev(res, { type: "start-step" });

  ev(res, { type: "reasoning-start", id: parentReasonId });
  await streamText(
    "This needs both deep research and a clean writeup. I'll delegate to two subagents in parallel: " +
      "a `researcher` to gather the facts and a `writer` to draft the prose.",
    (d) => ev(res, { type: "reasoning-delta", id: parentReasonId, delta: d }),
    Profile.reasoning
  );
  ev(res, { type: "reasoning-end", id: parentReasonId });

  // Parent tool-input-available for both subagents (parallel).
  ev(res, {
    type: "tool-input-available",
    toolCallId: researcher.parentTc,
    toolName: "researcher",
    input: { topic: "history of the Roman aqueducts" },
  });
  ev(res, {
    type: "tool-input-available",
    toolCallId: writer.parentTc,
    toolName: "writer",
    input: { style: "informal, vivid", audience: "curious adults" },
  });

  // Subagent start bookends.
  ev(res, {
    type: "data-subagent-event",
    data: {
      kind: "start",
      sessionId: researcher.childSession,
      parentToolCallId: researcher.parentTc,
      agentName: researcher.agentName,
      parentSessionId: ctx.sessionId,
    },
  });
  ev(res, {
    type: "data-subagent-event",
    data: {
      kind: "start",
      sessionId: writer.childSession,
      parentToolCallId: writer.parentTc,
      agentName: writer.agentName,
      parentSessionId: ctx.sessionId,
    },
  });

  // Run both subagents concurrently. Their events interleave on the wire.
  await Promise.all([streamResearcher(res, researcher), streamWriter(res, writer)]);

  // Stops + parent tool outputs.
  ev(res, {
    type: "data-subagent-event",
    data: { kind: "stop", sessionId: researcher.childSession, parentToolCallId: researcher.parentTc },
  });
  ev(res, {
    type: "tool-output-available",
    toolCallId: researcher.parentTc,
    output: {
      sessionId: researcher.childSession,
      summary:
        "Three primary phases: Republic-era inception (~312 BCE), Imperial expansion under Augustus and Trajan, and late-antique maintenance failures.",
    },
  });
  ev(res, {
    type: "data-subagent-event",
    data: { kind: "stop", sessionId: writer.childSession, parentToolCallId: writer.parentTc },
  });
  ev(res, {
    type: "tool-output-available",
    toolCallId: writer.parentTc,
    output: {
      sessionId: writer.childSession,
      summary: "Drafted three vivid opening paragraphs in an informal voice.",
    },
  });

  // Parent's final text — markdown with backticks for tool/agent names.
  ev(res, { type: "text-start", id: parentTextId });
  await streamText(
    "I asked a `researcher` to gather facts and a `writer` to draft prose. The researcher traced " +
      "three phases of aqueduct history (Republic, Imperial, late antiquity), and the writer turned " +
      "that into three opening paragraphs in an informal voice.\n\n" +
      "Expand either subagent to see the full activity, or tap **“Open ↗”** to view it as its own session.",
    (d) => ev(res, { type: "text-delta", id: parentTextId, delta: d }),
    Profile.assistantText
  );
  ev(res, { type: "text-end", id: parentTextId });

  if (ctx.messages.length <= 1) {
    ev(res, { type: "data-session-title", data: "Roman aqueducts (delegated)", transient: false });
  }

  ev(res, { type: "finish-step" });
  ev(res, { type: "finish" });
  res.write("data: [DONE]\n\n");
  res.end();
}

// --- per-subagent scripts ---------------------------------------------------

async function streamResearcher(
  res: ServerResponse,
  s: { parentTc: string; childSession: string; agentName: string }
) {
  const send = (event: object) =>
    ev(res, {
      type: "data-subagent-event",
      data: {
        kind: "event",
        sessionId: s.childSession,
        parentToolCallId: s.parentTc,
        event,
      },
    });

  const reasonId = `r_${s.childSession}`;
  const textId = `t_${s.childSession}`;
  const innerToolId = `tc_${s.childSession}_search`;

  send({ type: "reasoning-start", id: reasonId });
  await streamText(
    "I'll search **Wikipedia** for the major construction phases, then a secondary source for context.",
    (d) => send({ type: "reasoning-delta", id: reasonId, delta: d }),
    Profile.reasoning
  );
  send({ type: "reasoning-end", id: reasonId });

  send({
    type: "tool-input-available",
    toolCallId: innerToolId,
    toolName: "webSearch",
    input: { q: "history of Roman aqueducts construction phases" },
  });
  await sleep(toolExecMs(1400));
  send({
    type: "tool-output-available",
    toolCallId: innerToolId,
    output: {
      results: [
        { title: "Roman aqueduct — Wikipedia", url: "https://en.wikipedia.org/wiki/Roman_aqueduct" },
        { title: "The Aqueducts of Rome (Frontinus, ~97 CE)", url: "https://example.org/frontinus" },
      ],
    },
  });

  send({ type: "text-start", id: textId });
  await streamText(
    "Three phases:\n\n" +
      "- **Republic era** — starting with the *Aqua Appia* (312 BCE), funded by censor Appius Claudius.\n" +
      "- **Imperial expansion** — eight major aqueducts built under Augustus through Trajan; the system delivered " +
      "around 1 million m³/day at peak.\n" +
      "- **Late antiquity decline** — mostly after the Gothic War (~535 CE) when maintenance broke down.",
    (d) => send({ type: "text-delta", id: textId, delta: d }),
    Profile.subagentText
  );
  send({ type: "text-end", id: textId });
}

async function streamWriter(
  res: ServerResponse,
  s: { parentTc: string; childSession: string; agentName: string }
) {
  const send = (event: object) =>
    ev(res, {
      type: "data-subagent-event",
      data: {
        kind: "event",
        sessionId: s.childSession,
        parentToolCallId: s.parentTc,
        event,
      },
    });

  const reasonId = `r_${s.childSession}`;
  const textId = `t_${s.childSession}`;

  send({ type: "reasoning-start", id: reasonId });
  await streamText(
    "I'll draft three short opening paragraphs in an informal, vivid voice — Republic, Empire, Decline.",
    (d) => send({ type: "reasoning-delta", id: reasonId, delta: d }),
    Profile.reasoning
  );
  send({ type: "reasoning-end", id: reasonId });

  send({ type: "text-start", id: textId });
  await streamText(
    "**1.** Picture Rome in 312 BCE — a city of maybe a quarter-million souls leaning hard on the Tiber " +
      "for water and increasingly unhappy about it. Then Appius Claudius, the censor with the long memory and " +
      "the brand-new road, ordered the first aqueduct dug.\n\n" +
      "**2.** By the time Augustus took office, water flowed in from the hills with bureaucratic punctuality. " +
      "Eleven aqueducts. A million cubic meters a day. Fountains everywhere, baths everywhere, and a maintenance " +
      "corps that was almost an army.\n\n" +
      "**3.** Then the Goths sat on the city. Pipes were cut. Aqueducts dried up. The empire's plumbing outlived " +
      "the empire, but only just.",
    (d) => send({ type: "text-delta", id: textId, delta: d }),
    Profile.subagentText
  );
  send({ type: "text-end", id: textId });
}
