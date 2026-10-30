// Single place that registers the offline service worker. Never runs in dev,
// preview builds or iframes; there it removes any stale /sw.js registration.
export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    new URLSearchParams(window.location.search).get("sw") === "off";
  if (refused) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs.filter((r) => r.active?.scriptURL.endsWith("/sw.js")).map((r) => r.unregister()),
    );
    return;
  }
  // After a new deploy, old cached pages can reference page files that no
  // longer match; reload once so the fresh version loads instead of a blank screen.
  const reloadOnce = () => {
    if (sessionStorage.getItem("sw-reloaded")) return;
    sessionStorage.setItem("sw-reloaded", "1");
    // Clean, not a plain reload: the old worker would serve the same mixed versions again.
    void import("@/router").then((m) => m.reloadFresh(), () => window.location.reload());
  };
  const stale = (msg: string) =>
    /reading 'component'|dynamically imported module|Importing a module script failed|routeId/.test(msg);
  window.addEventListener("error", (e) => stale(String(e.message)) && reloadOnce());
  window.addEventListener("unhandledrejection", (e) => stale(String(e.reason?.message ?? e.reason)) && reloadOnce());
  window.setTimeout(() => sessionStorage.removeItem("sw-reloaded"), 10000);
  // No reload on controllerchange: the new worker serves the next visit, so
  // the opening page is never loaded twice.
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    /* offline support is optional */
  }
}
