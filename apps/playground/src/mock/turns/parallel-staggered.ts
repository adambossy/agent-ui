import type { ServerResponse } from "node:http";
import { Profile, ev, randomId, sleep, streamText } from "../utils";
import { weatherFor } from "./weather";

/**
 * Heavily-staggered parallel tool calls.
 *
 * Three independent tools fired together with very different median durations
 * (500 ms → 7 s, a 14× spread). Each tool card has to animate independently —
 * the fast one settles while the others are still in "running" state, then the
 * medium one settles, then the slow one. Mix of custom (Weather) and default
 * (JSON-card) renderers so the visual independence is obvious.
 */
export async function runParallelStaggeredTurn(
  res: ServerResponse,
  _ctx: { sessionId: string; messages: unknown[] }
) {
  const messageId = randomId("msg");
  const reasoningId = `r_${messageId}`;
  const textId = `t_${messageId}`;

  ev(res, { type: "start", messageId });
  ev(res, { type: "start-step" });

  // Brief parent reasoning.
  ev(res, { type: "reasoning-start", id: reasoningId });
  await streamText(
    "I'll pull three things in parallel: a fast `getStockPrice`, a medium-speed `getWeather`, " +
      "and a slow `webSearch` (the search engine is rate-limited). " +
      "They'll come back out of order — that's expected.",
    (d) => ev(res, { type: "reasoning-delta", id: reasoningId, delta: d }),
    Profile.reasoning
  );
  ev(res, { type: "reasoning-end", id: reasoningId });

  // Three tool calls — very different execution times to prove independence.
  const fast = {
    id: `tc_${messageId}_stock`,
    toolName: "getStockPrice",
    input: { ticker: "AAPL" },
    execMs: 400 + Math.random() * 300, // 400–700 ms
    output: {
      ticker: "AAPL",
      price: 234.18,
      change: -1.27,
      changePercent: -0.54,
      currency: "USD",
      market: "NASDAQ",
      lastTradeAt: new Date().toISOString(),
    },
  };
  const medium = {
    id: `tc_${messageId}_wx`,
    toolName: "getWeather",
    input: { location: "Cupertino" },
    execMs: 2000 + Math.random() * 700, // 2.0–2.7 s
    output: weatherFor("Cupertino", 19, 66.2, 23, 13),
  };
  const slow = {
    id: `tc_${messageId}_search`,
    toolName: "webSearch",
    input: { q: "AAPL Q4 2026 earnings call summary" },
    execMs: 6500 + Math.random() * 1500, // 6.5–8.0 s
    output: {
      query: "AAPL Q4 2026 earnings call summary",
      results: [
        {
          title: "Apple Q4 FY26 Earnings — Press Release",
          url: "https://www.apple.com/newsroom/q4fy26",
          snippet:
            "Revenue $94.9B, services up 12% YoY, Mac/iPad mixed, China decline narrowing…",
        },
        {
          title: "Cook on AI strategy: 'we will spend what it takes'",
          url: "https://example.com/cook-ai",
          snippet:
            "Capex guidance lifted; on-device + Private Cloud Compute referenced repeatedly.",
        },
        {
          title: "Analyst takes: Services moat widens",
          url: "https://example.com/analyst-roundup",
          snippet:
            "Six of seven major analysts raise PT post-call; consensus EPS revised +4%.",
        },
      ],
    },
  };

  // Announce all three as in-flight at once.
  for (const t of [fast, medium, slow]) {
    ev(res, {
      type: "tool-input-available",
      toolCallId: t.id,
      toolName: t.toolName,
      input: t.input,
    });
  }

  // Race their completions — fast → medium → slow, each emitting as it finishes.
  await Promise.all(
    [fast, medium, slow].map(async (t) => {
      await sleep(t.execMs);
      ev(res, { type: "tool-output-available", toolCallId: t.id, output: t.output });
    })
  );

  // Final assistant text — markdown including code spans for ticker + tool names.
  ev(res, { type: "text-start", id: textId });
  await streamText(
    "Quick take on **AAPL**:\n\n" +
      "- Price: **$234.18** (-0.54% on the day) via `getStockPrice`.\n" +
      "- Weather at Cupertino HQ: **19°C / 66.2°F**, partly cloudy — not driving anything.\n" +
      "- Recent earnings via `webSearch`: revenue **$94.9B**, services up **12% YoY**, capex guide raised. " +
      "Six of seven analysts lifted price targets post-call.\n\n" +
      "Notable that the three calls returned wildly different speeds — the search engine was slow but its " +
      "result is the most consequential one for the question.",
    (d) => ev(res, { type: "text-delta", id: textId, delta: d }),
    Profile.assistantText
  );
  ev(res, { type: "text-end", id: textId });

  ev(res, { type: "finish-step" });
  ev(res, { type: "finish" });
  res.write("data: [DONE]\n\n");
  res.end();
}
