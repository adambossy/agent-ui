import { registerLiveComponent, zodCodec } from "../../live";
import type { LiveComponentManifest } from "../../live";
import { Todo, TodoOp } from "./schema";
import type { Todo as TodoType, TodoOp as TodoOpType } from "./schema";
import { reducer } from "./reducer";
import { TodoListView } from "./renderer";

const manifest: LiveComponentManifest<TodoType, TodoOpType> = {
  kind: "todo-list",
  schemaVersions: [1],
  initialState: () => ({ schemaVersion: 1, payload: { items: [] } }),
  reducer,
  opCodec: zodCodec(TodoOp),
  // Per-op conflict policy: most ops commute by id; only edit-item rejects.
  conflictPolicyFor(op) {
    return op.kind === "edit-item" ? "reject-on-conflict" : "commute-by-id";
  },
  toolNames: {
    primary: ["todo.createList"],
    op: ["todo.addItem", "todo.toggleItem", "todo.editItem", "todo.removeItem"],
  },
  renderer: TodoListView,
  mockServerReducer: reducer,
};

// Force the schema to evaluate so the codec is hot when needed.
void Todo;

registerLiveComponent(manifest);

export default manifest;
