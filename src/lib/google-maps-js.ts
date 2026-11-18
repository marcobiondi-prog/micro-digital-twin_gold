/**
 * One loader for Google's Maps JavaScript API, shared by the 3D view (maps3d) and the 2D map's base (maps), so the
 * two maps show the very same imagery with the same browser key. A refused key calls window.gm_authFailure, which the
 * views read through onKeyRejected.
 */
type GoogleNs = { maps: { importLibrary: (name: string) => Promise<unknown> } };
let loader: Promise<GoogleNs> | undefined;
let keyRejected = false;
const rejectedSubs = new Set<() => void>();
if (typeof window !== "undefined") {
  (window as typeof window & { gm_authFailure?: () => void }).gm_authFailure = () => { keyRejected = true; rejectedSubs.forEach((f) => f()); };
}
// Google says why in the console ("Google Maps JavaScript API error: RefererNotAllowedMapError …"): the code is kept
// so the 3D's fallback line can show it on the phone, where the console cannot be read.
let rejectReason: string | null = null;
if (typeof window !== "undefined") {
  for (const level of ["error", "warn"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      const text = args.map((x) => (typeof x === "string" ? x : x instanceof Error ? x.message : "")).join(" ");
      const m = /(?:Google Maps JavaScript API|maps)\b[^:]*(?:error|warning):\s*(\w+)/i.exec(text) ?? /\b(\w+MapError)\b/.exec(text);
      if (m && /Error$/.test(m[1]!) && !rejectReason) { rejectReason = m[1]!; rejectedSubs.forEach((f) => f()); }
      orig(...args);
    };
  }
}
export const keyRejectReason = () => rejectReason;
/** The plain words for Google's refusal codes. */
export function rejectText(code: string | null): string | null {
  if (!code) return null;
  const words: Record<string, string> = {
    RefererNotAllowedMapError: "la chiave non vale per questo indirizzo",
    ApiNotActivatedMapError: "un servizio delle mappe non è attivo per la chiave",
    ApiTargetBlockedMapError: "la chiave non può usare questo servizio",
    BillingNotEnabledMapError: "la fatturazione del progetto Google non è attiva",
    OverQuotaMapError: "limite di uso raggiunto",
    ExpiredKeyMapError: "chiave scaduta",
    InvalidKeyMapError: "chiave non valida",
    MissingKeyMapError: "chiave mancante",
  };
  return `${words[code] ?? "rifiutata da Google"} (${code})`;
}
export const isKeyRejected = () => keyRejected;
export function onKeyRejected(f: () => void): () => void { rejectedSubs.add(f); return () => { rejectedSubs.delete(f); }; }

export function loadGoogleMaps(key: string): Promise<GoogleNs> {
  loader ??= new Promise<GoogleNs>((resolve, reject) => {
    const w = window as typeof window & { google?: GoogleNs; __mdtMapsReady?: () => void };
    if (w.google?.maps?.importLibrary) { resolve(w.google); return; }
    w.__mdtMapsReady = () => resolve(w.google!);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&language=it&region=IT&loading=async&callback=__mdtMapsReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Maps JavaScript API non raggiungibile"));
    document.head.appendChild(script);
  }).catch((error) => { loader = undefined; throw error; });
  return loader;
}
