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
  // A new version is fetched on every return to the app (not only at a cold start), and once it has taken over the
  // app says so with a button that loads it — never by itself, so a photo being taken or an upload is never cut off.
  const hadController = Boolean(navigator.serviceWorker.controller);
  const version = await import("@/lib/app-version");
  // Back from an update that did not take (the page still the old version): load it clean, once.
  version.checkUpdateLanded();
  let told = false;
  const tellReady = () => {
    if (told) return;
    told = true;
    void import("sonner").then(({ toast }) => toast("Nuova versione dell’app pronta", {
      description: "Tocca Aggiorna per usarla subito.",
      duration: Infinity,
      // Aggiorna loads the version online for sure: a reload that checks it landed, else a clean one.
      action: { label: "Aggiorna", onClick: () => void version.applyUpdate() },
    }));
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) tellReady(); });
  // A newer version online that the worker has not brought (yet): said all the same, on start and on every return.
  const compare = async () => {
    const online = await version.onlineBuild();
    if (online && version.BUILD_TIME && online !== version.BUILD_TIME) {
      tellReady();
      void version.applyUpdate(online);
    }
  };
  void compare();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void compare(); });
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    // A new version installing (an update, not the first install): its progress shows as a bar.
    const follow = () => {
      if (!navigator.serviceWorker.controller || !reg.installing) return;
      const worker = reg.installing;
      void import("@/lib/update-progress").then((m) => m.followInstall(worker));
    };
    reg.addEventListener("updatefound", follow);
    follow();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void reg.update().catch(() => undefined); });
    window.setInterval(() => void reg.update().catch(() => undefined), 15 * 60_000);
  } catch {
    /* offline support is optional */
  }
}
