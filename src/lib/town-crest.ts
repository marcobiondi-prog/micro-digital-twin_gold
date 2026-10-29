import { crestQuery, crestUrl } from "@/models/comuni";
import { regionCrestQuery } from "@/models/professional-id";

/**
 * A coat of arms — a town's (by ISTAT code) or a region's — looked up once on Wikidata and kept on the device; null
 * when there is none there or the lookup fails (offline, timeout), so nothing is drawn.
 */
const memo = new Map<string, Promise<string | null>>();
const KEY = "mdt-crest-v1";

function saved(): Record<string, string | null> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string | null>; } catch { return {}; }
}

export const townCrest = (istat: string) => crest(istat, crestQuery(istat));
export const regionCrest = (region: string) => { const q = regionCrestQuery(region); return q ? crest(`r:${region}`, q) : Promise.resolve(null); };

function crest(istat: string, query: string): Promise<string | null> {
  const known = saved();
  if (istat in known) return Promise.resolve(known[istat] ?? null);
  let p = memo.get(istat);
  if (!p) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 8000);
    p = fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { signal: ctrl.signal, headers: { Accept: "application/sparql-results+json" } })
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
