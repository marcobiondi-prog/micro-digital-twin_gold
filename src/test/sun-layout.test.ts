import { describe, expect, it } from "vitest";
import { sunPath, sunShare } from "@/models/sun-exposure";
import { piazzaLayout } from "@/models/area-layout";
import { ringContains, type Ring } from "@/models/place-area";

const M = 111_195, k = M * Math.cos((41.56 * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [41.56 + y / M, 14.66 + x / k];
const area: Ring = [at(0, 0), at(60, 0), at(60, 40), at(0, 40)];
const pts: Array<[number, number]> = [[0, 0], [60, 0], [60, 40], [0, 40]];

describe("summer sun on the area", () => {
  it("climbs to about 72° at noon in Campobasso at midsummer, from the south", () => {
    const noon = sunPath(41.56, 172, [12])[0]!;
    expect((noon.alt * 180) / Math.PI).toBeGreaterThan(70);
    expect((noon.alt * 180) / Math.PI).toBeLessThan(74);
    expect(Math.abs((noon.az * 180) / Math.PI - 180)).toBeLessThan(1);
  });
  it("shades the west strip in the long afternoon (buildings to the west), so the east side gets more sun", () => {
    const sun = sunPath(41.56);
    expect(sunShare(pts, sun, 57, 20)).toBeGreaterThan(sunShare(pts, sun, 3, 20));
    // Spring sun is lower: there the strip along the south buildings is shaded too.
    const spring = sunPath(41.56, 80);
    expect(sunShare(pts, spring, 30, 37)).toBeGreaterThan(sunShare(pts, spring, 30, 3));
  });
  it("puts the pergolas on sunnier cells than the plain layout, and everything stays inside", () => {
    const best = piazzaLayout(area, 6, 30, 30, { best: true })!;
    const plain = piazzaLayout(area, 6, 30, 30)!;
    const sun = sunPath(41.56);
    const score = (l: typeof best) => {
      const shade = l.patches.filter((p) => p.kind === "shade");
      const mid = shade.map((p) => { const ys = p.ring.map((q) => (q[0] - 41.56) * M), xs = p.ring.map((q) => (q[1] - 14.66) * k); return sunShare(pts, sun, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2); });
      return mid.reduce((a, b) => a + b, 0) / mid.length;
    };
    expect(score(best)).toBeGreaterThanOrEqual(score(plain));
    expect(best.trees).toHaveLength(6);
    expect(best.sunny).toBeGreaterThan(0);
    for (const t of best.trees) expect(ringContains(area, t[0], t[1])).toBe(true);
  });
});
