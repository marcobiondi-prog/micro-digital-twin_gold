import { describe, expect, it } from "vitest";
import { piazzaLayout, vineLayout } from "@/models/area-layout";
import { ringAreaM2, ringContains } from "@/models/place-area";

// About an 80 m × 60 m rectangle.
const lat = 41.55837, lng = 14.659698;
const dLat = 60 / 111_195, dLng = 80 / (111_195 * Math.cos((lat * Math.PI) / 180));
const ring: Array<[number, number]> = [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]];
const patchArea = (kind: string, l: { patches: Array<{ kind: string; ring: Array<[number, number]> }> }) => l.patches.filter((p) => p.kind === kind).reduce((s, p) => s + ringAreaM2(p.ring), 0);

describe("piazza inside the area", () => {
  it("places as many trees as the lever, all inside", () => {
    const l = piazzaLayout(ring, 12, 0, 0)!;
    expect(l.trees).toHaveLength(12);
    expect(l.trees.every(([a, b]) => ringContains(ring, a, b))).toBe(true);
  });
  it("covers about the lever's share with lawn and shade, not overlapping", () => {
    const l = piazzaLayout(ring, 0, 40, 20)!, total = ringAreaM2(ring);
    expect(patchArea("lawn", l) / total).toBeGreaterThan(0.33);
    expect(patchArea("lawn", l) / total).toBeLessThan(0.47);
    expect(patchArea("shade", l) / total).toBeGreaterThan(0.15);
    expect(patchArea("shade", l) / total).toBeLessThan(0.25);
  });
  it("keeps a tree moved by hand and moves the lawn towards its handle", () => {
    const moved: [number, number] = [lat + dLat / 2, lng + dLng / 2];
    const l = piazzaLayout(ring, 3, 30, 0, { trees: [moved] })!;
    expect(l.trees[0]).toEqual(moved);
    const west = piazzaLayout(ring, 0, 30, 0)!, east = piazzaLayout(ring, 0, 30, 0, { lawnAt: [lat + dLat / 2, lng + dLng * 0.9] })!;
    expect(east.lawnAt[1]).toBeGreaterThan(west.lawnAt[1]);
  });
  it("needs an area", () => {
    expect(piazzaLayout(ring.slice(0, 2), 3, 10, 10)).toBeNull();
  });
});

describe("vineyard inside the area", () => {
  it("splits it in three zones with drip lines on a main pipe, traps and treated rows", () => {
    const l = vineLayout(ring, [{ irrigation: 20, pestAnimal: 50, pestPlant: 60 }, { irrigation: 0, pestAnimal: 0, pestPlant: 60 }, { irrigation: 8, pestAnimal: 0, pestPlant: 60 }])!;
    expect(new Set(l.patches.filter((p) => p.kind === "zone").map((p) => p.zone))).toEqual(new Set([0, 1, 2]));
    expect(l.lines.some((x) => x.kind === "drip" && x.zone === 0)).toBe(true);
    expect(l.lines.some((x) => x.kind === "drip" && x.zone === 1)).toBe(false);
    expect(l.lines.filter((x) => x.kind === "main").map((x) => x.zone)).toEqual([0, 2]);
    expect(l.patches.some((p) => p.kind === "treat" && p.zone === 1)).toBe(true);
    expect(l.traps.length).toBeGreaterThanOrEqual(1);
  });
  it("has no pipes, traps nor treated rows without interventions", () => {
    const l = vineLayout(ring, [{ irrigation: 0, pestAnimal: 0, pestPlant: 0 }])!;
    expect(l.lines.some((x) => x.kind === "drip" || x.kind === "main")).toBe(false);
    expect(l.traps).toHaveLength(0);
    expect(l.patches.some((p) => p.kind === "treat")).toBe(false);
  });
});

describe("3D tree", () => {
  it("has a trunk from the ground and a pointed crown, widest low and narrow at the tip", async () => {
    const { treeParts } = await import("@/models/area-layout");
    const parts = treeParts([lat, lng]);
    expect(parts[0]).toMatchObject({ base: 0, height: 3 });
    const crown = parts.slice(1), width = (i: number) => ringAreaM2(crown[i]!.ring);
    expect(crown[0]!.base).toBe(2.5);
    expect(crown.at(-1)!.height).toBeGreaterThan(10);
    expect(width(0)).toBeGreaterThan(width(crown.length - 1) * 20);
  });
});

describe("pergolas", () => {
  it("raise posts, beams and slats over each shade strip, and keep the trees out from under them", async () => {
    const { pergolaParts, piazzaLayout: layout } = await import("@/models/area-layout");
    const l = layout(ring, 10, 0, 30)!;
    const strips = l.patches.filter((p) => p.kind === "shade");
    const parts = strips.flatMap((p) => pergolaParts(p.ring));
    expect(parts.some((p) => p.base === 0 && p.height > 2.5)).toBe(true);
    expect(parts.filter((p) => p.base >= 3).length).toBeGreaterThan(strips.length * 3);
    const inShade = (t: [number, number]) => strips.some((p) => ringContains(p.ring, t[0], t[1]));
    expect(l.trees.filter(inShade)).toHaveLength(0);
  });
  it("cover a Pergolato zone with one pergola of exactly its drawn outline", async () => {
    const { pergolaRingParts, piazzaLayout: layout } = await import("@/models/area-layout");
    const lats = ring.map((p) => p[0]), lngs = ring.map((p) => p[1]);
    const mLat = (Math.min(...lats) + Math.max(...lats)) / 2, mLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const dLat = (Math.max(...lats) - Math.min(...lats)) / 8, dLng = (Math.max(...lngs) - Math.min(...lngs)) / 8;
    const zone: Array<[number, number]> = [[mLat - dLat, mLng - dLng], [mLat - dLat, mLng + dLng], [mLat + dLat, mLng + dLng + dLng / 2], [mLat + dLat, mLng - dLng]];
    const l = layout(ring, 0, 0, 30, {}, [{ kind: "ombra", ring: zone }])!;
    const exact = l.patches.filter((p) => p.kind === "shade" && p.exact);
    expect(exact).toHaveLength(1);
    expect(exact[0]!.ring).toEqual(zone);
    const parts = pergolaRingParts(zone);
    expect(parts.at(-1)!.ring).toEqual(zone);
    expect(parts.filter((p) => p.base === 0).length).toBeGreaterThanOrEqual(4);
  });
});

describe("zones drawn by hand", () => {
  // A 24 m × 20 m trees zone in the middle of the area.
  const zLat = 20 / 111_195, zLng = 24 / (111_195 * Math.cos((lat * Math.PI) / 180));
  const zone: Array<[number, number]> = [[lat + dLat / 2 - zLat / 2, lng + dLng / 2 - zLng / 2], [lat + dLat / 2 - zLat / 2, lng + dLng / 2 + zLng / 2], [lat + dLat / 2 + zLat / 2, lng + dLng / 2 + zLng / 2], [lat + dLat / 2 + zLat / 2, lng + dLng / 2 - zLng / 2]];
  it("keep every tree's whole crown inside its trees zone", async () => {
    const { TREE_RADIUS_M } = await import("@/models/area-layout");
    const l = piazzaLayout(ring, 6, 0, 0, {}, [{ kind: "alberi", ring: zone }])!;
    expect(l.trees).toHaveLength(6);
    const r = (TREE_RADIUS_M * 0.85) / 111_195;
    for (const [a, b] of l.trees) for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      expect(ringContains(zone, a + Math.sin(ang) * r * 0.99, b + (Math.cos(ang) * r * 0.99) / Math.cos((lat * Math.PI) / 180))).toBe(true);
    }
  });
  it("stripe a lawn only inside its outline", async () => {
    const { mowStripes } = await import("@/models/area-layout");
    const lines = mowStripes(zone);
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) for (const [a, b] of line) expect(ringContains(zone, a, b)).toBe(true);
  });
});

