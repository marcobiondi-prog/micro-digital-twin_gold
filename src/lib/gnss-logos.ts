import { crestUrl } from "@/models/comuni";
import { GNSS, gnssLogoQuery, gnssLogosFrom } from "@/models/gnss";

/**
 * The satellite systems' logos, looked up once on Wikidata (8 s at most) and kept on the device; a failed lookup is not
 * kept, so the next visit asks again, and nothing is drawn meanwhile.
 */
const KEY = "mdt-gnss-logo-v1";
let pending: Promise<Record<string, string | null>> | null = null;

export function gnssLogos(): Promise<Record<string, string | null>> {
  try {
    const known = JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, string | null> | null;
    if (known && GNSS.every((g) => g.id in known)) return Promise.resolve(known);
  } catch { /* ask again */ }
  if (pending) return pending;
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 8000);
  pending = fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(gnssLogoQuery())}`, { signal: ctrl.signal, headers: { Accept: "application/sparql-results+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { results?: { bindings?: Array<{ title?: { value?: string }; img?: { value?: string } }> } }) => {
      const files = gnssLogosFrom(j.results?.bindings ?? []);
      const urls = Object.fromEntries(Object.entries(files).map(([id, f]) => [id, f ? crestUrl(f, 200) : null]));
      try { localStorage.setItem(KEY, JSON.stringify(urls)); } catch { /* memory only */ }
      return urls;
    })
    .catch(() => ({}) as Record<string, string | null>)
    .finally(() => { window.clearTimeout(timer); pending = null; });
  return pending;
}
