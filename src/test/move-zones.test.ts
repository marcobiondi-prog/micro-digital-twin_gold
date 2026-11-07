import { describe, expect, it } from "vitest";
import { moveZones, type DrawnArea } from "@/models/drawn-area";

const lat = 41.56, lng = 14.66, m = 1 / 111_320, k = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
const sq = (x: number, y: number, w: number): Array<[number, number]> => [[lat + y * m, lng + x * k], [lat + y * m, lng + (x + w) * k], [lat + (y + w) * m, lng + (x + w) * k], [lat + (y + w) * m, lng + x * k]];
const area: DrawnArea = {
  lat, lng, ring: sq(0, 0, 100),
  zones: [{ id: "a", kind: "alberi", ring: sq(10, 10, 20) }, { id: "b", kind: "prato", ring: sq(50, 50, 10) }],
  edits: { trees: [[lat + 15 * m, lng + 15 * k], [lat + 80 * m, lng + 80 * k]] },
};

describe("moving the zones drawn by hand", () => {
  it("moves one zone with the trees placed by hand inside it", () => {
    const next = moveZones(area, ["a"], 20 * m, 30 * k)!;
    expect(next.zones![0]!.ring[0]![0]).toBeCloseTo(lat + 30 * m, 9);
    expect(next.zones![1]).toEqual(area.zones![1]);
    expect(next.edits!.trees![0]![1]).toBeCloseTo(lng + 45 * k, 9);
    expect(next.edits!.trees![1]).toEqual(area.edits!.trees![1]);
  });
  it("moves several zones together", () => {
    const next = moveZones(area, ["a", "b"], 5 * m, 5 * k)!;
    expect(next.zones!.every((z, i) => Math.abs(z.ring[0]![0] - area.zones![i]!.ring[0]![0] - 5 * m) < 1e-9)).toBe(true);
  });
  it("refuses a move past the drawn area’s outline", () => {
    expect(moveZones(area, ["b"], 45 * m, 0)).toBeNull();
    expect(moveZones(area, ["x"], 1 * m, 0)).toBeNull();
  });
});
