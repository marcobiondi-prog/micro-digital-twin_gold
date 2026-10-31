import { describe, expect, it } from "vitest";
import { dialZoom, DIAL_PX, rulerTicks } from "@/lib/zoom-dial";

describe("zoom dial", () => {
  it("doubles the zoom for each DIAL_PX swiped left and halves it to the right", () => {
    expect(dialZoom(1, -DIAL_PX, 5)).toBe(2);
    expect(dialZoom(2, -DIAL_PX, 5)).toBe(4);
    expect(dialZoom(4, DIAL_PX, 5)).toBe(2);
  });
  it("stays between 1× and the maximum", () => {
    expect(dialZoom(1, 500, 5)).toBe(1);
    expect(dialZoom(3, -1000, 5)).toBe(5);
    expect(dialZoom(1, -1000, 2.5)).toBe(2.5);
  });
  it("numbers the whole steps of the ruler", () => {
    const t = rulerTicks(5);
    expect(t[0]).toEqual({ value: 1, major: true, label: "1" });
    expect(t.filter((x) => x.label).map((x) => x.label)).toEqual(["1", "2", "3", "4", "5"]);
    expect(t.find((x) => x.value === 1.5)?.major).toBe(true);
    expect(t).toHaveLength(41);
  });
});
