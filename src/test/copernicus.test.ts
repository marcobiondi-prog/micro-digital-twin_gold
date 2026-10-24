import { describe, expect, it } from "vitest";
import { bboxAround, latestValue, ndviLabel, ndviRequest, satelliteContext, satelliteLine, satellitePrompt, surfaceTempRequest } from "@/models/copernicus";
import { captureSummaryLines } from "@/models/ar-capture-summary";

describe("Copernicus requests", () => {
  it("builds a box of the requested half-size around the point", () => {
    const [minLng, minLat, maxLng, maxLat] = bboxAround(41.55837, 14.659698, 250);
    expect((maxLat - minLat) * 111_320).toBeCloseTo(500, 0);
    expect((maxLng - minLng) * 111_320 * Math.cos(41.55837 * Math.PI / 180)).toBeCloseTo(500, 0);
    expect((minLat + maxLat) / 2).toBeCloseTo(41.55837, 5);
  });
  it("asks Sentinel-2 L2A for 60 days and daytime Sentinel-3 SLSTR for 14 days", () => {
    const now = new Date("2026-10-22T10:00:00Z");
    const ndvi = ndviRequest(41.5, 14.6, now), temp = surfaceTempRequest(41.5, 14.6, now);
    expect(ndvi.input.data[0]?.type).toBe("sentinel-2-l2a");
    expect(ndvi.aggregation.timeRange).toEqual({ from: "2026-08-23T10:00:00Z", to: "2026-10-22T10:00:00Z" });
    expect(ndvi.aggregation.evalscript).toContain("SCL");
    expect(temp.input.data[0]).toMatchObject({ type: "sentinel-3-slstr", dataFilter: { orbitDirection: "DESCENDING" } });
    expect(temp.aggregation.timeRange.from).toBe("2026-10-08T10:00:00Z");
  });
});

describe("latestValue", () => {
  const row = (from: string, mean: number | string, sampleCount = 2500, noDataCount = 0) => ({ interval: { from, to: from }, outputs: { ndvi: { bands: { B0: { stats: { mean, sampleCount, noDataCount } } } } } });
  it("returns the newest interval with valid pixels, skipping clouded ones", () => {
    const body = { data: [row("2026-10-01T00:00:00Z", 0.512), row("2026-10-06T00:00:00Z", 0.4), row("2026-10-11T00:00:00Z", "NaN", 2500, 2500)] };
    expect(latestValue(body, "ndvi")).toEqual({ value: 0.4, date: "2026-10-06", pixels: 2500 });
  });
  it("is null when nothing is usable", () => {
    expect(latestValue({ data: [row("2026-10-11T00:00:00Z", 0.3, 100, 100)] }, "ndvi")).toBeNull();
    expect(latestValue(null, "ndvi")).toBeNull();
    expect(latestValue({ data: [row("2026-10-11T00:00:00Z", 0.3)] }, "temp")).toBeNull();
  });
});

describe("ndviLabel", () => {
  it("reads NDVI in plain words", () => {
    expect(ndviLabel(0.05)).toMatch(/asfalto/);
    expect(ndviLabel(0.5)).toBe("Vegetazione buona");
    expect(ndviLabel(0.8)).toMatch(/densa/);
  });
});

describe("AI camera satellite context", () => {
  const reading = { ndvi: { value: 0.42, date: "2026-10-12", pixels: 2500 }, surfaceTemp: { value: 31.4, date: "2026-10-20", pixels: 9 }, errors: [] };
  it("keeps only the values that were read", () => {
    expect(satelliteContext(reading)).toEqual({ ndvi: 0.42, ndviDate: "2026-10-12", surfaceTemp: 31.4, tempDate: "2026-10-20" });
    expect(satelliteContext({ ndvi: null, surfaceTemp: reading.surfaceTemp, errors: [] })).toEqual({ surfaceTemp: 31.4, tempDate: "2026-10-20" });
    expect(satelliteContext({ ndvi: null, surfaceTemp: null, errors: [] })).toBeNull();
  });
  it("writes one caption line and an honest prompt", () => {
    const line = satelliteLine(satelliteContext(reading));
    expect(line).toMatch(/^Satellite · NDVI 0,42 vegetazione moderata \(12 ott\) · superficie 31 °C \(20 ott\)$/);
    const prompt = satellitePrompt(satelliteContext(reading));
    expect(prompt).toContain("NON misure della pianta");
    expect(prompt).toContain("0.42");
    expect(satellitePrompt(null)).toBe("");
  });
  it("adds the satellite line to the photo caption", () => {
    const lines = captureSummaryLines({ commonName: "Leccio", scientificName: "Quercus ilex", level: "Specie probabile", count: 2, cooling: 1.2, shade: 40 }, "Piazza", "Satellite · NDVI 0,42");
    expect(lines.at(-2)).toBe("Satellite · NDVI 0,42");
    expect(captureSummaryLines(null, "Piazza", "Satellite · NDVI 0,42").at(-1)).toBe("Satellite · NDVI 0,42");
  });
});
