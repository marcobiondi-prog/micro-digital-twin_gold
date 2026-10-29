import { crestQuery, crestUrl } from "@/models/comuni";

/**
 * A town's coat of arms, looked up once per town (ISTAT code) on Wikidata and kept on the device; null when the town
 * has none there or the lookup fails (offline, timeout), so nothing is drawn.
 */
const memo = new Map<string, Promise<string | null>>();
const KEY = "mdt-crest-v1";

function saved(): Record<string, string | null> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string | null>; } catch { return {}; }
}

export function townCrest(istat: string): Promise<string | null> {
  const known = saved();
  if (istat in known) return Promise.resolve(known[istat] ?? null);
  let p = memo.get(istat);
  if (!p) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);
    p = fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(crestQuery(istat))}`, { signal: ctrl.signal, headers: { Accept: "application/sparql-results+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { results?: { bindings?: Array<{ img?: { value?: string } }> } } | null) => {
        if (!j) { memo.delete(istat); return null; }
        const file = j?.results?.bindings?.[0]?.img?.value;
        const url = file ? crestUrl(file) : null;
        // Keep the answer (a crest or none) so the town is asked only once; a failed lookup is not kept.
        try { localStorage.setItem(KEY, JSON.stringify({ ...saved(), [istat]: url })); } catch { /* memory only */ }
        return url;
      })
      .catch(() => { memo.delete(istat); return null; })
      .finally(() => window.clearTimeout(timer));
    memo.set(istat, p);
  }
  return p;
}
