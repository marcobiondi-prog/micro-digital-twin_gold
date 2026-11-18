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

import { turnDetents, dragTick } from "@/models/ar-objects";
describe("touch feedback in AR", () => {
  it("ticks every 15° and marks the quarter turns", () => {
    expect(turnDetents(2, 10)).toEqual({ steps: 0, quarter: false });
    expect(turnDetents(10, 20)).toEqual({ steps: 1, quarter: false });
    expect(turnDetents(80, 95)).toEqual({ steps: 1, quarter: true });
    expect(turnDetents(-5, -20).quarter).toBe(false);
    expect(turnDetents(-80, -95).quarter).toBe(true);
  });
  it("gives a heavier object a longer tick", () => {
    expect(dragTick({ w: 0.5, d: 0.5, h: 3 })).toBeLessThan(dragTick({ w: 8, d: 8, h: 12 }));
    expect(dragTick({ w: 8, d: 8, h: 12 })).toBeLessThanOrEqual(22);
  });
});
