import { describe, expect, it } from "vitest";
import { findSubject, frameUsable, smoothBox } from "@/lib/ar-subject-tracker";

function frame(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  return data;
}

describe("AI camera subject tracker", () => {
  it("locks onto a plant in the right part of the frame", () => {
    const data = frame(48, 36, (x, y) => (x >= 32 && x < 44 && y >= 6 && y < 20 ? [40, 160, 40] : [120, 120, 120]));
    const lock = findSubject(data, 48, 36);
    expect(lock).not.toBeNull();
    const cx = lock!.x + lock!.w / 2, cy = lock!.y + lock!.h / 2;
    expect(cx).toBeGreaterThan(0.65);
    expect(cy).toBeLessThan(0.45);
  });

  it("locks onto a brown tree trunk", () => {
    const data = frame(48, 36, (x, y) => (x >= 20 && x < 28 && y >= 8 && y < 34 ? [110, 80, 55] : [120, 120, 120]));
    const lock = findSubject(data, 48, 36);
    expect(lock).not.toBeNull();
    expect(lock!.x + lock!.w / 2).toBeCloseTo(0.5, 1);
  });

  it("ignores brown wood when bark is off (vine leaf and canopy), still finding green", () => {
    const wood = frame(48, 36, (x, y) => (x >= 20 && x < 28 && y >= 8 && y < 34 ? [110, 80, 55] : [120, 120, 120]));
    expect(findSubject(wood, 48, 36, null, { bark: false })).toBeNull();
    const leaf = frame(48, 36, (x, y) => (x >= 20 && x < 28 && y >= 8 && y < 34 ? [40, 160, 40] : [120, 120, 120]));
    expect(findSubject(leaf, 48, 36, null, { bark: false })).not.toBeNull();
  });

  it("ignores non-green objects such as a red car", () => {
    const data = frame(48, 36, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 26 ? [200, 30, 30] : [120, 120, 120]));
    expect(findSubject(data, 48, 36)).toBeNull();
  });

  it("locks onto dark foliage in shade, like a holm oak", () => {
    const data = frame(48, 36, (x, y) => (x >= 14 && x < 34 && y >= 6 && y < 26 ? [30, 46, 28] : [70, 70, 72]));
    expect(findSubject(data, 48, 36, null, { bark: false })).not.toBeNull();
  });

  it("locks onto leaves under a warm light cast", () => {
    // Evening light: everything leans orange, the leaves turn olive-yellow.
    const data = frame(48, 36, (x, y) => (x >= 14 && x < 34 && y >= 6 && y < 26 ? [120, 140, 60] : [170, 140, 100]));
    expect(findSubject(data, 48, 36, null, { bark: false })).not.toBeNull();
  });

  it("tells a usable frame from a black or flat one", () => {
    expect(frameUsable(frame(48, 36, (x) => (x < 24 ? [40, 90, 40] : [150, 150, 150])), 48, 36)).toBe(true);
    expect(frameUsable(frame(48, 36, () => [5, 5, 5]), 48, 36)).toBe(false);
    expect(frameUsable(frame(48, 36, () => [120, 120, 120]), 48, 36)).toBe(false);
  });

  it("finds nothing in a flat frame", () => {
    expect(findSubject(frame(48, 36, () => [120, 120, 120]), 48, 36)).toBeNull();
  });

  it("glides toward the target instead of jumping", () => {
    const next = smoothBox({ x: 0, y: 0, w: 0.2, h: 0.2 }, { x: 1, y: 1, w: 0.4, h: 0.4 }, 0.5);
    expect(next.x).toBeCloseTo(0.5);
    expect(next.w).toBeCloseTo(0.3);
  });
});
