import type { LiveComponentManifest } from "./types";

/**
 * Global registry of live-component manifests.
 *
 * Extension modules call `registerLiveComponent(manifest)` at module load
 * (side-effect import) — the host's `src/extensions/index.ts` controls
 * which extensions are active by which modules it imports.
 *
 * The chat core (Message renderer, ChatScreen onData, tool registry)
 * reads from this map but never imports a specific extension.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byKind = new Map<string, LiveComponentManifest<any, any>>();
const toolNameToKind = new Map<string, { kind: string; role: "primary" | "op" }>();

export function registerLiveComponent<S, Op>(manifest: LiveComponentManifest<S, Op>): void {
  if (byKind.has(manifest.kind)) {
    // eslint-disable-next-line no-console
    console.warn(`[live-components] re-registering kind="${manifest.kind}" — overwriting.`);
  }
  byKind.set(manifest.kind, manifest as LiveComponentManifest<unknown, unknown>);
  for (const name of manifest.toolNames.primary) {
    toolNameToKind.set(name, { kind: manifest.kind, role: "primary" });
  }
  for (const name of manifest.toolNames.op) {
    toolNameToKind.set(name, { kind: manifest.kind, role: "op" });
  }
}

export function getLiveComponent(
  kind: string
): LiveComponentManifest<unknown, unknown> | undefined {
  return byKind.get(kind);
}

export function getLiveComponentByToolName(
  toolName: string
): { kind: string; role: "primary" | "op" } | undefined {
  return toolNameToKind.get(toolName);
}

export function listLiveComponents(): LiveComponentManifest<unknown, unknown>[] {
  return Array.from(byKind.values());
}
