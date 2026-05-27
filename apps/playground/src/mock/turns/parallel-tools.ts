import type { ServerResponse } from "node:http";
import { Profile, ev, randomId, sleep, streamText, toolExecMs } from "../utils";
import { weatherFor } from "./weather";

/**
 * Three `getWeather` calls fired together; their outputs settle out of
 * declaration order so the client must render each tool card independently.
 */
export async function runParallelToolsTurn(
  res: ServerResponse,
  _ctx: { sessionId: string; messages: unknown[] }
) {
  const messageId = randomId("msg");
  const reasoningId = `r_${messageId}`;
  const textId = `t_${messageId}`;

  ev(res, { type: "start", messageId });
  ev(res, { type: "start-step" });

  ev(res, { type: "reasoning-start", id: reasoningId });
  await streamText(
    "I'll look up the weather for **San Francisco**, **Tokyo**, and **London** in parallel, then compare. " +
      "These are independent lookups so I can fire them simultaneously.",
    (d) => ev(res, { type: "reasoning-delta", id: reasoningId, delta: d }),
    Profile.reasoning
  );
  ev(res, { type: "reasoning-end", id: reasoningId });

  const tools = [
    {
      id: `tc_${messageId}_sf`,
      location: "San Francisco",
      execMs: toolExecMs(2100),
      out: weatherFor("San Francisco", 16, 60.8, 19, 12),
    },
    {
      id: `tc_${messageId}_tok`,
      location: "Tokyo",
      execMs: toolExecMs(900),
      out: weatherFor("Tokyo", 21, 69.8, 24, 18),
    },
    {
      id: `tc_${messageId}_lon`,
      location: "London",
      execMs: toolExecMs(1500),
      out: weatherFor("London", 14, 57.2, 17, 10),
    },
  ];

  // Announce all three as running at once.
  for (const t of tools) {
    ev(res, {
      type: "tool-input-available",
      toolCallId: t.id,
      toolName: "getWeather",
      input: { location: t.location },
    });
  }

  // Race their completions — whichever finishes first emits first.
  await Promise.all(
    tools.map(async (t) => {
      await sleep(t.execMs);
      ev(res, { type: "tool-output-available", toolCallId: t.id, output: t.out });
    })
  );

  ev(res, { type: "text-start", id: textId });
  await streamText(
    "All three cities are in the mild range right now. " +
      "**Tokyo** is the warmest at **21°C (69.8°F)**, followed by **San Francisco** at **16°C (60.8°F)** " +
      "and **London** at **14°C (57.2°F)**. London cools the most overnight, dropping to around 10°C.",
    (d) => ev(res, { type: "text-delta", id: textId, delta: d }),
    Profile.assistantText
  );
  ev(res, { type: "text-end", id: textId });

  ev(res, { type: "finish-step" });
  ev(res, { type: "finish" });
  res.write("data: [DONE]\n\n");
  res.end();
}
