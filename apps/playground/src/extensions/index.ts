/**
 * The host's live-component manifest.
 *
 * Adding a live component = adding one import line. Removing = removing the
 * line. The chat core never imports from any specific extension.
 *
 * Each module side-effect-registers via `registerLiveComponent()` at the
 * bottom of its `index.ts`.
 */
import "./todo-list";
