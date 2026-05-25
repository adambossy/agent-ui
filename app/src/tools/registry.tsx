import type { ComponentType } from "react";
import type { UIMessagePart } from "../types";
import { DefaultTool } from "../components/tools/DefaultTool";
import { WeatherRenderer } from "../components/tools/WeatherRenderer";
import { SubagentTool } from "../components/tools/SubagentTool";

export type ToolRendererProps = {
  part: Extract<UIMessagePart, { type: `tool-${string}` }>;
  allowExpand?: boolean;
};
export type ToolRenderer = ComponentType<ToolRendererProps>;

const renderers = new Map<string, ToolRenderer>();
const subagentNames = new Set<string>();

export function registerToolRenderer(toolName: string, R: ToolRenderer) {
  renderers.set(toolName, R);
}

export function markAsSubagent(toolName: string) {
  subagentNames.add(toolName);
}

export function isSubagentTool(toolName: string): boolean {
  return subagentNames.has(toolName);
}

export function resolveToolRenderer(
  toolName: string,
  opts: { insideSubagent?: boolean } = {}
): ToolRenderer {
  if (subagentNames.has(toolName)) {
    if (opts.insideSubagent) {
      // Recursion stop rule: nested subagents render as collapsed headers only.
      // Wrap SubagentTool with allowExpand=false.
      return SubagentToolNonExpandable;
    }
    return SubagentTool;
  }
  return renderers.get(toolName) ?? DefaultTool;
}

function SubagentToolNonExpandable(props: ToolRendererProps) {
  return <SubagentTool {...props} allowExpand={false} />;
}

// Bootstrap: built-in tool renderers.
registerToolRenderer("getWeather", WeatherRenderer);
markAsSubagent("researcher");
markAsSubagent("writer");
