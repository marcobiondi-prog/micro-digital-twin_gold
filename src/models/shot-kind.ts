/**
 * What kind of shot a photo or video is, read from its file name so it works for files already saved: the AI camera's
 * ("foto-ar…", "video-ar…"), the multiple shot's ("multiplo-…"), a plain video, or a single photo (camera or gallery).
 * The Cronologia and the archive count and filter them by kind.
 */
export type ShotKind = "foto" | "multiplo" | "ai" | "video";

export const SHOT_KINDS: Array<{ id: ShotKind; label: string; one: string; many: string }> = [
  { id: "foto", label: "Foto", one: "foto", many: "foto" },
  { id: "multiplo", label: "Scatto multiplo", one: "scatto multiplo", many: "scatti multipli" },
  { id: "ai", label: "Con l’AI", one: "con l’AI", many: "con l’AI" },
  { id: "video", label: "Video", one: "video", many: "video" },
];

export function shotKind(item: { name: string; kind: "image" | "video" }): ShotKind {
  const n = item.name.toLowerCase();
  if (/(^|[^a-z])(foto|video)-ar[-_]/.test(n)) return "ai";
  if (/(^|[^a-z])multiplo-/.test(n)) return "multiplo";
  return item.kind === "video" ? "video" : "foto";
}

/** "3 foto · 5 scatti multipli · 1 con l'AI · 2 video", only the kinds there are. */
export function kindCountText(items: Array<{ name: string; kind: "image" | "video" }>): string {
  const n: Record<ShotKind, number> = { foto: 0, multiplo: 0, ai: 0, video: 0 };
  for (const i of items) n[shotKind(i)]++;
  return SHOT_KINDS.filter((k) => n[k.id]).map((k) => `${n[k.id]} ${n[k.id] === 1 ? k.one : k.many}`).join(" · ");
}

/** The short label shown on a photo or video: "Foto", "Multiplo", "AI" / "AR" (with " · Multiplo" for a multiple shot), "Video". */
export function shotLabel(item: { name: string; kind: "image" | "video" }): string {
  const k = shotKind(item);
  if (k === "ai") {
    const n = item.name.toLowerCase();
    // The AI camera's AR view names its photos "foto-ar-prova…": labelled "AR", the scans' "AI".
    const tag = /(^|[^a-z])foto-ar-prova/.test(n) ? "AR" : "AI";
    return /(^|[^a-z-])multiplo-|-multiplo-/.test(n) ? `${tag} · Multiplo` : item.kind === "video" ? `Video ${tag}` : tag;
  }
  return k === "foto" ? "Foto" : k === "multiplo" ? "Multiplo" : "Video";
}

/** The label a photo or video is filed under on the Cronologia's time line: the AR view's, the AI scans', a multiple shot, a video or a single photo. */
export type ShotTag = "foto" | "multiplo" | "ai" | "ar" | "video";

export const SHOT_TAGS: Array<{ id: ShotTag; label: string }> = [
  { id: "foto", label: "Foto" },
  { id: "multiplo", label: "Scatto multiplo" },
  { id: "ai", label: "AI" },
  { id: "ar", label: "AR" },
  { id: "video", label: "Video" },
];

export function shotTag(item: { name: string; kind: "image" | "video" }): ShotTag {
  const k = shotKind(item);
  if (k === "ai") return /(^|[^a-z])foto-ar-prova/.test(item.name.toLowerCase()) ? "ar" : "ai";
  return k;
}

/** "2 foto · 2 scatti multipli · 1 AI · 1 AR", by label, only the labels there are. */
export function tagCountText(items: Array<{ name: string; kind: "image" | "video" }>): string {
  const n: Record<ShotTag, number> = { foto: 0, multiplo: 0, ai: 0, ar: 0, video: 0 };
  for (const i of items) n[shotTag(i)]++;
  const word: Record<ShotTag, [string, string]> = { foto: ["foto", "foto"], multiplo: ["scatto multiplo", "scatti multipli"], ai: ["AI", "AI"], ar: ["AR", "AR"], video: ["video", "video"] };
  return SHOT_TAGS.filter((k) => n[k.id]).map((k) => `${n[k.id]} ${word[k.id][n[k.id] === 1 ? 0 : 1]}`).join(" · ");
}
