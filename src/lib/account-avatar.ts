import { useSyncExternalStore } from "react";

/**
 * The picture of the personal account now shown in the header (chosen, uploaded or Google's), published by the account
 * control so other views — the sector page's "Ti abbiamo riconosciuto" — can show it too. null when signed out or none.
 */
let url: string | null = null;
const subs = new Set<() => void>();
export function setAccountAvatar(next: string | null) {
  if (next === url) return;
  url = next;
  subs.forEach((f) => f());
}
export function useAccountAvatar(): string | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => url, () => null);
}
/** The picture now shown, read outside React (kept with a professional profile when it is registered). */
export const getAccountAvatar = (): string | null => url;
