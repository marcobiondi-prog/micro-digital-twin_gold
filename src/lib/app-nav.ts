/**
 * Moves the app to a page without reloading it (the root listens and navigates), so entering an account or a profile
 * never shows the loading screen a second time.
 */
export function goInApp(href: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("mdt-go", { detail: href }));
}
