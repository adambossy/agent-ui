/**
 * Light wrapper around AI SDK types so we can substitute without touching
 * every callsite. Today these all come from `ai` v6.
 */
export type UIMessageRole = "user" | "assistant" | "system";

export type UIMessagePartText = { type: "text"; text: string; state?: "streaming" | "done" };
export type UIMessagePartReasoning = {
  type: "reasoning";
  text: string;
  state?: "streaming" | "done";
};
export type UIMessagePartTool = {
  type: `tool-${string}`;
  toolCallId: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
    | "output-denied"
    | "approval-requested"
    | "approval-responded";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};
export type UIMessagePartFile = {
  type: "file";
  url: string;
  filename: string;
  mediaType: string;
};
export type UIMessagePartData = {
  type: `data-${string}`;
  data: unknown;
  transient?: boolean;
};
export type UIMessagePartStepStart = { type: "start-step" };
export type UIMessagePartStepFinish = { type: "finish-step" };

export type UIMessagePart =
  | UIMessagePartText
  | UIMessagePartReasoning
  | UIMessagePartTool
  | UIMessagePartFile
  | UIMessagePartData
  | UIMessagePartStepStart
  | UIMessagePartStepFinish;

export type UIMessage = {
  id: string;
  role: UIMessageRole;
  parts: UIMessagePart[];
};
