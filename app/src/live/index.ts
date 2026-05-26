export * from "./types";
export { registerLiveComponent, getLiveComponent, getLiveComponentByToolName, listLiveComponents } from "./registry";
export { useLiveDocStore, useLiveDoc, useLiveDocSelector } from "./store";
export { useLiveUIStore } from "./ui-store";
export { LiveOpClient } from "./client";
export { LiveComponentHost, HiddenLiveOpTool } from "./host";
export { LiveDocsPanel } from "./panel";

import { z } from "zod";
import type { OpCodec } from "./types";

/** Zod-backed implementation of OpCodec. */
export function zodCodec<Op>(schema: z.ZodType<Op>): OpCodec<Op> {
  return {
    parse(input) {
      return schema.parse(input);
    },
    safeParse(input) {
      const r = schema.safeParse(input);
      return r.success ? { ok: true, op: r.data } : { ok: false, error: r.error.message };
    },
  };
}
