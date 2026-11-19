import { OVERPASS_URLS } from "@/models/place-area";

/** The map servers: the app's usual ones plus two steady mirrors. */
export const OVERPASS_ALL = [...new Set([...OVERPASS_URLS, "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.osm.jp/api/interpreter"])];

/** A signal that aborts after ms (AbortSignal.timeout is missing on some older phones). */
export function timeout(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) return AbortSignal.timeout(ms);
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal;
}

/**
 * One query to every map server at once (ms each): the first good answer wins and the others are cancelled, so a
 * server that keeps the request queued no longer holds the screen. Throws the last reason ("tempo scaduto",
 * "risposta 429", "senza rete", "server non raggiungibile") when none answers.
 */
export async function raceOverpass<T = unknown>(query: string, ms = 14000, headers: Record<string, string> = {}): Promise<T[]> {
  let reason = "nessuna risposta";
  const ctrl = new AbortController();
  try {
    return await Promise.any(OVERPASS_ALL.map(async (url) => {
      const sig = timeout(ms);
      const both = new AbortController();
      const stop = () => both.abort();
      sig.addEventListener("abort", stop); ctrl.signal.addEventListener("abort", stop);
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", ...headers }, body: new URLSearchParams({ data: query }), signal: both.signal });
        if (!r.ok) { reason = `risposta ${r.status}`; throw new Error(reason); }
        return ((await r.json()) as { elements?: T[] }).elements ?? [];
      } catch (e) {
        if (sig.aborted) reason = "tempo scaduto";
        else if (typeof navigator !== "undefined" && navigator.onLine === false) reason = "senza rete";
        else if (!(e instanceof Error && e.message.startsWith("risposta"))) reason = "server non raggiungibile";
        throw e;
      }
    }));
  } catch {
    throw new Error(reason);
  } finally { ctrl.abort(); }
}
