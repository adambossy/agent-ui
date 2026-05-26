import { create } from "zustand";

/**
 * UI state for the side panel. Tracks which doc is "open" — visible on
 * the right half of the chat surface.
 *
 * One active doc at a time. Opening a new one replaces the current one.
 */
type LiveUIState = {
  activeDoc: { kind: string; docId: string } | null;
  openDoc(kind: string, docId: string): void;
  closeDoc(): void;
};

export const useLiveUIStore = create<LiveUIState>((set) => ({
  activeDoc: null,
  openDoc(kind, docId) {
    set({ activeDoc: { kind, docId } });
  },
  closeDoc() {
    set({ activeDoc: null });
  },
}));
