/**
 * Progetti condivisi in tempo reale: what a colleague's change did, said in plain words, and where on the map it happened
 * (a tree moved, the aiuole or the sails dragged, a zone drawn), from the simulation before and after it.
 */
type LatLng = [number, number];
type Slice = Record<string, unknown>;
export type LiveChange = { what: string; at: LatLng | null };

const LEVERS: Array<[string, string, string]> = [
  ["trees", "Alberi", ""], ["permeable", "Superfici verdi", "%"], ["shade", "Coperture ombreggianti", "%"],
  ["misters", "Nebulizzatori", ""], ["sprinklers", "Innaffiatoi", ""],
];
const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
type Area = { lat: number; lng: number; ring?: LatLng[]; edits?: Record<string, unknown>; zones?: Array<{ id: string; ring: LatLng[]; name?: string; kind?: string }> };
const centre = (ring: LatLng[] | undefined): LatLng | null => {
  if (!ring?.length) return null;
  const n = ring.length;
  return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
};

export function describeChange(before: Slice, after: Slice): LiveChange | null {
  for (const [k, label, unit] of LEVERS) {
    if (k in after && !eq(before[k], after[k])) return { what: `${label} ${String(after[k] ?? 0)}${unit}`, at: null };
  }
  const a = (before["area"] ?? null) as Area | null, b = (after["area"] ?? null) as Area | null;
  if (!eq(a, b)) {
    if (!b) return { what: "ha tolto l’area", at: null };
    if (!a || !eq(a.ring, b.ring)) return { what: "ha disegnato l’area", at: centre(b.ring) };
    const ea = (a.edits ?? {}) as Record<string, unknown>, eb = (b.edits ?? {}) as Record<string, unknown>;
    const ta = (ea["trees"] ?? []) as Array<LatLng | null>, tb = (eb["trees"] ?? []) as Array<LatLng | null>;
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) if (!eq(ta[i], tb[i]) && tb[i]) return { what: "sposta un albero", at: tb[i] as LatLng };
    if (!eq(ea["lawnAt"], eb["lawnAt"]) || !eq(ea["lawnAngle"], eb["lawnAngle"])) return { what: "sposta le aiuole", at: (eb["lawnAt"] as LatLng | null) ?? null };
    if (!eq(ea["shadeAt"], eb["shadeAt"]) || !eq(ea["shadeAngle"], eb["shadeAngle"])) return { what: "sposta le vele", at: (eb["shadeAt"] as LatLng | null) ?? null };
    if (!eq(ea["windAt"], eb["windAt"])) return { what: "sposta il frangivento", at: (eb["windAt"] as LatLng | null) ?? null };
    if (!eq(ea["best"], eb["best"])) return { what: eb["best"] ? "usa la posizione migliore" : "torna alla disposizione automatica", at: null };
    if (!eq(ea["onlyDrawn"], eb["onlyDrawn"])) return { what: eb["onlyDrawn"] ? "mostra solo quello disegnato" : "torna alla disposizione automatica", at: null };
    const za = a.zones ?? [], zb = b.zones ?? [];
    const added = zb.find((z) => !za.some((y) => y.id === z.id));
    if (added) return { what: `disegna ${added.name ?? "una zona"}`, at: centre(added.ring) };
    const moved = zb.find((z) => { const o = za.find((y) => y.id === z.id); return o && !eq(o, z); });
    if (moved) return { what: `cambia ${moved.name ?? "una zona"}`, at: centre(moved.ring) };
    if (za.length > zb.length) return { what: "toglie una zona", at: null };
    return { what: "cambia l’area", at: null };
  }
  if (!eq(before["location"], after["location"])) return { what: "cambia luogo", at: null };
  if (!eq(before["zones"], after["zones"]) || !eq(before["mix"], after["mix"])) return { what: "cambia gli interventi del vigneto", at: null };
  for (const k of Object.keys(after)) if (k !== "places" && !eq(before[k], after[k])) return { what: "cambia la simulazione", at: null };
  return null;
}
