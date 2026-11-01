import { useSyncExternalStore } from "react";

/**
 * How far the installation of a new version has gone: the new worker downloads the files listed in its precache
 * manifest into the "workbox-precache" cache, so the share of those files already there is the progress (files the
 * old version already had count at once). Shown as a bar while it installs, from any update (on return to the app,
 * every 15 minutes, or "Cerca aggiornamenti").
 */
/**
 * checking: "Cerca aggiornamenti" is asking the server; installing: the new worker downloads its files; ready: installed;
 * applying: the new version is being loaded (the bar fills to 100 before the reload, so a version already downloaded in
 * the background still shows its bar).
 */
export type UpdateProgress = { phase: "idle" | "checking" | "installing" | "ready" | "applying"; pct: number };
let state: UpdateProgress = { phase: "idle", pct: 0 };
const subs = new Set<() => void>();
const set = (next: UpdateProgress) => { state = next; subs.forEach((f) => f()); };
export const getUpdateProgress = () => state;
/** "Cerca aggiornamenti" started (a first sliver of bar) or ended without anything to load. */
export const markChecking = (on: boolean) => {
  if (on) { if (state.phase === "idle") set({ phase: "checking", pct: 4 }); }
  else if (state.phase === "checking") set({ phase: "idle", pct: 0 });
};
/** The bar fills from where it is to 100 % in about 0,7 s, then resolves: shown just before the reload on the new version. */
export function showApplying(): Promise<void> {
  return new Promise((resolve) => {
    const from = state.phase === "installing" || state.phase === "ready" ? state.pct : Math.max(state.pct, 10);
    const t0 = performance.now(), ms = 700;
    set({ phase: "applying", pct: from });
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      set({ phase: "applying", pct: Math.round(from + (100 - from) * k) });
      if (k < 1) requestAnimationFrame(step); else window.setTimeout(resolve, 200);
    };
    requestAnimationFrame(step);
  });
}
export function useUpdateProgress() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}

/** The cache keys the new worker will fill, read from its manifest ({url, revision} entries of /sw.js). */
export function manifestKeys(swText: string, origin: string): string[] {
  const keys: string[] = [];
  for (const m of swText.matchAll(/\{url:"([^"]+)",revision:(null|"([^"]*)")\}/g)) {
    const url = new URL(m[1]!, `${origin}/`);
    if (m[3]) url.searchParams.set("__WB_REVISION__", m[3]);
    keys.push(url.href);
  }
  return keys;
}

async function filled(expected: Set<string>): Promise<number> {
  const names = (await caches.keys()).filter((n) => n.startsWith("workbox-precache"));
  let n = 0;
  for (const name of names) for (const req of await (await caches.open(name)).keys()) if (expected.has(req.url)) n++;
  return n;
}

/** Follows one installing worker until it is installed (or dropped), updating the progress. */
export async function followInstall(worker: ServiceWorker) {
  if (state.phase === "installing" || state.phase === "applying") return;
  set({ phase: "installing", pct: 0 });
  let expected = new Set<string>();
  try { expected = new Set(manifestKeys(await (await fetch("/sw.js", { cache: "no-store" })).text(), location.origin)); } catch { /* the bar then runs on the worker's state alone */ }
  let done = false;
  const finish = (ok: boolean) => {
    if (done) return;
    done = true;
    window.clearInterval(timer);
    set(ok ? { phase: "ready", pct: 100 } : { phase: "idle", pct: 0 });
    if (ok) window.setTimeout(() => { if (state.phase === "ready") set({ phase: "idle", pct: 0 }); }, 2500);
  };
  const tick = async () => {
    if (done || typeof caches === "undefined" || !expected.size) return;
    const have = await filled(expected).catch(() => 0);
    // Never back, never 100 before the worker says so.
    if (!done) set({ phase: "installing", pct: Math.max(state.pct, Math.min(99, Math.round((100 * have) / expected.size))) });
  };
  const timer = window.setInterval(() => void tick(), 300);
  void tick();
  const onState = () => {
    if (worker.state === "installed" || worker.state === "activating" || worker.state === "activated") finish(true);
    else if (worker.state === "redundant") finish(false);
  };
  worker.addEventListener("statechange", onState);
  onState();
  window.setTimeout(() => finish(worker.state !== "redundant" && worker.state !== "installing"), 120_000);
}
