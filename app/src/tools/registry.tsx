import type { ComponentType } from "react";
import type { UIMessagePart } from "../types";
import { DefaultTool } from "../components/tools/DefaultTool";
import { WeatherRenderer } from "../components/tools/WeatherRenderer";

export type ToolRendererProps = {
  part: Extract<UIMessagePart, { type: `tool-${string}` }>;
};
export type ToolRenderer = ComponentType<ToolRendererProps>;

const renderers = new Map<string, ToolRenderer>();

export function registerToolRenderer(toolName: string, R: ToolRenderer) {
  renderers.set(toolName, R);
}

export function resolveToolRenderer(toolName: string): ToolRenderer {
  return renderers.get(toolName) ?? DefaultTool;
}

// Bootstrap: built-in tool renderers.
registerToolRenderer("getWeather", WeatherRenderer);
