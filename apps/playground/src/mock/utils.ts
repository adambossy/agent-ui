import type { ServerResponse } from "node:http";

export type Frame = { type: string; [k: string]: unknown };

export function ev(res: ServerResponse, frame: Frame) {
  res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

export function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Sleep a random time within [min, max] (inclusive of min, exclusive of max). */
export function jitterSleep(min: number, max: number): Promise<void> {
  return sleep(min + Math.random() * (max - min));
}

export function randomId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Yield word-ish chunks of `text` that approximate how a real LLM streams.
 * Each chunk is 1-3 whitespace-delimited tokens; whitespace is preserved.
 */
export function* tokenize(text: string): Generator<string> {
  // Split keeping whitespace so the chunks reassemble losslessly.
  const re = /(\s+|[^\s]+)/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) parts.push(m[0]);

  let i = 0;
  while (i < parts.length) {
    // Group 1-3 alternating word/whitespace runs to feel like 1-3 tokens.
    const grab = 1 + Math.floor(Math.random() * 3);
    let take = "";
    for (let g = 0; g < grab * 2 && i < parts.length; g++) {
      take += parts[i++];
    }
    if (take) yield take;
  }
}

export type StreamProfile = {
  /** Initial delay before the first delta event fires. */
  firstByteMin?: number;
  firstByteMax?: number;
  /** Per-chunk delay. ~20-60 tokens/sec ≈ 30-90 ms/chunk for short chunks. */
  perChunkMin?: number;
  perChunkMax?: number;
  /** Probability of a "pause" between chunks (model hesitating). */
  pauseProbability?: number;
  pauseMin?: number;
  pauseMax?: number;
};

const DEFAULTS: Required<StreamProfile> = {
  firstByteMin: 200,
  firstByteMax: 700,
  perChunkMin: 30,
  perChunkMax: 90,
  pauseProbability: 0.08,
  pauseMin: 250,
  pauseMax: 700,
};

/**
 * Stream `text` as a sequence of delta-shaped chunks with realistic pacing.
 *
 * `emit` is invoked with each chunk string; it is the caller's job to wrap
 * that into the right SSE event shape (text-delta / reasoning-delta / etc).
 */
export async function streamText(
  text: string,
  emit: (chunk: string) => void,
  profile: StreamProfile = {}
): Promise<void> {
  const p = { ...DEFAULTS, ...profile };
  await jitterSleep(p.firstByteMin, p.firstByteMax);
  let first = true;
  for (const t of tokenize(text)) {
    if (!first && Math.random() < p.pauseProbability) {
      await jitterSleep(p.pauseMin, p.pauseMax);
    }
    emit(t);
    first = false;
    await jitterSleep(p.perChunkMin, p.perChunkMax);
  }
}

/** Common profiles tuned for different content kinds. */
export const Profile = {
  reasoning: {
    firstByteMin: 300,
    firstByteMax: 1000,
    perChunkMin: 35,
    perChunkMax: 110,
    pauseProbability: 0.12,
  } satisfies StreamProfile,
  assistantText: {
    firstByteMin: 150,
    firstByteMax: 500,
    perChunkMin: 25,
    perChunkMax: 80,
    pauseProbability: 0.06,
  } satisfies StreamProfile,
  subagentText: {
    firstByteMin: 400,
    firstByteMax: 1200,
    perChunkMin: 30,
    perChunkMax: 95,
    pauseProbability: 0.08,
  } satisfies StreamProfile,
};

/** Simulate a tool execution that takes some realistic time (with jitter). */
export function toolExecMs(median = 1200, spread = 0.6): number {
  const min = median * (1 - spread / 2);
  const max = median * (1 + spread / 2);
  return Math.floor(min + Math.random() * (max - min));
}

/**
 * Extract the latest user message's plain text from an AI SDK chat POST body.
 * The body shape `{ id, messages: [{ role, parts: [{ type: "text", text }] }, ...] }`.
 */
export function lastUserText(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; parts?: Array<{ type?: string; text?: string }>; content?: string };
    if (m?.role !== "user") continue;
    if (Array.isArray(m.parts)) {
      const text = m.parts
        .filter((p) => p?.type === "text")
        .map((p) => p.text ?? "")
        .join("");
      if (text) return text;
    }
    if (typeof m.content === "string") return m.content;
  }
  return "";
}
