import { describe, expect, it } from "vitest";
import { bedParts, BEDS_3D } from "@/models/area-layout";
import { ringContains, type Ring } from "@/models/place-area";

const lat = 41.56, lng = 14.66, k = 111_320 * Math.cos((lat * Math.PI) / 180);
const box = (w: number, h: number, dx = 0): Ring => [[lat, lng + dx / k], [lat, lng + (dx + w) / k], [lat + h / 111_320, lng + (dx + w) / k], [lat + h / 111_320, lng + dx / k]];
const grass = (c: string) => (BEDS_3D.grass as readonly string[]).includes(c);

describe("aiuole e ciottoli in 3D", () => {
  it("lays soft flat beds wholly inside the patches, each with flower spots", () => {
    const { beds, parts } = bedParts([box(24, 16)]);
    expect(beds.length).toBeGreaterThan(4);
    for (const b of beds) for (const [a, c] of b) expect(ringContains(box(24, 16), a, c)).toBe(true);
    expect(parts.filter((p) => grass(p.color))).toHaveLength(beds.length);
    expect(parts.filter((p) => !grass(p.color)).length).toBeGreaterThanOrEqual(beds.length * 3);
    // Flat: thin slabs just over the ground, no curbs nor blocks.
    expect(parts.every((p) => p.base > 0 && p.height - p.base < 0.1 && p.height < 0.6)).toBe(true);
  });
  it("never draws more than 24 beds, however big the lawn, and is the same every time", () => {
    expect(bedParts([box(200, 150)]).beds.length).toBeLessThanOrEqual(24);
    expect(bedParts([box(30, 20)])).toEqual(bedParts([box(30, 20)]));
  });
  it("spans neighbouring strips and gives a small patch one smaller bed", () => {
    expect(bedParts([box(12, 4), box(12, 4, 12)]).beds.length).toBeGreaterThanOrEqual(2);
    expect(bedParts([box(3, 2)]).beds).toHaveLength(1);
    expect(bedParts([]).parts).toHaveLength(0);
  });
});
