import { describe, expect, it } from "vitest";
import { simTabSwipeStep, startsOnOwnGesture } from "@/lib/sim-tab-swipe";

describe("sim-tab-swipe", () => {
  it("goes to the next tab on a left swipe and to the previous on a right swipe", () => {
    expect(simTabSwipeStep(0, 3, -90, 5)).toBe(1);
    expect(simTabSwipeStep(2, 3, 90, -5)).toBe(1);
  });
  it("stops at the ends", () => {
    expect(simTabSwipeStep(0, 3, 120, 0)).toBe(0);
    expect(simTabSwipeStep(2, 3, -120, 0)).toBe(2);
  });
  it("ignores short or mostly vertical moves", () => {
    expect(simTabSwipeStep(1, 3, -40, 0)).toBe(1);
    expect(simTabSwipeStep(1, 3, -80, 70)).toBe(1);
  });
  it("leaves sliders and maps to themselves", () => {
    const root = document.createElement("div");
    root.innerHTML = `<input type="range" id="r"><div data-map-gestures><span id="m"></span></div><p id="p"></p>`;
    document.body.append(root);
    expect(startsOnOwnGesture(root.querySelector("#r"), root)).toBe(true);
    expect(startsOnOwnGesture(root.querySelector("#m"), root)).toBe(true);
    expect(startsOnOwnGesture(root.querySelector("#p"), root)).toBe(false);
    root.remove();
  });
});
