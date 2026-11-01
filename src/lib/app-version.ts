declare const __BUILD_TIME__: string | undefined;

/** When this version of the app was built, as "31/10/2026 · 22:40" (shown in the account panel). */
export const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : null;
export function buildLabel(iso: string | null = BUILD_TIME): string {
  if (!iso) return "sviluppo";
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

/** The version online now (its build time, from /version.json), or null without a connection. */
export async function onlineBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data.build === "string" ? data.build : null;
  } catch { return null; }
}

const TARGET_KEY = "mdt-update-target", FRESH_KEY = "mdt-update-fresh";
/**
 * Loads the version online: a reload that remembers which version it expects; if the page comes back still on the
 * old one (an old file kept somewhere), checkUpdateLanded clears every cache and the worker and loads it clean.
 */
export async function applyUpdate(target?: string | null) {
  const want = target ?? (await onlineBuild());
  // The bar fills to 100 % before the reload, wherever the update was started.
  await import("@/lib/update-progress").then((m) => m.showApplying()).catch(() => undefined);
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch { /* no worker */ }
  try { if (want) sessionStorage.setItem(TARGET_KEY, want); } catch { /* a plain reload then */ }
  window.location.reload();
}
/** Run once at start: after applyUpdate, the page must be the version it asked for, else it reloads clean (once). */
export function checkUpdateLanded() {
  try {
    const want = sessionStorage.getItem(TARGET_KEY);
    if (!want || !BUILD_TIME) return;
    sessionStorage.removeItem(TARGET_KEY);
    if (want === BUILD_TIME || sessionStorage.getItem(FRESH_KEY) === want) return;
    sessionStorage.setItem(FRESH_KEY, want);
    void import("@/router").then((m) => m.reloadFresh(), () => window.location.reload());
  } catch { /* storage unavailable */ }
}

/**
 * Asks for a newer version now: the worker checks the server and the version online is compared with the one running
 * (/version.json), so a new version already installed but not yet loaded counts too. Resolves "updated" (reloading
 * on it), "latest" (this is the version online) or "offline".
 */
export async function checkForUpdate(): Promise<"updated" | "latest" | "offline"> {
  if (typeof navigator === "undefined") return "latest";
  const progress = await import("@/lib/update-progress");
  progress.markChecking(true);
  const result = await findUpdate();
  if (result !== "updated") progress.markChecking(false);
  return result;
}
async function findUpdate(): Promise<"updated" | "latest" | "offline"> {
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    await reg?.update().catch(() => undefined);
    const incoming = reg?.installing ?? reg?.waiting;
    if (incoming) {
      await new Promise<void>((resolve) => {
        if (incoming.state === "activated") { resolve(); return; }
        incoming.addEventListener("statechange", () => { if (incoming.state === "activated" || incoming.state === "redundant") resolve(); });
        window.setTimeout(resolve, 30_000);
      });
    }
    const online = await onlineBuild();
    if (!online) return incoming ? (await applyUpdate(null), "updated") : "offline";
    if (BUILD_TIME && online !== BUILD_TIME) { await applyUpdate(online); return "updated"; }
    return "latest";
  } catch {
    return "offline";
  }
}
