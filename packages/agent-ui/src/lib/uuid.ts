/**
 * UUID v4. `crypto.randomUUID` only exists in secure contexts (https or
 * localhost), so when the app is served over plain http — e.g. a Vite dev
 * server opened via its LAN "Network" URL — fall back to building one from
 * `crypto.getRandomValues`, which has no such restriction.
 */
export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
