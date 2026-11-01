import { describe, expect, it } from "vitest";
import { piazzaLayout } from "@/models/area-layout";
import { leversOfZones, type DrawnArea } from "@/models/drawn-area";
import { ringAreaM2, ringContains, type Ring } from "@/models/place-area";

const M = 111_195, k = M * Math.cos((41.56 * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [41.56 + y / M, 14.66 + x / k];
const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)];
const area = rect(0, 0, 60, 40);
const lawnZone = rect(2, 2, 22, 18), shadeZone = rect(40, 2, 58, 14), treeZone = rect(10, 24, 50, 38);
const zones = [{ kind: "prato", ring: lawnZone }, { kind: "ombra", ring: shadeZone }, { kind: "alberi", ring: treeZone }];

describe("Solo quello disegnato", () => {
  it("draws only the zones, nothing around them", () => {
    const l = piazzaLayout(area, 6, 90, 90, { onlyDrawn: true }, zones)!;
    expect(l.patches.every((p) => p.exact)).toBe(true);
    expect(l.lawnM2).toBe(Math.round(ringAreaM2(lawnZone)));
    expect(l.shadeM2).toBe(Math.round(ringAreaM2(shadeZone)));
    for (const t of l.trees) expect(ringContains(treeZone, t[0], t[1])).toBe(true);
  });
  it("draws no trees without a trees zone", () => {
    expect(piazzaLayout(area, 6, 0, 0, { onlyDrawn: true }, [zones[0]!])!.trees).toHaveLength(0);
  });
  it("sets the levers from the zones", () => {
    const a: DrawnArea = { lat: 41.56, lng: 14.66, ring: area, zones: zones.map((z, i) => ({ id: `z${i}`, kind: z.kind as "prato", ring: z.ring })) };
    const l = leversOfZones(a);
    expect(l.permeable).toBe(Math.round((100 * 320) / 2400));
    expect(l.shade).toBe(Math.round((100 * 216) / 2400));
    expect(l.trees).toBe(Math.round(560 / 60));
  });
});
