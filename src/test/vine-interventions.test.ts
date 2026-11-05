import { describe, expect, it } from "vitest";
import { NO_MIX, VINE_LEVELS, applyVineMix, vineCost, vineMixAt, vineMixOf } from "@/models/vine-interventions";

const zones = [{ temperature: 34, moisture: 18, wind: 10, rain: false }];

describe("vine interventions", () => {
  it("walks from no mix through the three levels", () => {
    expect(vineMixAt(0)).toEqual(NO_MIX);
    expect(vineMixAt(1)).toMatchObject({ irrigation: 4, pestAnimal: 0, pestPlant: 20 });
    expect(vineMixAt(3)).toMatchObject({ irrigation: 16, pestAnimal: 80, pestPlant: 80 });
    expect(vineMixAt(2.5)).toEqual({ irrigation: 12, pestAnimal: 60, pestPlant: 65 });
  });
  it("adds water and takes the pests off", () => {
    const [z] = applyVineMix([{ ...zones[0]!, animalPests: 40, plantPests: 60 }], { irrigation: 10, pestAnimal: 100, pestPlant: 50 });
    expect(z).toMatchObject({ moisture: 28, temperature: 34, wind: 10 });
    expect(z!.animalPests).toBeCloseTo(40 * 0.15);
    expect(z!.plantPests).toBeCloseTo(60 * (1 - 0.425));
  });
  it("prices the mix per hectare on the surface", () => {
    const full = VINE_LEVELS[2]!;
    const c = vineCost(20_000, full);
    expect(c.perHa.lo).toBeCloseTo(0.8 * 3000 + 0.8 * 400 + 0.8 * 500);
    expect(c.total.hi).toBeCloseTo(c.perHa.hi * 2);
    expect(vineCost(10_000, NO_MIX).total).toEqual({ lo: 0, hi: 0 });
  });
  it("reads older saves as no interventions", () => {
    expect(vineMixOf({})).toEqual(NO_MIX);
  });
});
