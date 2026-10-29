import { describe, expect, it } from "vitest";
import { drawnAreaFor, drawnM2, pinsM2, surfaceSource, surfaceText } from "@/models/drawn-area";
import { piazzaSummary } from "@/models/project-summary";
import { scenarioGeoJson } from "@/models/scenario-export";
import { getLab } from "@/models/lab-store";

// About a 100 m × 50 m rectangle near the Campobasso piazza.
const place = { lat: 41.55837, lng: 14.659698 };
const dLat = 50 / 111_195, dLng = 100 / (111_195 * Math.cos((place.lat * Math.PI) / 180));
const ring: Array<[number, number]> = [[place.lat, place.lng], [place.lat, place.lng + dLng], [place.lat + dLat, place.lng + dLng], [place.lat + dLat, place.lng]];

describe("drawn area", () => {
  it("measures the pins' surface", () => {
    expect(pinsM2(ring)).toBeGreaterThan(4950);
    expect(pinsM2(ring)).toBeLessThan(5050);
    expect(pinsM2(ring.slice(0, 2))).toBe(0);
  });
  it("counts only for the place it was drawn for, with at least three pins", () => {
    expect(drawnAreaFor({ ...place, ring }, place)).not.toBeNull();
    expect(drawnAreaFor({ ...place, ring }, { lat: 41.6, lng: 14.7 })).toBeNull();
    expect(drawnM2({ ...place, ring: ring.slice(0, 2) }, place)).toBeNull();
  });
  it("writes surfaces in plain words", () => {
    expect(surfaceText(5399)).toBe("5.399 m²");
    expect(surfaceText(24_000)).toBe("2,4 ha");
    expect(surfaceSource(10, 20)).toBe("drawn");
    expect(surfaceSource(null, 20)).toBe("measured");
    expect(surfaceSource(null, null)).toBe("reference");
  });
  it("replaces the measured surface in the summary and is exported as a polygon", () => {
    const urban = { ...getLab().urban, location: { label: "Piazza", ...place }, area: { ...place, ring } };
    const sum = piazzaSummary(urban, "estate", null, 8000);
    expect(sum.drawn).toBe(true);
    expect(sum.measured).toBe(false);
    expect(sum.m2).toBe(pinsM2(ring));
    const geo = scenarioGeoJson({ ...getLab(), urban }, "urban", "2026-10-29T12:00:00Z");
    const poly = geo.features.find((f) => f.geometry.type === "Polygon");
    expect(poly?.properties["area_m2"]).toBe(pinsM2(ring));
  });
});
