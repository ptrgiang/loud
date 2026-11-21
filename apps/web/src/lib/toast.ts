// Short notes in the corner, as in T3 Code. Kept apart from the component so the stores can raise them.
import { create } from "zustand";

export interface Toast {
  readonly id: number;
  readonly kind: "error" | "done";
  readonly text: string;
}

let next = 0;
export const useToasts = create<{ readonly list: ReadonlyArray<Toast> }>()(() => ({ list: [] }));

export const dismiss = (id: number) =>
  useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }));

/** Errors stay until closed; the rest go after a few seconds. */
export function toast(kind: Toast["kind"], text: string) {
  const id = ++next;
  useToasts.setState((s) => ({
    list: [...s.list.filter((t) => t.text !== text), { id, kind, text }].slice(-4),
  }));
  if (kind === "done") setTimeout(() => dismiss(id), 4000);
}
