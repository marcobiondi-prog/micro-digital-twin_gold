declare const __BUILD_TIME__: string | undefined;

/** When this version of the app was built, as "31/10/2026 · 22:40" (shown in the account panel). */
export const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : null;
export function buildLabel(iso: string | null = BUILD_TIME): string {
  if (!iso) return "sviluppo";
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Asks for a newer version now: the worker checks the server; if one is there it installs and takes over, and the
 * page reloads on it. Resolves "updated" (reloading), "latest" (nothing newer) or "offline".
 */
export async function checkForUpdate(): Promise<"updated" | "latest" | "offline"> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return "latest";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "latest";
    await reg.update();
    const incoming = reg.installing ?? reg.waiting;
    if (!incoming) return "latest";
    await new Promise<void>((resolve) => {
      if (incoming.state === "activated") { resolve(); return; }
      incoming.addEventListener("statechange", () => { if (incoming.state === "activated" || incoming.state === "redundant") resolve(); });
      window.setTimeout(resolve, 30_000);
    });
    window.location.reload();
    return "updated";
  } catch {
    return "offline";
  }
}
