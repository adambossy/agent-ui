import type { Todo, TodoOp } from "./schema";

export function reducer(state: Todo, op: TodoOp): Todo {
  switch (op.kind) {
    case "add-item":
      // Idempotent: if an item with this id already exists, ignore the add.
      if (state.items.some((i) => i.id === op.id)) return state;
      return {
        ...state,
        items: [
          ...state.items,
          { id: op.id, text: op.text, done: false, createdAt: new Date().toISOString() },
        ],
      };
    case "toggle-item":
      return {
        ...state,
        items: state.items.map((i) => (i.id === op.id ? { ...i, done: !i.done } : i)),
      };
    case "edit-item":
      return {
        ...state,
        items: state.items.map((i) => (i.id === op.id ? { ...i, text: op.text } : i)),
      };
    case "remove-item":
      return { ...state, items: state.items.filter((i) => i.id !== op.id) };
  }
}
