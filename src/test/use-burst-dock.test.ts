import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBurstDock } from "@/lib/use-burst-dock";

describe("useBurstDock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 800 });
  });

  it("creates a carouselRef and updateDockEffect handler", () => {
    const { result } = renderHook(() => useBurstDock(true, 3));
    expect(result.current.carouselRef).toBeDefined();
    expect(typeof result.current.updateDockEffect).toBe("function");
  });

  it("applies Mac Dock Genius magnification centered on window.innerWidth / 2 when full width", () => {
    const { result } = renderHook(() => useBurstDock(true, 3));
    const container = document.createElement("div");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 800,
      width: 800,
      height: 100,
      top: 0,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Screen center is 800 / 2 = 400
    // Item 1: centered at 400 (dead center -> maximum scale)
    const item1 = document.createElement("div");
    item1.setAttribute("data-burst-item", "true");
    item1.setAttribute("data-burst-id", "1");
    vi.spyOn(item1, "getBoundingClientRect").mockReturnValue({
      left: 375,
      right: 425,
      width: 50,
      height: 50,
      top: 0,
      bottom: 50,
      x: 375,
      y: 0,
      toJSON: () => {},
    });

    // Item 2: centered at 700 (outside maxRadius 140 -> base scale 0.88)
    const item2 = document.createElement("div");
    item2.setAttribute("data-burst-item", "true");
    item2.setAttribute("data-burst-id", "2");
    vi.spyOn(item2, "getBoundingClientRect").mockReturnValue({
      left: 675,
      right: 725,
      width: 50,
      height: 50,
      top: 0,
      bottom: 50,
      x: 675,
      y: 0,
      toJSON: () => {},
    });

    container.appendChild(item1);
    container.appendChild(item2);

    // @ts-expect-error ref assignment for testing
    result.current.carouselRef.current = container;

    act(() => {
      result.current.updateDockEffect();
    });

    // Dead center item reaches scale 1.32 and lift -14px
    expect(item1.style.transform).toContain("scale(1.320)");
    expect(item1.style.transform).toContain("translateY(-14.0px)");
    expect(item1.style.zIndex).toBe("25");

    // Distant item stays at base scale 0.88
    expect(item2.style.transform).toBe("scale(0.88) translateY(0px)");
    expect(item2.style.zIndex).toBe("1");
  });

  it("applies Genius magnification centered on containment div center when in landscape shelf", () => {
    const { result } = renderHook(() => useBurstDock(true, 2));
    const container = document.createElement("div");
    // Shelf on the left: left 20, width 300 -> center is 170
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 20,
      right: 320,
      width: 300,
      height: 100,
      top: 200,
      bottom: 300,
      x: 20,
      y: 200,
      toJSON: () => {},
    });

    // Item 1: centered at 170 (dead center of shelf -> maximum scale)
    const item1 = document.createElement("div");
    item1.setAttribute("data-burst-item", "true");
    item1.setAttribute("data-burst-id", "1");
    vi.spyOn(item1, "getBoundingClientRect").mockReturnValue({
      left: 145,
      right: 195,
      width: 50,
      height: 50,
      top: 220,
      bottom: 270,
      x: 145,
      y: 220,
      toJSON: () => {},
    });

    // Item 2: outside center radius
    const item2 = document.createElement("div");
    item2.setAttribute("data-burst-item", "true");
    item2.setAttribute("data-burst-id", "2");
    vi.spyOn(item2, "getBoundingClientRect").mockReturnValue({
      left: 240,
      right: 290,
      width: 50,
      height: 50,
      top: 220,
      bottom: 270,
      x: 240,
      y: 220,
      toJSON: () => {},
    });

    container.appendChild(item1);
    container.appendChild(item2);

    // @ts-expect-error ref assignment for testing
    result.current.carouselRef.current = container;

    act(() => {
      result.current.updateDockEffect();
    });

    expect(item1.style.transform).toContain("scale(1.320)");
    expect(item1.style.transform).toContain("translateY(-14.0px)");
  });

  it("does not magnify if there is only 1 photo", () => {
    const { result } = renderHook(() => useBurstDock(true, 1));
    const container = document.createElement("div");
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 800,
      width: 800,
      height: 100,
      top: 0,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    const item1 = document.createElement("div");
    item1.setAttribute("data-burst-item", "true");
    item1.setAttribute("data-burst-id", "1");
    vi.spyOn(item1, "getBoundingClientRect").mockReturnValue({
      left: 375,
      right: 425,
      width: 50,
      height: 50,
      top: 0,
      bottom: 50,
      x: 375,
      y: 0,
      toJSON: () => {},
    });

    container.appendChild(item1);
    // @ts-expect-error ref assignment for testing
    result.current.carouselRef.current = container;

    act(() => {
      result.current.updateDockEffect();
    });

    expect(item1.style.transform).toBe("scale(1) translateY(0px)");
    expect(item1.style.zIndex).toBe("1");
  });

  it("activates Genius magnification only when between 2 photos (dist <= 38px) and not before", () => {
    const { result } = renderHook(() => useBurstDock(true, 2));
    const container = document.createElement("div");
    // Center at 400
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 800,
      width: 800,
      height: 100,
      top: 0,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Item 1: at distance 20px (between 2 photos, dist < 38px -> magnified)
    const item1 = document.createElement("div");
    item1.setAttribute("data-burst-item", "true");
    item1.setAttribute("data-burst-id", "1");
    vi.spyOn(item1, "getBoundingClientRect").mockReturnValue({
      left: 395,
      right: 445,
      width: 50,
      height: 50,
      top: 0,
      bottom: 50,
      x: 395,
      y: 0,
      toJSON: () => {},
    });

    // Item 2: at distance 50px (not yet between 2 photos, dist > 38px -> base scale 0.88)
    const item2 = document.createElement("div");
    item2.setAttribute("data-burst-item", "true");
    item2.setAttribute("data-burst-id", "2");
    vi.spyOn(item2, "getBoundingClientRect").mockReturnValue({
      left: 425,
      right: 475,
      width: 50,
      height: 50,
      top: 0,
      bottom: 50,
      x: 425,
      y: 0,
      toJSON: () => {},
    });

    container.appendChild(item1);
    container.appendChild(item2);

    // @ts-expect-error ref assignment for testing
    result.current.carouselRef.current = container;

    act(() => {
      result.current.updateDockEffect();
    });

    // Item 1 (dist 20px < 38px) is magnified above base scale
    const match1 = item1.style.transform.match(/scale\(([\d.]+)\)/);
    expect(Number(match1?.[1])).toBeGreaterThan(0.88);

    // Item 2 (dist 50px > 38px) is strictly at base scale 0.88
    expect(item2.style.transform).toBe("scale(0.88) translateY(0px)");
  });
});
