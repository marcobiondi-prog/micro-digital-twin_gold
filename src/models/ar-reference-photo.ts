import { sameBotanicalName } from "@/models/ar-botanical-match";

/**
 * Reference photo of the identified species for Esito, from botanical databases rather than the camera:
 * first Royal Botanic Gardens, Kew (Plants of the World Online, curated images), then GBIF occurrence
 * photos with an open licence. It should show the WHOLE plant (habit), not a leaf, flower or herbarium
 * sheet: captions naming the habit win, close-ups of a part lose. Pure parsers here; the server fetches
 * (ar-detect.functions.ts).
 */
export type ReferencePhoto = { url: string; credit: string; link: string };

const HABIT = /\b(habit|habitus|portamento|whole plant|tree|albero|shrub|arbusto|in situ|in habitat|growing|landscape|general view|vista generale)\b/i;
const PART = /\b(leaf|leaves|foglia|foglie|flower|flowers|fiore|fiori|fruit|fruits|frutto|frutti|seed|seeds|semi|bark|corteccia|bud|buds|cone|cones|inflorescence|close[- ]?up|detail|dettaglio|twig|branchlet|ramo|petal|stamen|acorn|ghianda)\b/i;
const SPECIMEN = /\b(herbarium|erbario|specimen|exsiccat|type|isotype|holotype|sheet|drawing|illustration|plate|tavola)\b/i;
/** Higher is better: the habit of the plant; a part close-up or an herbarium sheet ranks below anything else. */
export function wholePlantScore(text: string | undefined): number {
  const t = text ?? "";
  return (HABIT.test(t) ? 2 : 0) - (PART.test(t) ? 2 : 0) - (SPECIMEN.test(t) ? 3 : 0);
}

type PowoImage = { thumbnail?: string; fullsize?: string; caption?: string; title?: string; description?: string };
type PowoResult = { name?: string; accepted?: boolean; url?: string; fqId?: string; images?: PowoImage[] };

const https = (u: string | undefined) => (u ? (u.startsWith("//") ? `https:${u}` : u) : "");

/**
 * Kew image of the scanned species (accepted names first) that best shows the whole plant; with
 * `wholeOnly`, only one whose caption names the habit (so a GBIF habit photo can win over a Kew leaf).
 */
export function pickPowoPhoto(json: unknown, scientificName: string, wholeOnly = false): ReferencePhoto | null {
  const results = ((json as { results?: PowoResult[] } | null)?.results ?? []).filter((r) => r.name && sameBotanicalName(r.name, scientificName));
  results.sort((a, b) => Number(Boolean(b.accepted)) - Number(Boolean(a.accepted)));
  let best: { photo: ReferencePhoto; score: number } | null = null;
  for (const r of results) {
    for (const image of r.images ?? []) {
      const url = https(image.fullsize ?? image.thumbnail);
      if (!url.startsWith("https://")) continue;
      const caption = [image.caption, image.title, image.description].filter(Boolean).join(" · ");
      const score = wholePlantScore(caption);
      if (best && score <= best.score) continue;
      const path = r.url ?? (r.fqId ? `/taxon/${r.fqId}` : "");
      best = { score, photo: { url, credit: `Royal Botanic Gardens, Kew · Plants of the World Online${image.caption ? ` · ${image.caption.slice(0, 80)}` : ""}`, link: `https://powo.science.kew.org${path}` } };
    }
  }
  if (!best || best.score < 0 || (wholeOnly && best.score <= 0)) return null;
  return best.photo;
}

type GbifMedia = { type?: string; identifier?: string; license?: string; creator?: string; rightsHolder?: string; title?: string; description?: string };
type GbifOccurrence = { key?: number; basisOfRecord?: string; media?: GbifMedia[] };

/** Short name of an open licence URL, or null when the photo may not be shown (e.g. all rights reserved). */
export function openLicence(license: string | undefined): string | null {
  const l = (license ?? "").toLowerCase();
  if (/publicdomain\/zero|cc0/.test(l)) return "CC0";
  const m = /licenses\/(by(?:-nc)?(?:-sa)?)\//.exec(l) ?? /\bcc[ _-](by(?:[ _-]nc)?(?:[ _-]sa)?)\b/.exec(l);
  return m ? `CC ${m[1]!.replace(/[ _]/g, "-").toUpperCase()}` : null;
}

/**
 * Openly licensed GBIF photo of the species that best shows the whole plant: field observations only (no
 * herbarium sheets), a habit caption first, and never one captioned as a leaf, flower or fruit close-up.
 */
export function pickGbifPhoto(json: unknown): ReferencePhoto | null {
  let best: { photo: ReferencePhoto; score: number } | null = null;
  for (const o of (json as { results?: GbifOccurrence[] } | null)?.results ?? []) {
    if (o.basisOfRecord && o.basisOfRecord !== "HUMAN_OBSERVATION" && o.basisOfRecord !== "OBSERVATION") continue;
    for (const m of o.media ?? []) {
      const licence = openLicence(m.license);
      if (m.type !== "StillImage" || !licence || !m.identifier?.startsWith("https://") || !o.key) continue;
      const score = wholePlantScore([m.title, m.description].filter(Boolean).join(" "));
      if (score < 0 || (best && score <= best.score)) continue;
      const author = (m.creator || m.rightsHolder || "").trim().slice(0, 60);
      best = { score, photo: { url: m.identifier, credit: `${author ? `${author} · ` : ""}${licence} · via GBIF`, link: `https://www.gbif.org/occurrence/${o.key}` } };
    }
  }
  return best?.photo ?? null;
}
