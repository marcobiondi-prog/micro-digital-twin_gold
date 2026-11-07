import { describe, expect, it } from "vitest";
import { applyVineyardScenario, closestVineyardScenario, updateVineyardControl, vineyardControlValue } from "../models/vineyard-controls";

const zones = [34, 36, 38].map((temperature) => ({ temperature, moisture: 55, wind: 8, rain: false }));
describe("Vineyard slider consistency", () => {
  it("keeps Budget Sostenuto’s half degree in single-zone and average controls", () => {
    const result = applyVineyardScenario(zones, 15, 2.5, null);
    expect(vineyardControlValue(result, 2, "temperature")).toBe(35.5);
    expect(vineyardControlValue(result, null, "temperature")).toBe(33.5);
  });
  it("keeps scenario moisture within the slider limit", () => {
    expect(applyVineyardScenario(zones, 15, 2.5, null).map((zone) => zone.moisture)).toEqual([60, 60, 60]);
  });
  it("never cools below the slider minimum", () => {
    expect(applyVineyardScenario([{ temperature: 1, moisture: 20, wind: 5, rain: false }], 0, 2.5, null)[0]?.temperature).toBe(0);
  });
  it("reaches the requested mean near the upper bound", () => {
    const result = updateVineyardControl(zones, null, "temperature", 44);
    expect(vineyardControlValue(result, null, "temperature")).toBe(44);
    expect(result.map((zone) => zone.temperature)).toEqual([42.5, 44.5, 45]);
  });
  it("edits only the selected zone with decimal precision", () => {
    expect(updateVineyardControl(zones, 1, "temperature", 20.1).map((zone) => zone.temperature)).toEqual([34, 20.1, 38]);
  });
});
describe("Highlighted vineyard scenario follows the sliders", () => {
  it("highlights Zero Budget when sliders equal the baseline", () => {
    expect(closestVineyardScenario(zones, zones, null)).toBe("zero");
  });
  it("highlights Sostenibile when sliders reach −1°C / +8%", () => {
    expect(closestVineyardScenario(applyVineyardScenario(zones, 8, 1, null), zones, null)).toBe("mvp");
  });
  it("highlights Budget Sostenuto when the selected zone reaches −2.5°C / +15%", () => {
    const base = zones.map((z) => ({ ...z, moisture: 20 }));
    expect(closestVineyardScenario(applyVineyardScenario(base, 15, 2.5, 2), base, 2)).toBe("roadmap");
  });
});
