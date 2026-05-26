import type { ServerResponse } from "node:http";
import { lastUserText } from "../utils";
import { runWeatherTurn } from "./weather";
import { runParallelToolsTurn } from "./parallel-tools";
import { runParallelStaggeredTurn } from "./parallel-staggered";
import { runSubagentTurn } from "./subagent";
import { runTodoListTurn } from "./todo-list";

/**
 * Pick a canned turn based on the latest user message. Keyword matching is
 * intentionally forgiving so demos are easy to trigger from the UI. Most
 * specific matches go first so a single prompt resolves unambiguously.
 *
 *   "dossier", "stagger", "stock", "investor",
 *     "aapl", "background check"       → three heavily-staggered mixed tool calls
 *   "parallel", "compare", "vs",
 *     "three cities", "all three"      → three parallel getWeather calls
 *   "research", "subagent", "delegate",
 *     "roman", "aqueduct", "writer"    → two parallel subagents
 *   default                            → single-tool weather turn
 */
export async function dispatchTurn(
  res: ServerResponse,
  ctx: { sessionId: string; messages: unknown[] }
) {
  const text = lastUserText(ctx.messages).toLowerCase();

  if (/\b(packing list|todo|to-?do|checklist|tokyo trip|pack for)\b/.test(text)) {
    await runTodoListTurn(res, ctx);
    return;
  }

  if (/\b(dossier|stagger(ed)?|stock|investor|aapl|background check)\b/.test(text)) {
    await runParallelStaggeredTurn(res, ctx);
    return;
  }

  if (/\b(parallel|compare|vs\.?|versus|three cities|all three)\b/.test(text)) {
    await runParallelToolsTurn(res, ctx);
    return;
  }

  if (/\b(research|subagent|delegate|roman|aqueduct|writer|drafted)\b/.test(text)) {
    await runSubagentTurn(res, ctx);
    return;
  }

  await runWeatherTurn(res, ctx);
}
