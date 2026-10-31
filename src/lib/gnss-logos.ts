import { crestUrl } from "@/models/comuni";
import { logoQuery, logosFrom } from "@/models/credit-logos";

/**
 * Logos looked up once on Wikidata (8 s at most) and kept on the device under their own key; a failed lookup is not
 * kept, so the next visit asks again, and nothing is drawn meanwhile. Used for the satellite systems and the services
 * without a bundled mark.
 */
const pending = new Map<string, Promise<Record<string, string | null>>>();

export function wikiLogos(key: string, items: Array<{ id: string; articles?: string[] }>): Promise<Record<string, string | null>> {
  const asked = items.filter((g) => g.articles?.length);
  if (!asked.length) return Promise.resolve({});
  try {
    const known = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, string | null> | null;
    if (known && asked.every((g) => g.id in known)) return Promise.resolve(known);
  } catch { /* ask again */ }
  const running = pending.get(key);
  if (running) return running;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  const p = fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(logoQuery(asked))}`, { signal: ctrl.signal, headers: { Accept: "application/sparql-results+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { results?: { bindings?: Array<{ title?: { value?: string }; img?: { value?: string } }> } }) => {
      const files = logosFrom(asked, j.results?.bindings ?? []);
      const urls = Object.fromEntries(Object.entries(files).map(([id, f]) => [id, f ? crestUrl(f, 200) : null]));
      try { localStorage.setItem(key, JSON.stringify(urls)); } catch { /* memory only */ }
      return urls;
    })
    .catch(() => ({}) as Record<string, string | null>)
    .finally(() => { window.clearTimeout(timer); pending.delete(key); });
  pending.set(key, p);
  return p;
}
