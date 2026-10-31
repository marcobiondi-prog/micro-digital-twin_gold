import { useSyncExternalStore } from "react";

/** What the central camera button can start. */
export type CaptureAction = "ai" | "photo" | "video" | "burst" | "gallery";
type Kind = "urban" | "vineyard";

// The media panel of each simulation page registers how to start a capture; the camera sheet
// calls it synchronously inside the tap, so the system camera keeps the user gesture.
const handlers = new Map<Kind, (action: CaptureAction) => void>();

export function registerCaptureHandler(kind: Kind, handler: (action: CaptureAction) => void) {
  handlers.set(kind, handler);
  return () => { if (handlers.get(kind) === handler) handlers.delete(kind); };
}

export function requestCapture(kind: Kind, action: CaptureAction): boolean {
  const handler = handlers.get(kind);
  if (!handler) return false;
  handler(action);
  return true;
}

let sheetOpen = false;
const listeners = new Set<() => void>();
export function setCameraSheetOpen(open: boolean) { sheetOpen = open; listeners.forEach((l) => l()); }
export function useCameraSheetOpen(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => sheetOpen, () => false);
}

/** Opens the account dialog from anywhere (e.g. the locked AI option). */
export const OPEN_ACCOUNT_EVENT = "mdt-open-account";
export function openAccount() { window.dispatchEvent(new Event(OPEN_ACCOUNT_EVENT)); }
