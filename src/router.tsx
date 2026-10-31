import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a new deploy, an open tab may request page chunks that no longer exist.
// Reload once to pick up the fresh build instead of showing a blank screen.
const RELOAD_KEY = "chunk-reload-at";
/** Start clean from the network: every cache of the service worker (pages and page files) is dropped and the worker
 * itself unregistered (the app registers a fresh one once loaded). On a slow network the old worker could serve a
 * page of an earlier version together with files of the new one, which breaks the app ("reading 'component'"). */
export async function reloadFresh() {
  try { if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k))); } catch { /* cache unavailable */ }
  try { if ("serviceWorker" in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister())); } catch { /* no worker */ }
  window.location.reload();
}
function reloadForStaleChunk() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  void reloadFresh();
}
/** A page of one version running with files of another: a missing chunk, or a route the loaded files do not know. */
export const isChunkError = (e: unknown) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|reading 'component'|routeId/i.test(
    String((e as { message?: string })?.message ?? e),
  );
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadForStaleChunk();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkError(event.reason)) reloadForStaleChunk();
  });
  window.addEventListener("error", (event) => {
    if (isChunkError(event.error ?? event.message)) reloadForStaleChunk();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
