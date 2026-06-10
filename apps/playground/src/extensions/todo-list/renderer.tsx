import { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { randomUUID } from "@adambossy/agent-ui";
import type { LiveRendererProps } from "@adambossy/agent-ui";
import type { Todo, TodoOp } from "./schema";

export function TodoListView({ doc, dispatch, meta }: LiveRendererProps<Todo, TodoOp>) {
  const [newText, setNewText] = useState("");
  const pendingIds = new Set(
    meta.pending.map((p) => p.opId) // we don't track id-of-target here; pending count is the surface
  );
  const isPending = pendingIds.size > 0;

  function submitNew(e: React.FormEvent) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    dispatch({ kind: "add-item", id: randomUUID(), text });
    setNewText("");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 max-w-[520px]">
      <div className="flex items-center justify-between pb-2 border-b border-border mb-2">
        <h3 className="font-medium text-sm">Todo list</h3>
        <span className="text-[11px] text-muted-foreground">
          {doc.items.length} item{doc.items.length === 1 ? "" : "s"}
          {isPending && <span className="ml-2 opacity-70">• syncing…</span>}
        </span>
      </div>

      {doc.items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3 text-center italic">No items yet</p>
      ) : (
        <ul className="space-y-1">
          {doc.items.map((item) => (
            <TodoRow key={item.id} item={item} dispatch={dispatch} />
          ))}
        </ul>
      )}

      <form onSubmit={submitNew} className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          aria-label="Add item"
          className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus size={16} />
        </button>
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add a todo…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label="New todo text"
        />
      </form>
    </div>
  );
}

function TodoRow({
  item,
  dispatch,
}: {
  item: Todo["items"][number];
  dispatch: (op: TodoOp) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  function commitEdit() {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === item.text) return;
    dispatch({ kind: "edit-item", id: item.id, text: next });
  }

  return (
    <li className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors">
      <button
        type="button"
        aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
        onClick={() => dispatch({ kind: "toggle-item", id: item.id })}
        className={
          "flex items-center justify-center w-5 h-5 rounded border " +
          (item.done
            ? "bg-emerald-600 border-emerald-600 text-white"
            : "border-border hover:border-foreground")
        }
      >
        {item.done && <Check size={12} />}
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") {
              setDraft(item.text);
              setEditing(false);
            }
          }}
          className="flex-1 bg-transparent text-sm outline-none border-b border-border focus:border-foreground"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => setEditing(true)}
          className={
            "flex-1 text-left text-sm cursor-text " +
            (item.done ? "line-through text-muted-foreground" : "")
          }
          aria-label={`Edit "${item.text}" (double-click)`}
        >
          {item.text}
        </button>
      )}

      <button
        type="button"
        aria-label={`Delete "${item.text}"`}
        onClick={() => dispatch({ kind: "remove-item", id: item.id })}
        className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-opacity"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}
