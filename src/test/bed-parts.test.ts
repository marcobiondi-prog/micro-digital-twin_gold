import { describe, expect, it } from "vitest";
import { bedParts, BEDS_3D } from "@/models/area-layout";
import { ringContains, ringAreaM2, type Ring } from "@/models/place-area";

const lat = 41.56, lng = 14.66, k = 111_320 * Math.cos((lat * Math.PI) / 180);
const box = (w: number, h: number, dx = 0, dy = 0): Ring => [[lat + dy / 111_320, lng + dx / k], [lat + dy / 111_320, lng + (dx + w) / k], [lat + (dy + h) / 111_320, lng + (dx + w) / k], [lat + (dy + h) / 111_320, lng + dx / k]];
const grass = (c: string) => (BEDS_3D.grass as readonly string[]).includes(c);

describe("aiuole e ciottoli in 3D, like the 2D pattern", () => {
  it("lays a pebble ground and north–south beds of grass 2 m wide with 1 m of path between them", () => {
    const patch = box(21, 12);
    const { beds, parts } = bedParts([patch]);
    expect(beds).toHaveLength(7);
    for (const b of beds) for (const [a, c] of b) expect(ringContains(box(21.01, 12.01, -0.005, -0.005), a, c)).toBe(true);
    const green = beds.reduce((t, b) => t + ringAreaM2(b), 0);
    expect(green / ringAreaM2(patch)).toBeGreaterThan(0.6);
    expect(green / ringAreaM2(patch)).toBeLessThan(0.72);
    expect(parts.filter((p) => p.color === BEDS_3D.pebbles)).toHaveLength(1);
    expect(parts.filter((p) => grass(p.color))).toHaveLength(7);
    expect(parts.every((p) => p.height > p.base && p.base > 0)).toBe(true);
  });
  it("joins the pieces of row strips stacked one on another into one bed per band", () => {
    const rows = [box(12, 3, 0, 0), box(12, 3, 0, 3), box(12, 3, 0, 6)];
    expect(bedParts(rows).beds).toHaveLength(4);
  });
  it("keeps the pieces few on a big lawn and is the same every time", () => {
    expect(bedParts([box(300, 40)]).beds.length).toBeLessThanOrEqual(70);
    expect(bedParts([box(30, 20)])).toEqual(bedParts([box(30, 20)]));
    expect(bedParts([]).parts).toHaveLength(0);
  });
});
