import { useSyncExternalStore } from "react";

/** Which Home tile is selected, so the bottom bar can point at the same place while Home is open (null elsewhere). */
export type HomeFocus = "camera" | "urban" | "vine" | null;

let focus: HomeFocus = null;
const listeners = new Set<() => void>();

export function setHomeFocus(next: HomeFocus) {
  if (next === focus) return;
  focus = next;
  listeners.forEach((l) => l());
}

export function useHomeFocus(): HomeFocus {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => focus, () => null);
}
