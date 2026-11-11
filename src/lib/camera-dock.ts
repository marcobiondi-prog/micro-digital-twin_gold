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
export function openAccount(detail?: { email?: string; mode?: "signin" | "signup" | "reset" }) {
  window.dispatchEvent(detail ? new CustomEvent(OPEN_ACCOUNT_EVENT, { detail }) : new Event(OPEN_ACCOUNT_EVENT));
}

/**
 * Files picked from the camera sheet itself (Video or Galleria tapped off the project's page): the phone's camera or
 * gallery opens inside the tap, while the app moves to the project's page behind it; the files then wait here until
 * that page's media panel takes them (camera videos straight in, gallery picks through its review sheet).
 */
export type Delivery = { files: File[]; via: "camera" | "gallery" };
const pendingFiles = new Map<Kind, Delivery[]>();
const fileHandlers = new Map<Kind, (d: Delivery) => void>();
export function registerFilesHandler(kind: Kind, handler: (d: Delivery) => void) {
  fileHandlers.set(kind, handler);
  const waiting = pendingFiles.get(kind) ?? [];
  pendingFiles.delete(kind);
  waiting.forEach(handler);
  return () => { if (fileHandlers.get(kind) === handler) fileHandlers.delete(kind); };
}
export function deliverFiles(kind: Kind, d: Delivery) {
  if (!d.files.length) return;
  const handler = fileHandlers.get(kind);
  if (handler) handler(d);
  else pendingFiles.set(kind, [...(pendingFiles.get(kind) ?? []), d]);
}
