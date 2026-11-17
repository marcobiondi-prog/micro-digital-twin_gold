/**
 * How a recognised plant is built in 3D for the AR: a few numbers describing its shape (crown outline, width, density,
 * how high the bare trunk goes, stems, lean, kind and colour of leaves, colour of the bark) that views/ar-plant turns into a model.
 *
 * Three sources, in order of trust for each value:
 * 1. what the AI saw of the very specimen in the photo (Specimen, from the scan): its crown, how dense, how many stems…
 * 2. the species' or genus' card below (about forty plants common in Italian squares and vineyards), for what a photo
 *    tells poorly (leaf kind, true colours),
 * 3. the plant's form, for any other species.
 * Four plants have a model of their own (customModel): the stone pine, the Italian cypress, the olive and the lime tree.
 */

export type CrownKind = "columnar" | "conical" | "ovoid" | "round" | "spreading" | "umbrella" | "vase" | "weeping" | "irregular" | "shrub";
export type LeafKind = "needle" | "scale" | "broad" | "compound" | "narrow";
export const CROWN_KINDS: readonly CrownKind[] = ["columnar", "conical", "ovoid", "round", "spreading", "umbrella", "vase", "weeping", "irregular", "shrub"];
export const LEAF_KINDS: readonly LeafKind[] = ["needle", "scale", "broad", "compound", "narrow"];

/** What the AI saw of the photographed plant (all optional: a field it could not judge is left out). */
export type Specimen = {
  crown?: CrownKind;
  /** Crown width / plant height. */
  widthRatio?: number;
  /** 0 airy … 1 solid. */
  density?: number;
  /** Share of the height that is bare trunk under the crown (0 for a shrub, 0.6 for a stone pine). */
  clearTrunk?: number;
  stems?: number;
  leanDeg?: number;
  leaf?: LeafKind;
  leafColor?: string;
  barkColor?: string;
};

export type TreeShape = {
  crown: CrownKind;
  widthRatio: number;
  density: number;
  clearTrunk: number;
  stems: number;
  leanDeg: number;
  leaf: LeafKind;
  leafColor: string;
  barkColor: string;
  /** Pale peeling patches on the bark (plane tree), white bark (birch). */
  bark?: "plain" | "patchy" | "white" | "fissured";
};

type Card = Partial<TreeShape>;

const DARK = "#3f5a34", MID = "#5b7f3e", LIGHT = "#7da34f", SILVERY = "#8d9c80", BLUE_GREEN = "#5d7a6a";
const GREY_BARK = "#7d776d", BROWN_BARK = "#5e4a3c", DARK_BARK = "#3f352e";

/** By species ("Genus species") first, then by genus. */
const CARDS: Record<string, Card> = {
  // Broadleaves of squares and avenues
  Tilia: { crown: "ovoid", widthRatio: 0.7, density: 0.85, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: GREY_BARK, bark: "fissured" },
  Platanus: { crown: "spreading", widthRatio: 0.85, density: 0.7, clearTrunk: 0.3, leaf: "broad", leafColor: MID, barkColor: "#b9ae98", bark: "patchy" },
  Celtis: { crown: "round", widthRatio: 0.85, density: 0.7, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: "#8e8a83" },
  Acer: { crown: "round", widthRatio: 0.75, density: 0.8, clearTrunk: 0.2, leaf: "broad", leafColor: LIGHT, barkColor: GREY_BARK },
  "Acer negundo": { crown: "irregular", widthRatio: 0.85, density: 0.6, clearTrunk: 0.15, leaf: "compound", leafColor: LIGHT, barkColor: GREY_BARK },
  Ulmus: { crown: "vase", widthRatio: 0.8, density: 0.7, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: BROWN_BARK, bark: "fissured" },
  Aesculus: { crown: "ovoid", widthRatio: 0.75, density: 0.9, clearTrunk: 0.2, leaf: "broad", leafColor: "#4f7a3a", barkColor: BROWN_BARK },
  Fagus: { crown: "ovoid", widthRatio: 0.8, density: 0.9, clearTrunk: 0.2, leaf: "broad", leafColor: MID, barkColor: "#9a968c" },
  Castanea: { crown: "round", widthRatio: 0.9, density: 0.8, clearTrunk: 0.2, leaf: "broad", leafColor: MID, barkColor: BROWN_BARK, bark: "fissured" },
  Carpinus: { crown: "ovoid", widthRatio: 0.7, density: 0.85, clearTrunk: 0.15, leaf: "broad", leafColor: MID, barkColor: "#8f8c84" },
  Morus: { crown: "round", widthRatio: 1, density: 0.8, clearTrunk: 0.25, leaf: "broad", leafColor: LIGHT, barkColor: BROWN_BARK, bark: "fissured" },
  Liquidambar: { crown: "conical", widthRatio: 0.5, density: 0.75, clearTrunk: 0.15, leaf: "broad", leafColor: MID, barkColor: BROWN_BARK, bark: "fissured" },
  Liriodendron: { crown: "ovoid", widthRatio: 0.55, density: 0.75, clearTrunk: 0.25, leaf: "broad", leafColor: LIGHT, barkColor: GREY_BARK },
  Betula: { crown: "ovoid", widthRatio: 0.5, density: 0.45, clearTrunk: 0.25, leaf: "broad", leafColor: LIGHT, barkColor: "#e4e0d6", bark: "white" },
  Populus: { crown: "ovoid", widthRatio: 0.55, density: 0.7, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: GREY_BARK, bark: "fissured" },
  "Populus nigra": { crown: "columnar", widthRatio: 0.22, density: 0.8, clearTrunk: 0.08, leaf: "broad", leafColor: MID, barkColor: BROWN_BARK, bark: "fissured" },
  "Populus alba": { crown: "ovoid", widthRatio: 0.65, density: 0.7, clearTrunk: 0.25, leaf: "broad", leafColor: SILVERY, barkColor: "#cfcbc0", bark: "white" },
  Salix: { crown: "round", widthRatio: 0.8, density: 0.6, clearTrunk: 0.2, leaf: "narrow", leafColor: "#86a65c", barkColor: GREY_BARK, bark: "fissured" },
  "Salix babylonica": { crown: "weeping", widthRatio: 1, density: 0.65, clearTrunk: 0.25, leaf: "narrow", leafColor: "#9ab85f", barkColor: GREY_BARK, bark: "fissured" },
  Quercus: { crown: "spreading", widthRatio: 0.95, density: 0.8, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: DARK_BARK, bark: "fissured" },
  "Quercus ilex": { crown: "round", widthRatio: 0.9, density: 0.95, clearTrunk: 0.18, leaf: "broad", leafColor: DARK, barkColor: DARK_BARK, bark: "fissured" },
  "Quercus suber": { crown: "spreading", widthRatio: 1, density: 0.8, clearTrunk: 0.25, leaf: "broad", leafColor: DARK, barkColor: "#8a7560", bark: "fissured" },
  "Quercus pubescens": { crown: "irregular", widthRatio: 0.95, density: 0.7, clearTrunk: 0.2, leaf: "broad", leafColor: "#6b8a4a", barkColor: DARK_BARK, bark: "fissured" },
  // Compound leaves
  Fraxinus: { crown: "ovoid", widthRatio: 0.7, density: 0.6, clearTrunk: 0.25, leaf: "compound", leafColor: MID, barkColor: GREY_BARK, bark: "fissured" },
  Robinia: { crown: "irregular", widthRatio: 0.75, density: 0.5, clearTrunk: 0.25, leaf: "compound", leafColor: LIGHT, barkColor: BROWN_BARK, bark: "fissured" },
  Sophora: { crown: "round", widthRatio: 0.9, density: 0.65, clearTrunk: 0.25, leaf: "compound", leafColor: MID, barkColor: GREY_BARK, bark: "fissured" },
  Styphnolobium: { crown: "round", widthRatio: 0.9, density: 0.65, clearTrunk: 0.25, leaf: "compound", leafColor: MID, barkColor: GREY_BARK, bark: "fissured" },
  Gleditsia: { crown: "spreading", widthRatio: 0.9, density: 0.45, clearTrunk: 0.3, leaf: "compound", leafColor: LIGHT, barkColor: DARK_BARK },
  Ailanthus: { crown: "irregular", widthRatio: 0.7, density: 0.5, clearTrunk: 0.3, leaf: "compound", leafColor: MID, barkColor: "#9b958a" },
  Juglans: { crown: "round", widthRatio: 0.9, density: 0.65, clearTrunk: 0.25, leaf: "compound", leafColor: MID, barkColor: "#8f8a80", bark: "fissured" },
  Melia: { crown: "umbrella", widthRatio: 1, density: 0.55, clearTrunk: 0.35, leaf: "compound", leafColor: MID, barkColor: BROWN_BARK },
  Albizia: { crown: "umbrella", widthRatio: 1.3, density: 0.45, clearTrunk: 0.3, leaf: "compound", leafColor: LIGHT, barkColor: GREY_BARK },
  // Mediterranean evergreens and small trees
  Laurus: { crown: "ovoid", widthRatio: 0.6, density: 0.95, clearTrunk: 0.08, stems: 2, leaf: "broad", leafColor: DARK, barkColor: "#4e4a40" },
  Magnolia: { crown: "ovoid", widthRatio: 0.65, density: 0.95, clearTrunk: 0.1, leaf: "broad", leafColor: "#2f4e2c", barkColor: GREY_BARK },
  Ilex: { crown: "conical", widthRatio: 0.55, density: 0.95, clearTrunk: 0.08, leaf: "broad", leafColor: DARK, barkColor: GREY_BARK },
  Ligustrum: { crown: "round", widthRatio: 0.9, density: 0.9, clearTrunk: 0.15, stems: 2, leaf: "broad", leafColor: DARK, barkColor: GREY_BARK },
  Ceratonia: { crown: "round", widthRatio: 1.1, density: 0.9, clearTrunk: 0.15, leaf: "compound", leafColor: DARK, barkColor: GREY_BARK },
  Citrus: { crown: "round", widthRatio: 1, density: 0.95, clearTrunk: 0.15, leaf: "broad", leafColor: DARK, barkColor: GREY_BARK },
  Ficus: { crown: "spreading", widthRatio: 1.2, density: 0.75, clearTrunk: 0.1, stems: 3, leaf: "broad", leafColor: MID, barkColor: "#9c968b" },
  Prunus: { crown: "round", widthRatio: 0.9, density: 0.7, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: "#5e4038" },
  "Prunus cerasifera": { crown: "round", widthRatio: 0.9, density: 0.75, clearTrunk: 0.2, leaf: "broad", leafColor: "#6b3a3a", barkColor: "#4a3530" },
  Malus: { crown: "round", widthRatio: 1, density: 0.7, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: BROWN_BARK, bark: "fissured" },
  Pyrus: { crown: "ovoid", widthRatio: 0.7, density: 0.7, clearTrunk: 0.25, leaf: "broad", leafColor: MID, barkColor: DARK_BARK, bark: "fissured" },
  Lagerstroemia: { crown: "vase", widthRatio: 0.8, density: 0.65, clearTrunk: 0.2, stems: 3, leaf: "broad", leafColor: MID, barkColor: "#b49a80", bark: "patchy" },
  Eucalyptus: { crown: "irregular", widthRatio: 0.6, density: 0.5, clearTrunk: 0.35, leaf: "narrow", leafColor: BLUE_GREEN, barkColor: "#c9bfae", bark: "patchy" },
  Nerium: { crown: "shrub", widthRatio: 1, density: 0.75, clearTrunk: 0, stems: 5, leaf: "narrow", leafColor: DARK, barkColor: GREY_BARK },
  Pittosporum: { crown: "shrub", widthRatio: 1, density: 0.95, clearTrunk: 0, stems: 3, leaf: "broad", leafColor: DARK, barkColor: GREY_BARK },
  Buxus: { crown: "shrub", widthRatio: 1.1, density: 1, clearTrunk: 0, stems: 3, leaf: "broad", leafColor: "#3d5a2a", barkColor: GREY_BARK },
  Rosmarinus: { crown: "shrub", widthRatio: 1.3, density: 0.75, clearTrunk: 0, stems: 6, leaf: "narrow", leafColor: BLUE_GREEN, barkColor: BROWN_BARK },
  Lavandula: { crown: "shrub", widthRatio: 1.4, density: 0.7, clearTrunk: 0, stems: 6, leaf: "narrow", leafColor: SILVERY, barkColor: BROWN_BARK },
  // Conifers (the stone pine and the Italian cypress have models of their own)
  Pinus: { crown: "conical", widthRatio: 0.5, density: 0.75, clearTrunk: 0.35, leaf: "needle", leafColor: "#4b6b3a", barkColor: "#7a5240", bark: "patchy" },
  "Pinus halepensis": { crown: "irregular", widthRatio: 0.8, density: 0.55, clearTrunk: 0.4, leaf: "needle", leafColor: "#6c8a4e", barkColor: "#8a7a6a", bark: "fissured" },
  "Pinus nigra": { crown: "ovoid", widthRatio: 0.5, density: 0.85, clearTrunk: 0.35, leaf: "needle", leafColor: DARK, barkColor: "#55504a", bark: "fissured" },
  "Pinus sylvestris": { crown: "irregular", widthRatio: 0.55, density: 0.65, clearTrunk: 0.5, leaf: "needle", leafColor: BLUE_GREEN, barkColor: "#a0603e", bark: "patchy" },
  Cedrus: { crown: "conical", widthRatio: 0.65, density: 0.8, clearTrunk: 0.12, leaf: "needle", leafColor: "#6f8a82", barkColor: "#5a524a", bark: "fissured" },
  Abies: { crown: "conical", widthRatio: 0.4, density: 0.9, clearTrunk: 0.05, leaf: "needle", leafColor: "#2f4a30", barkColor: GREY_BARK },
  Picea: { crown: "conical", widthRatio: 0.4, density: 0.9, clearTrunk: 0.05, leaf: "needle", leafColor: "#34503a", barkColor: "#6a5040" },
  Larix: { crown: "conical", widthRatio: 0.4, density: 0.55, clearTrunk: 0.15, leaf: "needle", leafColor: "#8fb060", barkColor: BROWN_BARK, bark: "fissured" },
  Cupressus: { crown: "conical", widthRatio: 0.4, density: 0.9, clearTrunk: 0.05, leaf: "scale", leafColor: BLUE_GREEN, barkColor: "#6b5a4c", bark: "fissured" },
  Juniperus: { crown: "conical", widthRatio: 0.4, density: 0.85, clearTrunk: 0.03, leaf: "scale", leafColor: "#5f7a58", barkColor: "#7a5a46", bark: "fissured" },
  Thuja: { crown: "conical", widthRatio: 0.38, density: 0.95, clearTrunk: 0.02, leaf: "scale", leafColor: "#5f8a3e", barkColor: "#7a5a46", bark: "fissured" },
  Taxus: { crown: "ovoid", widthRatio: 0.6, density: 0.95, clearTrunk: 0.05, stems: 2, leaf: "needle", leafColor: "#253d25", barkColor: "#8a4a3a", bark: "patchy" },
  Sequoia: { crown: "conical", widthRatio: 0.3, density: 0.8, clearTrunk: 0.2, leaf: "needle", leafColor: DARK, barkColor: "#8a4a32", bark: "fissured" },
};

/** By form, for any species without a card. */
const BY_FORM: Record<string, Card> = {
  columnar: { crown: "columnar", widthRatio: 0.25, density: 0.85, clearTrunk: 0.05 },
  conical: { crown: "conical", widthRatio: 0.45, density: 0.85, clearTrunk: 0.1, leaf: "needle" },
  round: { crown: "round", widthRatio: 0.8, density: 0.75, clearTrunk: 0.25 },
  umbrella: { crown: "umbrella", widthRatio: 1, density: 0.7, clearTrunk: 0.5 },
  shrub: { crown: "shrub", widthRatio: 1.1, density: 0.85, clearTrunk: 0, stems: 4 },
  vine: { crown: "shrub", widthRatio: 0.6, density: 0.7, clearTrunk: 0.3 },
};

/** The AI's specimen (nulls for what it could not judge) as a Specimen: values clamped, colours kept only as #rrggbb. */
export function cleanSpecimen(raw: unknown): Specimen | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const num = (k: string, lo: number, hi: number) => { const v = o[k]; return typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined; };
  const hex = (k: string) => { const v = o[k]; return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : undefined; };
  const out: Specimen = {};
  if (typeof o["crown"] === "string" && CROWN_KINDS.includes(o["crown"] as CrownKind)) out.crown = o["crown"] as CrownKind;
  if (typeof o["leaf"] === "string" && LEAF_KINDS.includes(o["leaf"] as LeafKind)) out.leaf = o["leaf"] as LeafKind;
  const w = num("widthRatio", 0.1, 2); if (w !== undefined) out.widthRatio = w;
  const d = num("density", 0, 1); if (d !== undefined) out.density = d;
  const c = num("clearTrunk", 0, 0.9); if (c !== undefined) out.clearTrunk = c;
  const st = num("stems", 1, 8); if (st !== undefined) out.stems = Math.round(st);
  const l = num("leanDeg", -30, 30); if (l !== undefined) out.leanDeg = l;
  const lc = hex("leafColor"); if (lc) out.leafColor = lc;
  const bc = hex("barkColor"); if (bc) out.barkColor = bc;
  return Object.keys(out).length ? out : null;
}

/** The genus of a scientific name ("Quercus ilex" → "Quercus"), first letter upper case. */
export function genusOf(scientificName: string | undefined | null): string {
  const g = (scientificName ?? "").trim().split(/\s+/)[0] ?? "";
  return g ? g[0]!.toUpperCase() + g.slice(1).toLowerCase() : "";
}
/** "Genus species" with the usual capitals, hybrid signs and authors dropped ("platanus × hispanica Mill." → "Platanus hispanica"). */
function binomial(scientificName: string | undefined | null): string {
  const w = (scientificName ?? "").trim().split(/\s+/).filter((t) => t !== "×" && t.toLowerCase() !== "x");
  return w.length >= 2 ? `${genusOf(w[0])} ${w[1]!.toLowerCase()}` : genusOf(w[0]);
}

export type CustomModel = "stonePine" | "cypress" | "olive" | "linden";
/** The plants built by models of their own (views/ar-pine, views/ar-cypress, views/ar-olive, views/ar-linden). */
export function customModel(scientificName: string | undefined | null, form?: string): CustomModel | null {
  const genus = genusOf(scientificName), name = binomial(scientificName);
  if (genus === "Pinus" && (form === "umbrella" || name === "Pinus pinea")) return "stonePine";
  if (genus === "Cupressus" && (form === "columnar" || name === "Cupressus sempervirens")) return "cypress";
  if (genus === "Olea") return "olive";
  if (genus === "Tilia") return "linden";
  return null;
}

/** The card of a species, or its genus, or null. */
export function cardOf(scientificName: string | undefined | null): Card | null {
  return CARDS[binomial(scientificName)] ?? CARDS[genusOf(scientificName)] ?? null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Mixes two #rrggbb colours (t of b). */
export function mixHex(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(p(a, i) * (1 - t) + p(b, i) * t).toString(16).padStart(2, "0")).join("");
}

/**
 * The shape to build: the specimen's own crown, width, density, bare trunk, stems and lean where the AI judged them;
 * the card's leaf kind and colours (a photo's colours depend on the light, so the specimen's only tint the card's by a
 * third); the form for the rest.
 */
export function shapeFor(scientificName: string | undefined | null, form: string | undefined, evergreen = true, specimen?: Specimen | null): TreeShape {
  const card = cardOf(scientificName) ?? {};
  const byForm = BY_FORM[form ?? "round"] ?? BY_FORM["round"]!;
  const s = specimen ?? {};
  const pick = <K extends keyof TreeShape>(k: K, fallback: TreeShape[K]): TreeShape[K] => (s as Partial<TreeShape>)[k] ?? card[k] ?? byForm[k] ?? fallback;
  const crown = s.crown && CROWN_KINDS.includes(s.crown) ? s.crown : card.crown ?? byForm.crown ?? "round";
  const baseLeaf = card.leafColor ?? (evergreen ? DARK : MID);
  const leafColor = s.leafColor && HEX.test(s.leafColor) ? mixHex(baseLeaf, s.leafColor, 1 / 3) : baseLeaf;
  const baseBark = card.barkColor ?? GREY_BARK;
  const barkColor = s.barkColor && HEX.test(s.barkColor) ? mixHex(baseBark, s.barkColor, 1 / 3) : baseBark;
  const leaf = card.leaf ?? (s.leaf && LEAF_KINDS.includes(s.leaf) ? s.leaf : byForm.leaf ?? "broad");
  return {
    crown,
    widthRatio: clamp(pick("widthRatio", 0.8), 0.15, 1.6),
    density: clamp(pick("density", 0.75), 0.2, 1),
    clearTrunk: crown === "shrub" ? clamp(s.clearTrunk ?? 0, 0, 0.15) : clamp(pick("clearTrunk", 0.25), 0, 0.75),
    stems: Math.round(clamp(pick("stems", crown === "shrub" ? 4 : 1), 1, 8)),
    leanDeg: clamp(pick("leanDeg", 0), -20, 20),
    leaf,
    leafColor,
    barkColor,
    bark: card.bark ?? "plain",
  };
}

/** The crown's half-width at f (0 at its foot, 1 at its top), 0…1, by outline. */
export function crownRadius(crown: CrownKind, f: number): number {
  if (f < 0 || f > 1) return 0;
  switch (crown) {
    case "columnar": return Math.min(1, 0.45 + 0.55 * Math.sqrt(f / 0.28)) * Math.pow(1 - f, 0.8) / Math.pow(0.72, 0.8);
    case "conical": return Math.min(1, 0.55 + 0.45 * (f / 0.12)) * Math.pow(1 - f, 0.95) / Math.pow(0.88, 0.95);
    case "ovoid": return Math.sqrt(Math.max(0, 1 - ((f - 0.42) / (f < 0.42 ? 0.5 : 0.58)) ** 2));
    case "round": case "weeping": case "irregular": case "shrub": return Math.sqrt(Math.max(0, 1 - (2 * f - 1) ** 2)) * (f < 0.5 ? 0.85 + 0.15 * f * 2 : 1);
    case "spreading": return Math.sqrt(Math.max(0, 1 - ((f - 0.4) / (f < 0.4 ? 0.48 : 0.6)) ** 2));
    case "umbrella": return Math.sqrt(Math.max(0, 1 - Math.pow(f, 2.2))) * (f < 0.12 ? 0.75 + 2 * f : 1);
    case "vase": return f < 0.85 ? 0.45 + 0.55 * Math.pow(f / 0.85, 0.7) : Math.sqrt(Math.max(0, 1 - ((f - 0.85) / 0.15) ** 2));
  }
}

/** How much of the plant's height the crown takes, by outline (a spreading or umbrella crown is low and wide). */
export function crownDepth(crown: CrownKind, clearTrunk: number): number {
  const rest = 1 - clearTrunk;
  if (crown === "umbrella") return Math.min(rest, 0.32);
  if (crown === "spreading") return Math.min(rest, 0.6);
  return rest;
}
