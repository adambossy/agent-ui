// Public API for @adambossy/agent-ui.
//
// This barrel defines the supported surface of the library. Anything not
// re-exported here is internal and may change without notice. Consumers
// import components and the live-component runtime from the package root;
// design tokens + custom utilities ship separately as "@adambossy/agent-ui/styles.css".

// --- Presentational chat components ---
export { Message } from "./components/Message";
export { Composer } from "./components/Composer";
export { Markdown } from "./components/Markdown";
export { Reasoning } from "./components/Reasoning";

// --- Tool-renderer registry ---
// Register custom renderers for a tool name, or flag a tool as a subagent.
export {
  registerToolRenderer,
  markAsSubagent,
  isSubagentTool,
  resolveToolRenderer,
} from "./tools/registry";
export type { ToolRenderer, ToolRendererProps } from "./tools/registry";

// --- Subagent store ---
export { useSubagentStore, useSubagent } from "./state/subagentStore";
export type { SubagentEvent, SubagentSession } from "./state/subagentStore";

// --- Live-component runtime ---
// Host, side panel, doc/UI stores, the registration API (registerLiveComponent),
// the zod codec helper, and the live-op protocol types.
export * from "./live";

// --- Utilities ---
// UUID v4 that also works in non-secure contexts (plain-http LAN dev servers).
export { randomUUID } from "./lib/uuid";

// --- Reminder stripping ---
// Removes <system-reminder> spans from user-visible text (model-facing context only).
export { stripSystemReminders } from "./reminders";

// --- Shared message / part types ---
export * from "./types";
