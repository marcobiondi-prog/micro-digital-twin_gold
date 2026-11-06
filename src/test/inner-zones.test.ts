import { describe, expect, it } from "vitest";
import { drawnM2, freeM2, lotsOf, pinsM2, usableM2, zoneName, zoneSummaryRows, type DrawnArea, type SubArea } from "@/models/drawn-area";
import { piazzaLayout, vineLayout } from "@/models/area-layout";
import { ringContains } from "@/models/place-area";
import { scenarioGeoJson } from "@/models/scenario-export";
import { getLab } from "@/models/lab-store";

// An 80 m × 60 m area and, inside it, a 20 m × 20 m square at its west side.
const lat = 41.55837, lng = 14.659698, mLat = 1 / 111_195, mLng = 1 / (111_195 * Math.cos((lat * Math.PI) / 180));
const rect = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [[lat + y0 * mLat, lng + x0 * mLng], [lat + y0 * mLat, lng + x1 * mLng], [lat + y1 * mLat, lng + x1 * mLng], [lat + y1 * mLat, lng + x0 * mLng]];
const ring = rect(0, 0, 80, 60), west = rect(5, 20, 25, 40), east = rect(55, 20, 75, 40);
const area = (zones: SubArea[]): DrawnArea => ({ lat, lng, ring, zones });

describe("zones inside the area", () => {
  it("takes the free zones off the surface used for costs", () => {
    const a = area([{ id: "f", kind: "libera", ring: west }]);
    expect(freeM2(a)).toBeGreaterThan(390);
    expect(usableM2(a)).toBe(pinsM2(ring) - freeM2(a));
    expect(drawnM2(a, { lat, lng })).toBe(usableM2(a));
  });
  it("gives each lot its surface and share of the cost, named in order", () => {
    const a = area([{ id: "a", kind: "lotto", ring: west, name: "Lotto A" }, { id: "b", kind: "lotto", ring: east, name: "Lotto B" }]);
    const lots = lotsOf(a);
    expect(lots.map((l) => l.name)).toEqual(["Lotto A", "Lotto B"]);
    expect(lots[0]!.share).toBeCloseTo(400 / 4800, 2);
    expect(zoneName(a, "lotto")).toBe("Lotto C");
    const rows = zoneSummaryRows(a, { lat, lng }, { lo: 48_000, hi: 96_000 }, false, (c) => `${Math.round(c.lo)}-${Math.round(c.hi)}`);
    expect(rows[0]![0]).toBe("Lotto A");
    expect(rows[0]![1]).toMatch(/^400 m² · 4\d{3}-\d+$/);
  });
  it("lays nothing in a free zone, the lawn in its zone and the trees in theirs", () => {
    const free = piazzaLayout(ring, 10, 30, 0, {}, [{ kind: "libera", ring: west }])!;
    expect(free.trees.some(([a, b]) => ringContains(west, a, b))).toBe(false);
    expect(free.patches.some((p) => p.ring.every(([a, b]) => ringContains(west, a, b)))).toBe(false);
    const lawn = piazzaLayout(ring, 0, 30, 0, {}, [{ kind: "prato", ring: east }])!;
    const centre: [number, number] = [lat + 30 * mLat, lng + 65 * mLng];
    expect(lawn.patches.some((p) => p.kind === "lawn" && ringContains(p.ring, centre[0], centre[1]))).toBe(true);
    const trees = piazzaLayout(ring, 6, 0, 0, {}, [{ kind: "alberi", ring: east }])!;
    expect(trees.trees).toHaveLength(6);
    expect(trees.trees.every(([a, b]) => ringContains(east, a, b))).toBe(true);
  });
  it("keeps the vineyard's zones off a free zone", () => {
    const v = vineLayout(ring, [{ irrigation: 0, shade: 0, windbreak: 0 }], {}, [{ kind: "libera", ring: west }])!;
    const centre: [number, number] = [lat + 30 * mLat, lng + 15 * mLng];
    expect(v.patches.some((p) => ringContains(p.ring, centre[0], centre[1]))).toBe(false);
  });
  it("exports every zone as a polygon", () => {
    const urban = { ...getLab().urban, location: { label: "Piazza", lat, lng }, area: area([{ id: "f", kind: "libera", ring: west }, { id: "a", kind: "lotto", ring: east, name: "Lotto A" }]) };
    const geo = scenarioGeoJson({ ...getLab(), urban }, "urban", "2026-10-30T12:00:00Z");
    const zones = geo.features.filter((f) => f.properties["data_type"] === "drawn_zone");
    expect(zones.map((z) => z.properties["zone_kind"])).toEqual(["libera", "lotto"]);
  });
});
