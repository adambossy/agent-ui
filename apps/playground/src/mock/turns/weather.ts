import type { ServerResponse } from "node:http";
import { Profile, ev, randomId, sleep, streamText, toolExecMs } from "../utils";

const REASONING_TEXT = [
  "The user is asking about the weather in San Francisco. ",
  "I'll call the `getWeather` tool for that city and summarize the result.",
].join("");

const ASSISTANT_TEXT =
  "The current weather in **San Francisco** is **16°C (60.8°F)**, partly cloudy. " +
  "It cools to around 13°C overnight, with sunrise tomorrow at 5:53 AM.";

export async function runWeatherTurn(
  res: ServerResponse,
  ctx: { sessionId: string; messages: unknown[] }
) {
  const messageId = randomId("msg");
  const reasoningId = `r_${messageId}`;
  const textId = `t_${messageId}`;
  const toolCallId = `tc_${messageId}_weather`;

  ev(res, { type: "start", messageId });
  ev(res, { type: "start-step" });

  ev(res, { type: "reasoning-start", id: reasoningId });
  await streamText(
    REASONING_TEXT,
    (delta) => ev(res, { type: "reasoning-delta", id: reasoningId, delta }),
    Profile.reasoning
  );
  ev(res, { type: "reasoning-end", id: reasoningId });

  ev(res, {
    type: "tool-input-available",
    toolCallId,
    toolName: "getWeather",
    input: { location: "San Francisco" },
  });
  await sleep(toolExecMs(1100));
  ev(res, {
    type: "tool-output-available",
    toolCallId,
    output: weatherFor("San Francisco", 16, 60.8, 19, 12),
  });

  ev(res, { type: "text-start", id: textId });
  await streamText(
    ASSISTANT_TEXT,
    (delta) => ev(res, { type: "text-delta", id: textId, delta }),
    Profile.assistantText
  );
  ev(res, { type: "text-end", id: textId });

  if (ctx.messages.length <= 1) {
    ev(res, { type: "data-session-title", data: "Weather in San Francisco", transient: false });
  }

  ev(res, { type: "finish-step" });
  ev(res, { type: "finish" });
  res.write("data: [DONE]\n\n");
  res.end();
}

export function weatherFor(
  location: string,
  tempC: number,
  tempF: number,
  high: number,
  low: number
) {
  return {
    location,
    temperatureC: tempC,
    temperatureF: tempF,
    condition: "Partly cloudy",
    high,
    low,
    sunrise: "5:53 AM",
    sunset: "8:19 PM",
    hourly: [
      { hour: "Now", temp: tempC, icon: "cloud" },
      { hour: "+1h", temp: tempC - 1, icon: "cloud" },
      { hour: "+2h", temp: tempC - 2, icon: "cloud" },
      { hour: "+3h", temp: tempC - 3, icon: "cloud" },
      { hour: "+4h", temp: tempC - 3, icon: "cloud" },
      { hour: "+5h", temp: tempC - 3, icon: "cloud" },
    ],
  };
}
