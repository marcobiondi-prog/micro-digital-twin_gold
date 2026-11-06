import { describe, expect, it } from "vitest";
import { bedParts, BEDS_3D } from "@/models/area-layout";
import { ringContains, type Ring } from "@/models/place-area";

const lat = 41.56, lng = 14.66, k = 111_320 * Math.cos((lat * Math.PI) / 180);
const box = (w: number, h: number, dx = 0): Ring => [[lat, lng + dx / k], [lat, lng + (dx + w) / k], [lat + h / 111_320, lng + (dx + w) / k], [lat + h / 111_320, lng + dx / k]];
const grass = (c: string) => (BEDS_3D.grass as readonly string[]).includes(c);

describe("aiuole e ciottoli in 3D, a quadretti", () => {
  it("lays a grid of square beds wholly inside the patches, chequered in two greens, two flowers each", () => {
    const { beds, parts } = bedParts([box(20, 13)]);
    expect(beds.length).toBeGreaterThanOrEqual(12);
    for (const b of beds) {
      expect(b).toHaveLength(4);
      for (const [a, c] of b) expect(ringContains(box(20, 13), a, c)).toBe(true);
    }
    const greens = parts.filter((p) => grass(p.color));
    expect(greens).toHaveLength(beds.length);
    expect(new Set(greens.map((p) => p.color)).size).toBe(2);
    expect(parts.length).toBe(beds.length * 3);
    expect(parts.every((p) => p.base > 0 && p.height - p.base < 0.1)).toBe(true);
  });
  it("never draws more than 48 squares, however big the lawn, and is the same every time", () => {
    expect(bedParts([box(200, 150)]).beds.length).toBeLessThanOrEqual(48);
    expect(bedParts([box(30, 20)])).toEqual(bedParts([box(30, 20)]));
  });
  it("runs across neighbouring strips and gives a small patch one smaller square", () => {
    expect(bedParts([box(12, 4), box(12, 4, 12)]).beds.length).toBeGreaterThanOrEqual(6);
    expect(bedParts([box(2, 2)]).beds).toHaveLength(1);
    expect(bedParts([]).parts).toHaveLength(0);
  });
});
