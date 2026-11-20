/**
 * True touch capability, independent of the CSS pointer media queries.
 * Hybrid 2-in-1 laptops (Surface Pro and similar) report a fine primary
 * pointer, so `(any-pointer: coarse)` alone is not enough there; maxTouchPoints
 * still exposes the touchscreen. The result lands as `data-touch` on <html>
 * so CSS can key off it.
 */
export function isTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.maxTouchPoints > 0) return true;
  if (typeof window !== "undefined" && "ontouchstart" in window) return true;
  return false;
}

/** Mark the document once so CSS can show touch-only controls on hybrids. */
export function markTouchDevice(): void {
  if (typeof document === "undefined") return;
  document.documentElement.toggleAttribute("data-touch", isTouchDevice());
}

/**
 * Tablet mode of a 2-in-1 (Surface with the keyboard folded away or detached, Windows "tablet mode"): Chrome and
 * Edge on Windows then report a coarse primary pointer and no hover, and switch back to fine when the keyboard and
 * touchpad return, firing the media query's change. Also true for touch tablets (iPad, Android) held either way.
 */
export const SLATE_QUERY = "(pointer: coarse)";
export function isSlate(): boolean {
  return typeof window !== "undefined" && isTouchDevice() && window.matchMedia(SLATE_QUERY).matches;
}
/** Marks <html data-slate> and keeps it in step as the device goes into or out of tablet mode. */
export function markSlate(): void {
  if (typeof document === "undefined") return;
  const set = () => document.documentElement.toggleAttribute("data-slate", isSlate());
  set();
  window.matchMedia(SLATE_QUERY).addEventListener("change", set);
}
