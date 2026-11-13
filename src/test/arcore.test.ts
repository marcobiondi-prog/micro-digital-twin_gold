import { describe, expect, it, vi, beforeEach } from "vitest";
import { isArCoreSupported, estimateRealSurfaceMetric, normalizeArLight, createArCoreManager } from "@/lib/arcore";
import { createArScene } from "@/views/ar-scene";

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
      this["setClearAlpha"] = vi.fn();
      this["setSize"] = vi.fn();
      this["clear"] = vi.fn();
      this["setScissor"] = vi.fn();
      this["setScissorTest"] = vi.fn();
      this["render"] = vi.fn();
      this["dispose"] = vi.fn();
    }),
  };
});

describe("ARCore WebXR Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("isArCoreSupported", () => {
    it("returns false when navigator.xr is not present", async () => {
      const origXr = (navigator as unknown as { xr?: unknown }).xr;
      delete (navigator as unknown as { xr?: unknown }).xr;
      expect(await isArCoreSupported()).toBe(false);
      if (origXr !== undefined) (navigator as unknown as { xr?: unknown }).xr = origXr;
    });

    it("returns true when navigator.xr.isSessionSupported('immersive-ar') resolves true", async () => {
      (navigator as unknown as { xr: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr = {
        isSessionSupported: vi.fn().mockImplementation((mode: string) => Promise.resolve(mode === "immersive-ar")),
      };
      expect(await isArCoreSupported()).toBe(true);
    });

    it("returns false when isSessionSupported throws or rejects", async () => {
      (navigator as unknown as { xr: { isSessionSupported: () => Promise<boolean> } }).xr = {
        isSessionSupported: vi.fn().mockRejectedValue(new Error("XR not supported")),
      };
      expect(await isArCoreSupported()).toBe(false);
    });
  });

  describe("estimateRealSurfaceMetric", () => {
    it("calculates metric ground distance and confidence for a detected surface", () => {
      const { groundZ, confidence } = estimateRealSurfaceMetric(2.0, 1.5, -30);
      expect(groundZ).toBeLessThan(0);
      expect(confidence).toBe(1); // Peak confidence at 2 meters
    });

    it("returns zero confidence for non-finite or negative distance", () => {
      expect(estimateRealSurfaceMetric(0)).toEqual({ groundX: 0, groundZ: 0, confidence: 0 });
      expect(estimateRealSurfaceMetric(-5)).toEqual({ groundX: 0, groundZ: 0, confidence: 0 });
      expect(estimateRealSurfaceMetric(Number.NaN)).toEqual({ groundX: 0, groundZ: 0, confidence: 0 });
    });
  });

  describe("normalizeArLight", () => {
    it("clamps raw light intensity into a balanced photographic range (0.3 - 1.8)", () => {
      expect(normalizeArLight(1.0)).toBe(1.0);
      expect(normalizeArLight(0.05)).toBe(0.3);
      expect(normalizeArLight(3.5)).toBe(1.8);
    });

    it("uses default intensity when input is null, undefined or NaN", () => {
      expect(normalizeArLight(null)).toBe(1.0);
      expect(normalizeArLight(undefined, 0.8)).toBe(0.8);
      expect(normalizeArLight(Number.NaN)).toBe(1.0);
    });
  });

  describe("createArCoreManager", () => {
    it("notifies subscribers when status changes", async () => {
      (navigator as unknown as { xr: { isSessionSupported: (mode: string) => Promise<boolean> } }).xr = {
        isSessionSupported: vi.fn().mockResolvedValue(true),
      };
      const manager = createArCoreManager();
      const statuses: string[] = [];
      const unsub = manager.subscribeStatus((s) => statuses.push(s));

      await manager.isSupported();
      expect(statuses).toContain("supported");
      unsub();
    });

    it("starts and stops an immersive-ar session successfully", async () => {
      const mockSession = {
        requestReferenceSpace: vi.fn().mockResolvedValue({}),
        requestHitTestSource: vi.fn().mockResolvedValue({}),
        requestAnimationFrame: vi.fn(),
        addEventListener: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
      };
      (navigator as unknown as { xr: { requestSession: () => Promise<unknown> } }).xr = {
        requestSession: vi.fn().mockResolvedValue(mockSession),
      };

      const manager = createArCoreManager();
      const started = await manager.startSession();
      expect(started).toBe(true);
      expect(manager.isActive()).toBe(true);

      await manager.stopSession();
      expect(manager.isActive()).toBe(false);
      expect(manager.getDetectedPlanes()).toEqual([]);
      expect(mockSession.end).toHaveBeenCalled();
    });

    it("initializes getDetectedPlanes with an empty array", () => {
      const manager = createArCoreManager();
      expect(manager.getDetectedPlanes()).toEqual([]);
    });
  });

  describe("ArScene ARCore integration", () => {
    it("supports setting real surface hit and reports tracking status", () => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillStyle: "",
        fillRect: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data: [0, 0, 0, 255] }),
      } as unknown as CanvasRenderingContext2D);

      const scene = createArScene();
      expect(scene.isArCoreTracking?.()).toBe(false);

      scene.setRealSurfaceHit?.({
        x: 0.5,
        y: 0,
        z: -2.0,
        distance: 2.0,
        isRealSurface: true,
      });

      expect(scene.isArCoreTracking?.()).toBe(true);

      scene.setRealSurfaceHit?.(null);
      expect(scene.isArCoreTracking?.()).toBe(false);
      scene.dispose();
    });

    it("recognizes tracking when ARCore manager detects planes", () => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillStyle: "",
        fillRect: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data: [0, 0, 0, 255] }),
      } as unknown as CanvasRenderingContext2D);

      const scene = createArScene();
      const mockManager = {
        isSupported: vi.fn().mockResolvedValue(true),
        startSession: vi.fn().mockResolvedValue(true),
        stopSession: vi.fn().mockResolvedValue(undefined),
        performHitTest: vi.fn().mockReturnValue(null),
        getLightEstimate: vi.fn().mockReturnValue(null),
        isActive: vi.fn().mockReturnValue(false),
        subscribeStatus: vi.fn().mockReturnValue(() => {}),
        getDetectedPlanes: vi.fn().mockReturnValue([
          {
            id: "plane_0",
            orientation: "horizontal" as const,
            polygon: [{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }],
            center: { x: 0, y: 0, z: -2 },
          },
        ]),
      };

      scene.setArCoreManager?.(mockManager);
      expect(scene.isArCoreTracking?.()).toBe(true);
      scene.render(800, 600, true);
      scene.dispose();
    });

    it("places and removes 3D tree with anchor reticle and thermal card", () => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
        fillStyle: "",
        fillRect: vi.fn(),
        getImageData: vi.fn().mockReturnValue({ data: [0, 0, 0, 255] }),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        fillText: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
      } as unknown as CanvasRenderingContext2D);

      const scene = createArScene();
      const targeted = scene.target(0.5, 0.65);
      expect(targeted).toBe(true);

      const placed = scene.place3DTree?.(0.5, 0.65, {
        speciesName: "Leccio",
        scientificName: "Quercus ilex",
        shadeM2: 18,
        cooling: 0.4,
      });
      expect(placed).toBe(true);

      scene.render(800, 600, true);
      scene.removeLast();
      scene.dispose();
    });
  });
});
