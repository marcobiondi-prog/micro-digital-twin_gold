import { useSyncExternalStore } from "react";

/** The desktop layout starts at 1024 px of width (Tailwind's lg): menu at the side, map beside the simulation. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

const subscribe = (cb: () => void) => {
  const m = window.matchMedia(DESKTOP_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** True on a desktop-wide window; follows a resize live (false on the server and before hydration). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => false);
}
