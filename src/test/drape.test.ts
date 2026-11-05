import { describe, expect, it } from "vitest";
import { densify, ringM2, tileRing, type LL } from "@/models/drape";

const M = 111_320, k = M * Math.cos((41.8 * Math.PI) / 180);
const at = (x: number, y: number): LL => [41.8 + y / M, 14.9 + x / k];

describe("shapes laid on a hilly ground", () => {
  const field: LL[] = [at(0, 0), at(200, 0), at(220, 150), at(-20, 130)];
  it("cuts a big field into tiles that cover it exactly, within the tile limit", () => {
    const tiles = tileRing(field, 8);
    expect(tiles.length).toBeGreaterThan(4);
    expect(tiles.length).toBeLessThanOrEqual(32 * 1.6);
    const sum = tiles.reduce((s, t) => s + ringM2(t), 0);
    expect(Math.abs(sum - ringM2(field)) / ringM2(field)).toBeLessThan(0.001);
  });
  it("keeps a small shape whole", () => {
    expect(tileRing([at(0, 0), at(5, 0), at(5, 5)], 8)).toHaveLength(1);
  });
  it("puts a point every few metres along a line", () => {
    const pts = densify([{ lat: field[0]![0], lng: field[0]![1], h: 0.3 }, { lat: field[1]![0], lng: field[1]![1], h: 0.3 }], 5);
    expect(pts.length).toBe(41);
    expect(pts.every((p) => p.h === 0.3)).toBe(true);
    expect(densify(field.map(([lat, lng]) => ({ lat, lng })), 5, true).at(-1)).toEqual({ lat: field[0]![0], lng: field[0]![1] });
  });
});
