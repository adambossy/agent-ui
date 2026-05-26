import { z } from "zod";

export const TodoItem = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(500),
  done: z.boolean(),
  createdAt: z.string(),
});
export type TodoItem = z.infer<typeof TodoItem>;

export const Todo = z.object({ items: z.array(TodoItem) });
export type Todo = z.infer<typeof Todo>;

export const TodoOp = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add-item"), id: z.string().uuid(), text: z.string().min(1) }),
  z.object({ kind: z.literal("toggle-item"), id: z.string().uuid() }),
  z.object({ kind: z.literal("edit-item"), id: z.string().uuid(), text: z.string().min(1) }),
  z.object({ kind: z.literal("remove-item"), id: z.string().uuid() }),
]);
export type TodoOp = z.infer<typeof TodoOp>;
