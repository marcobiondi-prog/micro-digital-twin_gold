import { describe, expect, it } from "vitest";
import { modelScaleFor, nearestPlaced } from "@/models/ar-objects";

describe("modelScaleFor", () => {
  it("fits a 4 m pergola in a 3 m room as a small model", () => {
    const s = modelScaleFor({ size: 4, tall: 3.2, dist: 1.5, eyeH: 1.4, span: 3 });
    expect(s).toBeLessThanOrEqual((0.45 * 3) / 4);
    expect(1 / s).toBe(Math.round(1 / s));
  });
  it("never goes above 1:2 and uses the floor distance without depth", () => {
    expect(modelScaleFor({ size: 0.4, tall: 0.3, dist: 5, eyeH: 1.5 })).toBe(0.5);
    const tableTop = modelScaleFor({ size: 3, tall: 3, dist: 0.5, eyeH: 0.4 });
    expect(tableTop * 3).toBeLessThanOrEqual(0.45 * 1);
  });
  it("a big tree on a table becomes a small ratio", () => {
    expect(modelScaleFor({ size: 8, tall: 12, dist: 0.6, eyeH: 0.4 })).toBeLessThanOrEqual(1 / 40);
  });
});

describe("nearestPlaced", () => {
  it("picks the nearest within reach", () => {
    const l = [{ id: "a", x: 0, z: 0, reach: 1 }, { id: "b", x: 0.5, z: 0, reach: 1 }, { id: "c", x: 5, z: 0, reach: 1 }];
    expect(nearestPlaced(l, { x: 0.6, z: 0 })?.id).toBe("b");
    expect(nearestPlaced(l, { x: 3, z: 0 })).toBeNull();
  });
});
