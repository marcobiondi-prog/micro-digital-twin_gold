// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// The realistic tree generator loads in the browser only.
vi.mock("@/views/ar-tree", () => ({ realTree: async () => null }));
import { buildPlan } from "@/views/ar-plan";
import { piazzaLayout } from "@/models/area-layout";
import { enToAr, toEN } from "@/models/ar-objects";
import type { LabState } from "@/models/lab-store";

// jsdom draws no canvas: a 2D context that does nothing is enough for the textures.
const noop: unknown = new Proxy(() => noop, { get: (_t, k) => (k === "createRadialGradient" || k === "createLinearGradient" ? () => ({ addColorStop() {} }) : noop), apply: () => noop });
HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as typeof HTMLCanvasElement.prototype.getContext;

const lat = 41.55837, lng = 14.659698;
const dLat = 30 / 111_195, dLng = 40 / (111_195 * Math.cos((lat * Math.PI) / 180));
const ring: Array<[number, number]> = [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]];
const area = { lat, lng, ring };
const origin = { lat: lat + dLat / 2, lng: lng + dLng / 2 };
const a = { theta: 0.7, tx: 3, tz: -2 };

describe("project in AR", () => {
  it("stands every tree, mister and sprinkler on the spot the map gives it", () => {
    const urban = { trees: 4, permeable: 20, shade: 0, misters: 2, sprinklers: 3 } as LabState["urban"];
    const { group, count } = buildPlan("urban", { urban } as LabState, area, origin, a);
    expect(count).toMatchObject({ trees: 4, misters: 2, sprinklers: 3 });
    const L = piazzaLayout(ring, 4, 20, 0, {}, [], 2, [], 3)!;
    const want = [...L.trees, ...L.misters, ...L.sprinklers].map((p) => enToAr(toEN(p[0], p[1], origin), a));
    const got = group.children.filter((c) => c.type === "Group").map((c) => ({ x: c.position.x, z: c.position.z }));
    for (const w of want) expect(got.some((g) => Math.hypot(g.x - w.x, g.z - w.z) < 1e-6)).toBe(true);
  });
});

describe("pergola blocks", () => {
  const box = (x0: number, z0: number, w: number, d: number) => [{ x: x0, z: z0 }, { x: x0 + w, z: z0 }, { x: x0 + w, z: z0 + d }, { x: x0, z: z0 + d }];
  it("joins strips side by side into one pergola covering them all", async () => {
    const { pergolaBlocks } = await import("@/views/ar-plan");
    const b = pergolaBlocks([box(0, 0, 8, 3), box(0, 3, 8, 3), box(0, 6.3, 6, 3)]);
    expect(b).toHaveLength(1);
    expect(b[0]!.w).toBeCloseTo(8); expect(b[0]!.d).toBeCloseTo(9.3);
  });
  it("keeps apart blocks that are far", async () => {
    const { pergolaBlocks } = await import("@/views/ar-plan");
    expect(pergolaBlocks([box(0, 0, 4, 4), box(10, 0, 4, 4)])).toHaveLength(2);
  });
});

describe("aiuole joined in AR", () => {
  it("makes the lawn strips of one block a single bed when asked", () => {
    const urban = { trees: 0, permeable: 40, shade: 0, misters: 0, sprinklers: 0 } as LabState["urban"];
    const apart = buildPlan("urban", { urban } as LabState, area, origin, a, false, false).count.beds;
    const loose = buildPlan("urban", { urban } as LabState, area, origin, a, false, true).count.beds;
    const zoned = { ...area, zones: [{ id: "z", kind: "prato" as const, ring: area.ring }] };
    const joined = buildPlan("urban", { urban } as LabState, zoned, origin, a, false, true).count.beds;
    expect(apart).toBeGreaterThan(1);
    // Without an Aiuole zone they stay apart; inside one they join.
    expect(loose).toBe(apart);
    expect(joined).toBeLessThan(apart);
  });
});

describe("pergolaBlocks inside zones", () => {
  const box = (x: number, z: number, w: number, d: number) => [{ x, z }, { x: x + w, z }, { x: x + w, z: z + d }, { x, z: z + d }];
  it("joins touching patches only when the joined block fits", async () => {
    const { pergolaBlocks } = await import("@/views/ar-plan");
    expect(pergolaBlocks([box(0, 0, 4, 4), box(0, 4, 4, 4)], 0.6, () => true)).toHaveLength(1);
    expect(pergolaBlocks([box(0, 0, 4, 4), box(0, 4, 4, 4)], 0.6, () => false)).toHaveLength(2);
  });
});
