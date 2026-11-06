import { describe, expect, it } from "vitest";
import { NO_MIX, VINE_LEVELS, applyVineMix, vineCost, vineMixAt, vineMixOf } from "@/models/vine-interventions";

const zones = [{ temperature: 34, moisture: 18, wind: 10, rain: false }];

describe("vine interventions", () => {
  it("walks from no mix through the three levels", () => {
    expect(vineMixAt(0)).toEqual(NO_MIX);
    expect(vineMixAt(1)).toMatchObject({ irrigation: 4, shade: 0, windbreak: 20 });
    expect(vineMixAt(3)).toMatchObject({ irrigation: 16, shade: 80, windbreak: 70 });
    expect(vineMixAt(2.5)).toEqual({ irrigation: 12, shade: 55, windbreak: 55 });
  });
  it("adds water, cools the leaves and calms the wind", () => {
    const [z] = applyVineMix(zones, { irrigation: 10, shade: 100, windbreak: 100 });
    expect(z).toMatchObject({ moisture: 28, temperature: 31, wind: 4 });
  });
  it("prices the mix per hectare on the surface", () => {
    const full = VINE_LEVELS[2]!;
    const c = vineCost(20_000, full);
    expect(c.perHa.lo).toBeCloseTo(0.8 * 3000 + 0.8 * 4000 + 0.7 * 6000);
    expect(c.total.hi).toBeCloseTo(c.perHa.hi * 2);
    expect(vineCost(10_000, NO_MIX).total).toEqual({ lo: 0, hi: 0 });
  });
  it("reads older saves as no interventions", () => {
    expect(vineMixOf({})).toEqual(NO_MIX);
  });
});
