import type { ServerResponse } from "node:http";
import { Profile, ev, randomId, sleep, streamText } from "../utils";
import { applyOpToDoc, createDoc, emitDocInit } from "../live/server-store";

/**
 * Scripted turn that creates a todo list and streams items into it.
 *
 *   1. Parent reasoning (brief).
 *   2. `tool-input-available` for `todo.createList` — this is the part the
 *      LiveComponentHost picks up to mount the renderer.
 *   3. `data-live-op { kind: "doc-init" }` to register the doc client-side.
 *   4. A sequence of `data-live-op { kind: "op-applied" }` adding items
 *      with realistic pacing.
 *   5. `tool-output-available` to close the create-list tool call.
 *   6. Brief assistant text wrap-up.
 */

const PACKING_LIST = [
  "Passport and ID",
  "Visa-on-arrival paperwork",
  "Travel insurance card",
  "Universal power adapter (Type A)",
  "Pocket WiFi or eSIM",
  "Comfortable walking shoes",
  "Light rain jacket",
  "Reusable water bottle",
  "Suica or Pasmo IC card",
  "Cash in yen (¥10,000 to start)",
];

export async function runTodoListTurn(
  res: ServerResponse,
  ctx: { sessionId: string; messages: unknown[] }
) {
  const messageId = randomId("msg");
  const reasonId = `r_${messageId}`;
  const textId = `t_${messageId}`;
  const toolCallId = `tc_${messageId}_create`;
  const docId = crypto.randomUUID();

  ev(res, { type: "start", messageId });
  ev(res, { type: "start-step" });

  ev(res, { type: "reasoning-start", id: reasonId });
  await streamText(
    "I'll build you a packing list. I'll create the list now and add items as I think of them — " +
      "tick them off as you pack and I'll see what's left next time we talk.",
    (d) => ev(res, { type: "reasoning-delta", id: reasonId, delta: d }),
    Profile.reasoning
  );
  ev(res, { type: "reasoning-end", id: reasonId });

  // Mount the live component via a tool-input-available carrying the docId.
  ev(res, {
    type: "tool-input-available",
    toolCallId,
    toolName: "todo.createList",
    input: { docId, title: "Tokyo trip" },
  });

  // Create the doc server-side + emit doc-init (also subscribes this res).
  const record = createDoc("todo-list", docId);
  emitDocInit(record, res);

  // Stream items in with realistic pacing.
  await sleep(280);
  for (const text of PACKING_LIST) {
    const itemId = crypto.randomUUID();
    applyOpToDoc(record, { kind: "add-item", id: itemId, text }, "llm");
    // The "typing" pause between items isn't strictly necessary — the broadcast
    // already happened — but it gives the UI time to render between additions,
    // closer to how a real LLM would dribble in items across many tool calls.
    await sleep(180 + Math.random() * 240);
  }

  // Close the create-list tool call.
  ev(res, {
    type: "tool-output-available",
    toolCallId,
    output: { docId, itemCount: PACKING_LIST.length },
  });

  // Brief assistant wrap-up.
  ev(res, { type: "text-start", id: textId });
  await streamText(
    "Done — your Tokyo packing list is on the right. Check items off as you pack them; " +
      "you can also edit (double-click), delete, or add your own. Ask me later and I'll see what's left.",
    (d) => ev(res, { type: "text-delta", id: textId, delta: d }),
    Profile.assistantText
  );
  ev(res, { type: "text-end", id: textId });

  if (ctx.messages.length <= 1) {
    ev(res, { type: "data-session-title", data: "Tokyo packing list", transient: false });
  }

  ev(res, { type: "finish-step" });
  ev(res, { type: "finish" });
  res.write("data: [DONE]\n\n");
  res.end();
}
