import { describe, expect, it } from "vitest";
import { vineAdvice, vineWater, waterText, forecastNeed } from "@/models/vine-advice";

const mix = { irrigation: 0, shade: 0, windbreak: 0 };
describe("vine advice", () => {
  it("starts from the zone that needs it most and names what to do", () => {
    const a = vineAdvice([
      { need: 20, moisture: 30, temp: 25, wind: 5, rain: false, mix },
      { need: 70, moisture: 15, temp: 37, wind: 20, rain: false, mix },
    ], "Invaiatura");
    expect(a[0]!.text).toContain("Zona 2");
    expect(a.filter((x) => x.text.includes("frangivento")).length).toBe(1);
    expect(a[0]!.tone).toBe("urgent");
    expect(a.some((x) => x.text.includes("irriga"))).toBe(true);
    expect(a.some((x) => x.text.includes("teli"))).toBe(true);
    expect(a.some((x) => x.text.includes("frangivento"))).toBe(true);
    expect(a.at(-1)!.text).toContain("Invaiatura");
  });
  it("says nothing is needed when every zone is fine", () => {
    expect(vineAdvice([{ need: 10, moisture: 32, temp: 22, wind: 4, rain: false, mix }], "Fioritura")[0]!.tone).toBe("ok");
  });
});

describe("vine water", () => {
  it("counts the daily use, the refill and what the irrigation gives", () => {
    const w = vineWater({ moisture: 20, temp: 30, rain: false, irrigation: 8 }, "Invaiatura", 1000);
    expect(w.perDay).toBeCloseTo(0.13 * 24 * 0.7 * 1000, 0);
    expect(w.refill).toBe(10 * 5 * 1000);
    expect(w.given).toBe(8 * 5 * 1000);
    expect(vineWater({ moisture: 20, temp: 30, rain: true, irrigation: 0 }, "Invaiatura", 1000).perDay).toBe(0);
    expect(waterText(850)).toBe("850 l");
    expect(waterText(12_400)).toBe("12,4 m³");
  });
});

describe("forecast need", () => {
  it("reads hotter, windier days as more need and rain as less", () => {
    const zone = { temperature: 28, moisture: 22, wind: 8, rain: false, irrigation: 0, shade: 0, windbreak: 0 };
    const vine = { zones: [zone, zone, zone], phase: "Invaiatura" as const, selected: 0, allZones: true, location: { label: "x", lat: 41.6, lng: 14.6 } };
    const [mild, hot, wet] = forecastNeed(vine, [
      { date: "2026-07-01", tmax: 24, wind: 5, rain: 0 },
      { date: "2026-07-02", tmax: 36, wind: 25, rain: 0 },
      { date: "2026-07-03", tmax: 24, wind: 5, rain: 10 },
    ]);
    expect(hot!.need).toBeGreaterThan(mild!.need);
    expect(wet!.need).toBeLessThanOrEqual(mild!.need);
  });
});
