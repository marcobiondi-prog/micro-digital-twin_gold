import { describe, expect, it } from "vitest";
import { NO_MIX, applyVineMix, vineMixAt, vineMixOf } from "@/models/vine-interventions";

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
  it("reads older saves as no interventions", () => {
    expect(vineMixOf({})).toEqual(NO_MIX);
  });
});
