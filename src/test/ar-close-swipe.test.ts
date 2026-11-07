import { describe, expect, it } from "vitest";
import { BACK_EDGE_PX, isArCloseSwipe, isCameraCloseGesture, isEdgeBackSwipe } from "@/lib/ar-close-swipe";

const W = 400;
describe("shared camera close gestures", () => {
  it("closes sideways only from Android’s back strip at the screen’s edges, moving inwards", () => {
    expect(isCameraCloseGesture(-100, 5, 350, 741, { startX: W - 10, width: W, dx: -100, dy: 5 })).toBe(true);
    expect(isCameraCloseGesture(100, 5, 350, 741, { startX: 8, width: W, dx: 100, dy: 5 })).toBe(true);
    expect(isEdgeBackSwipe(BACK_EDGE_PX, W, 80, 0)).toBe(true);
  });
  it("never closes on a sideways swipe across the middle of the preview", () => {
    expect(isCameraCloseGesture(-100, 5, 350, 741, { startX: 250, width: W, dx: -100, dy: 5 })).toBe(false);
    expect(isCameraCloseGesture(-100, 5, 350, 741)).toBe(false);
    expect(isEdgeBackSwipe(BACK_EDGE_PX + 1, W, 100, 0)).toBe(false);
  });
  it("ignores an edge swipe going outwards, short or diagonal", () => {
    expect(isEdgeBackSwipe(10, W, -100, 0)).toBe(false);
    expect(isEdgeBackSwipe(W - 10, W, 100, 0)).toBe(false);
    expect(isEdgeBackSwipe(10, W, 40, 0)).toBe(false);
    expect(isEdgeBackSwipe(10, W, 80, 80)).toBe(false);
  });
  it("closes upward above the gesture bar, not from the upper preview", () => {
    expect(isCameraCloseGesture(5, -100, 700, 741)).toBe(true);
    expect(isCameraCloseGesture(5, -100, 200, 741)).toBe(false);
  });
  it("still reads plain upward and leftward swipes", () => {
    expect(isArCloseSwipe(10, -100)).toBe(true);
    expect(isArCloseSwipe(-100, 10)).toBe(true);
    expect(isArCloseSwipe(0, 0)).toBe(false);
    expect(isArCloseSwipe(-70, -70)).toBe(false);
  });
});
