import { describe, expect, it } from "vitest";
import { urbanSummary, vineyardSummary } from "@/models/history-summary";
import type { LabState } from "@/models/lab-store";

const loc = { label: "x", lat: 0, lng: 0 };
const zone = { temperature: 1, moisture: 1, wind: 1, rain: false };
describe("history summary", () => {
  it("describes the piazza", () => {
    expect(urbanSummary({ trees: 8, permeable: 30, shade: 20, location: loc, treeCells: null, permeableCells: null, shadeCells: null })).toBe("Alberi 8 · prato 30% · ombra 20%");
  });
  it("describes the chosen vineyard zone", () => {
    const v: LabState["vineyard"] = { zones: [zone, { ...zone, irrigation: 4, shade: 30, windbreak: 10 }], phase: "Invaiatura", selected: 1, allZones: false, location: loc };
    expect(vineyardSummary(v)).toBe("Zona 2 · irrigazione +4% · ombra 30% · frangivento 10%");
  });
  it("averages all zones", () => {
    const v: LabState["vineyard"] = { zones: [{ ...zone, shade: 10 }, { ...zone, shade: 30 }], phase: "Invaiatura", selected: 0, allZones: true, location: loc };
    expect(vineyardSummary(v)).toContain("Tutte le zone");
    expect(vineyardSummary(v)).toContain("ombra 20%");
  });
});
