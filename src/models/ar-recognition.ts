import { z } from "zod";
import { plantPhotoBounds } from "@/models/ar-plant-photo";

export const groundSurveySchema = z.object({
  consistency: z.string(),
  heatNote: z.string(),
  regions: z.array(z.object({
    label: z.string(),
    box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    exposure: z.enum(["ombra", "mista", "esposta", "incerta"]),
    plantable: z.boolean(),
  }).strict()),
}).strict();
export type GroundSurvey = z.infer<typeof groundSurveySchema>;

/** Image coordinates only: neither a metric survey nor a temperature measurement. */
export function groundRegionAt(survey: GroundSurvey, x: number, y: number) {
  if (y < 0.48 || x < 0 || x > 1 || y > 1) return null;
  return survey.regions.find(({ box }) => x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) ?? null;
}

export const arRecognitionSchema = z.object({
  identification: z.object({
    level: z.enum(["species", "genus", "uncertain"]),
    leafVisible: z.boolean(), evidence: z.string(),
  }).strict().nullable(),
  survey: groundSurveySchema.nullable(),
  found: z.boolean(),
  outline: z.array(z.object({ x: z.number(), y: z.number() }).strict()).nullable(),
  label: z.string(),
  type: z.enum(["tree", "vine", "object"]),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
  plant: z.object({
    scientificName: z.string(), commonName: z.string(),
    form: z.enum(["columnar", "conical", "round", "umbrella", "vine", "shrub"]),
    heightM: z.number(), crownM: z.number(), evergreen: z.boolean(), density: z.number(),
    /** Up to two look-alike species the model also considered, tried in order when the first name fails the catalogue. */
    alternatives: z.array(z.object({ scientificName: z.string(), commonName: z.string() }).strict()).max(3).nullable(),
  }).nullable(),
  soil: z.object({
    kind: z.enum(["artificiale", "argilloso", "sabbioso", "limoso", "franco", "ghiaioso", "roccioso", "prato", "pacciamato"]),
    label: z.string(), permeability: z.enum(["bassa", "media", "alta"]),
    plantable: z.boolean(), note: z.string(),
  }).nullable(),
}).strict();

/** A reply from the plain-JSON fallback (or an older model) may omit plant.alternatives: read it as none. */
export function withPlantAlternatives(raw: unknown): unknown {
  const plant = (raw as { plant?: Record<string, unknown> | null } | null)?.plant;
  if (plant && typeof plant === "object" && !("alternatives" in plant)) plant["alternatives"] = null;
  return raw;
}

export function estimateCooling(crownM: number, density: number, evergreen: boolean) {
  const shadeM2 = Math.PI * (crownM / 2) ** 2;
  const deltaT = Math.min(3, shadeM2 * 0.035 * (0.4 + density) * (evergreen ? 1.2 : 1));
  // Thousandths, so small plants (a sansevieria, a pot) keep a visible per-specimen effect instead of 0.
  return { deltaT: Math.round(deltaT * 1000) / 1000, shadeM2: Math.round(shadeM2) };
}

/** A new analysis invalidates the previous planting template, not existing placements. */
export function recognitionCanPlace(result: z.infer<typeof arRecognitionSchema>) {
  return result.found && result.type !== "object" && result.box !== null && result.outline !== null && plantPhotoBounds(result.outline) !== null;
}
/** A catalogue match verifies taxonomy, not visual identification. */
export function canEstimateRecognizedPlant(result: z.infer<typeof arRecognitionSchema>) {
  return result.found && result.type !== "object" && result.plant !== null && result.identification !== null && result.identification.level !== "uncertain";
}
