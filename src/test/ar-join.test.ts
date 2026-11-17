import { describe, expect, it } from "vitest";
import { footGap, joinFeet, nearFeedback, footCorners, JOIN_GAP } from "@/models/ar-objects";

const f = (x: number, z: number, w = 4, d = 4, rot = 0) => ({ x, z, w, d, rot });

describe("joining in AR", () => {
  it("measures the free gap between footprints", () => {
    expect(footGap(f(0, 0), f(5, 0))).toBeCloseTo(1);
    expect(footGap(f(0, 0), f(3, 0))).toBe(0);
    expect(footGap(f(0, 0), f(4, 4))).toBe(0);
    expect(footGap(f(0, 0), f(0, 10, 4, 4, 0.5))).toBeGreaterThan(5);
  });
  it("joins two side by side into one covering both", () => {
    const j = joinFeet(f(0, 0), f(4.4, 0));
    expect(j.w).toBeCloseTo(8.4); expect(j.d).toBeCloseTo(4); expect(j.x).toBeCloseTo(2.2); expect(j.z).toBeCloseTo(0);
  });
  it("keeps the larger one's turn and covers every corner", () => {
    const a = f(0, 0, 6, 4, 0.6), b = f(3, 4, 2, 2, 0);
    const j = joinFeet(a, b);
    expect(j.rot).toBe(0.6);
    for (const p of [...footCorners(a), ...footCorners(b)]) expect(footGap(j, { x: p.x, z: p.z, w: 0.001, d: 0.001, rot: 0 })).toBe(0);
  });
  it("comes faster and stronger as they get close", () => {
    expect(nearFeedback(3).stage).toBe("far");
    const far = nearFeedback(2), near = nearFeedback(0.8);
    expect(near.every).toBeLessThan(far.every);
    expect(near.pulse).toBeGreaterThan(far.pulse);
    expect(nearFeedback(JOIN_GAP).stage).toBe("join");
  });
});
