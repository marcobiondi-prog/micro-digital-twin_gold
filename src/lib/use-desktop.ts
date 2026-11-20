import { isSlate, SLATE_QUERY } from "@/lib/touch-device";
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

/**
 * Map beside the simulation: desktops (≥ 1024 px) and tablets held sideways (landscape, ≥ 900 px wide and ≥ 600 px
 * tall, so a phone turned sideways keeps its own layout). A tablet held upright keeps the tabs one at a time.
 */
export const SIDE_BY_SIDE_QUERY = "(min-width: 1024px), (orientation: landscape) and (min-width: 900px) and (min-height: 600px)";

const subscribeSide = (cb: () => void) => {
  const m = window.matchMedia(SIDE_BY_SIDE_QUERY), t = window.matchMedia(SLATE_QUERY);
  m.addEventListener("change", cb); t.addEventListener("change", cb);
  return () => { m.removeEventListener("change", cb); t.removeEventListener("change", cb); };
};

export function useSideBySide(): boolean {
  return useSyncExternalStore(subscribeSide, () => window.matchMedia(SIDE_BY_SIDE_QUERY).matches && !isSlate(), () => false);
}
