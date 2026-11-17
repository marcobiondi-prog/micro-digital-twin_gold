/**
 * How a recognised plant is drawn in the AR: from its genus, the procedural tree's base shape, bark, leaves and colours
 * (EZ-Tree has four barks — birch, oak, pine, willow — and four leaves — ash, aspen, oak, pine), so a plane tree, a
 * lime, an olive, a birch or a cypress no longer all come out as the same oak. Unknown genera fall back on the plant's
 * form. Pure data: views/ar-tree applies it.
 */
export type TreeBase = "Oak" | "Aspen" | "Ash" | "Pine" | "Bush";
export type Bark = "birch" | "oak" | "pine" | "willow";
export type Leaf = "ash" | "aspen" | "oak" | "pine";
export type PlantProfile = {
  base: TreeBase;
  bark?: Bark;
  leaves?: Leaf;
  /** Leaf and bark tints (0xRRGGBB) laid over the textures. */
  leafTint?: number;
  barkTint?: number;
  /** Crown squeezed sideways (cypress, poplar) or widened (umbrella pine), width / natural width: used only when the
   * species gives no crown size of its own (the recognised crown already says how wide it is). */
  squeeze?: number;
  /** Share of the preset's leaves kept: below 1 for a light crown, above 1 for a dense one (cypress, olive). */
  leafShare?: number;
  /** Leaves drawn bigger (above 1) or smaller than the preset's. */
  leafSize?: number;
  /** A model built on purpose instead of the procedural tree (views/ar-pine for the stone pine, views/ar-cypress
   * for the Italian cypress, views/ar-olive for the olive). */
  custom?: "stonePine" | "cypress" | "olive";
};

type Form = "columnar" | "conical" | "round" | "umbrella" | "vine" | "shrub";

const DARK_EVERGREEN = 0x5f8a52;
const SILVER = 0xb8c4a8;

/** By genus (the first word of the scientific name). */
const GENERA: Record<string, PlantProfile> = {
  // Conifers
  Pinus: { base: "Pine", bark: "pine", leaves: "pine" },
  Abies: { base: "Pine", bark: "pine", leaves: "pine", leafTint: DARK_EVERGREEN },
  Picea: { base: "Pine", bark: "pine", leaves: "pine", leafTint: DARK_EVERGREEN },
  Cedrus: { base: "Pine", bark: "pine", leaves: "pine", leafTint: 0x9fb6a0, squeeze: 1.3 },
  Larix: { base: "Pine", bark: "pine", leaves: "pine", leafTint: 0xc8e0a0 },
  Taxus: { base: "Pine", bark: "willow", leaves: "pine", leafTint: DARK_EVERGREEN, squeeze: 0.8 },
  Cupressus: { base: "Pine", bark: "willow", leaves: "pine", leafTint: DARK_EVERGREEN, squeeze: 0.35, leafShare: 1.8 },
  Juniperus: { base: "Pine", bark: "willow", leaves: "pine", leafTint: 0x7f9a74, squeeze: 0.45, leafShare: 1.5 },
  Thuja: { base: "Pine", bark: "willow", leaves: "pine", leafTint: 0x8fae6a, squeeze: 0.5, leafShare: 1.5 },
  Chamaecyparis: { base: "Pine", bark: "willow", leaves: "pine", leafTint: DARK_EVERGREEN, squeeze: 0.5, leafShare: 1.5 },
  Sequoia: { base: "Pine", bark: "willow", leaves: "pine", leafTint: DARK_EVERGREEN, squeeze: 0.6 },
  // Light, white or peeling barks
  Betula: { base: "Aspen", bark: "birch", leaves: "aspen", leafShare: 1.3 },
  Platanus: { base: "Oak", bark: "birch", leaves: "aspen", barkTint: 0xd8cbb0, leafShare: 1.2 },
  // Poplars and willows
  Populus: { base: "Aspen", bark: "willow", leaves: "aspen", squeeze: 0.7 },
  Salix: { base: "Aspen", bark: "willow", leaves: "ash", leafTint: 0xc7dca0 },
  // Oaks: deciduous, or evergreen (holm, cork)
  Quercus: { base: "Oak", bark: "oak", leaves: "oak" },
  Fagus: { base: "Oak", bark: "birch", leaves: "aspen", barkTint: 0xa9a59b, leafShare: 1.4 },
  Castanea: { base: "Oak", bark: "oak", leaves: "ash" },
  // Pinnate leaves
  Fraxinus: { base: "Ash", bark: "oak", leaves: "ash" },
  Robinia: { base: "Ash", bark: "oak", leaves: "ash", leafTint: 0xd0e6a8 },
  Styphnolobium: { base: "Ash", bark: "oak", leaves: "ash" },
  Sophora: { base: "Ash", bark: "oak", leaves: "ash" },
  Gleditsia: { base: "Ash", bark: "oak", leaves: "ash", leafTint: 0xd0e6a8 },
  Ailanthus: { base: "Ash", bark: "birch", leaves: "ash", barkTint: 0xb0a898 },
  Juglans: { base: "Ash", bark: "oak", leaves: "ash", barkTint: 0xc0b8a8 },
  Sorbus: { base: "Ash", bark: "oak", leaves: "ash" },
  // Broad round crowns
  Tilia: { base: "Oak", bark: "oak", leaves: "aspen", leafShare: 1.5 },
  Acer: { base: "Oak", bark: "oak", leaves: "aspen", leafShare: 1.4 },
  Celtis: { base: "Oak", bark: "birch", leaves: "aspen", barkTint: 0xa8a49c, leafShare: 1.4 },
  Ulmus: { base: "Oak", bark: "oak", leaves: "aspen", leafShare: 1.4 },
  Aesculus: { base: "Oak", bark: "oak", leaves: "ash", leafTint: 0x9fc58a },
  Carpinus: { base: "Oak", bark: "birch", leaves: "aspen", barkTint: 0x9c9a92, leafShare: 1.4 },
  Morus: { base: "Oak", bark: "oak", leaves: "aspen", leafShare: 1.4 },
  Prunus: { base: "Oak", bark: "willow", leaves: "aspen", squeeze: 0.8 },
  Malus: { base: "Oak", bark: "oak", leaves: "aspen", squeeze: 0.8 },
  Pyrus: { base: "Oak", bark: "oak", leaves: "aspen", squeeze: 0.75 },
  Lagerstroemia: { base: "Aspen", bark: "birch", leaves: "aspen", barkTint: 0xc8b8a0 },
  // Mediterranean evergreens
  Olea: { base: "Oak", bark: "oak", leaves: "ash", leafTint: SILVER, barkTint: 0x9a9488, leafShare: 2.4, leafSize: 1.3, custom: "olive" },
  Laurus: { base: "Oak", bark: "willow", leaves: "aspen", leafTint: DARK_EVERGREEN, squeeze: 0.75 },
  Ilex: { base: "Oak", bark: "willow", leaves: "aspen", leafTint: DARK_EVERGREEN },
  Magnolia: { base: "Oak", bark: "willow", leaves: "aspen", leafTint: DARK_EVERGREEN },
  Ceratonia: { base: "Oak", bark: "oak", leaves: "ash", leafTint: DARK_EVERGREEN },
  Eucalyptus: { base: "Aspen", bark: "birch", leaves: "ash", leafTint: SILVER, barkTint: 0xd0c8b8 },
  Citrus: { base: "Bush", bark: "willow", leaves: "aspen", leafTint: DARK_EVERGREEN },
  Arbutus: { base: "Oak", bark: "willow", leaves: "aspen", leafTint: DARK_EVERGREEN, barkTint: 0xb0705a },
};

/** The genus of a scientific name ("Quercus ilex" → "Quercus"), first letter upper case. */
export function genusOf(scientificName: string | undefined | null): string {
  const g = (scientificName ?? "").trim().split(/\s+/)[0] ?? "";
  return g ? g[0]!.toUpperCase() + g.slice(1).toLowerCase() : "";
}

/** Evergreen oaks keep dark leaves; the rest of Quercus is the plain oak. */
const EVERGREEN_OAKS = new Set(["ilex", "suber", "coccifera", "virginiana"]);

export function plantProfile(scientificName: string | undefined | null, form: Form | undefined, evergreen?: boolean): PlantProfile {
  const genus = genusOf(scientificName);
  const known = GENERA[genus];
  if (known) {
    if (genus === "Quercus" && EVERGREEN_OAKS.has((scientificName ?? "").trim().split(/\s+/)[1]?.toLowerCase() ?? "")) {
      return { ...known, leafTint: DARK_EVERGREEN };
    }
    // The Italian cypress (Cupressus sempervirens, or a cypress read as columnar) has its own model: a dense flame.
    if (genus === "Cupressus" && (form === "columnar" || /\bsempervirens\b/i.test(scientificName ?? ""))) return { ...known, custom: "cypress" };
    // The stone pine (Pinus pinea, or a pine read as umbrella-shaped) has its own model: tall bare trunk, flat crown.
    if (genus === "Pinus" && (form === "umbrella" || /\bpinea\b/i.test(scientificName ?? ""))) return { base: "Ash", bark: "pine", leaves: "pine", squeeze: 1.4, custom: "stonePine" };
    return known;
  }
  // Unknown genus: by form, as before, a darker green for evergreens.
  const tint = evergreen ? { leafTint: DARK_EVERGREEN } : {};
  if (form === "conical") return { base: "Pine" };
  if (form === "columnar") return { base: "Pine", squeeze: 0.4 };
  if (form === "umbrella") return { base: "Ash", ...tint };
  if (form === "shrub") return { base: "Bush", ...tint };
  return evergreen ? { base: "Oak", ...tint } : { base: "Aspen" };
}

/** The EZ-Tree preset name for a profile and a height. */
export function presetName(base: TreeBase, heightM: number, seed = 0): string {
  if (base === "Bush") return `Bush ${1 + (Math.abs(Math.round(seed)) % 3)}`;
  const size = heightM >= 14 ? "Large" : heightM >= 6 ? "Medium" : "Small";
  return `${base} ${size}`;
}
