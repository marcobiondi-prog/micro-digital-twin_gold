import { describe, expect, it } from "vitest";
import { CROWN_REACH_M, crownRing, piazzaLayout, vineLayout } from "@/models/area-layout";
import { ringContains, type Ring } from "@/models/place-area";

// A 40 × 30 m area (lat/lng degrees from metres around 41.56 N).
const M = 111_195, k = M * Math.cos((41.56 * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [41.56 + y / M, 14.66 + x / k];
const area: Ring = [at(0, 0), at(40, 0), at(40, 30), at(0, 30)];
const allIn = (r: Ring) => r.every(([a, b]) => ringContains(area, a, b));

describe("everything the simulation draws stays inside the drawn area", () => {
  it("keeps every tree's whole crown inside, even with many trees", () => {
    for (const n of [1, 6, 30]) {
      const l = piazzaLayout(area, n, 40, 30)!;
      expect(l.trees).toHaveLength(n);
      for (const t of l.trees) expect(allIn(crownRing(t, CROWN_REACH_M - 0.1, 16))).toBe(true);
      for (const p of l.patches) expect(allIn(p.ring)).toBe(true);
    }
  });
  it("brings a tree moved past the edge back inside", () => {
    const l = piazzaLayout(area, 2, 0, 0, { trees: [at(-20, 10), null] })!;
    expect(allIn(crownRing(l.trees[0]!, CROWN_REACH_M - 0.1, 16))).toBe(true);
  });
  it("keeps the windbreak, the drip lines and the shade cloth inside", () => {
    const l = vineLayout(area, [{ irrigation: 20, shade: 50, windbreak: 100 }, { irrigation: 10, shade: 0, windbreak: 100 }, { irrigation: 0, shade: 100, windbreak: 100 }])!;
    const wind = l.lines.find((x) => x.kind === "wind")!;
    expect(allIn(wind.line)).toBe(true);
    for (const x of l.lines) expect(allIn(x.line)).toBe(true);
    for (const p of l.patches) expect(allIn(p.ring)).toBe(true);
  });
});
