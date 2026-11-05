import { describe, expect, it } from "vitest";
import { piazzaLayout, piazzaShadows, TREE_RADIUS_M, TREE_SHADE_M2 } from "@/models/area-layout";
import { ringAreaM2, type Ring } from "@/models/place-area";
import { solarHour, sunAt } from "@/models/sun-shadow";

// A 60 × 40 m area around 41.56 N, 14.66 E (Campobasso).
const M = 111_195, k = M * Math.cos((41.56 * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [41.56 + y / M, 14.66 + x / k];
const area: Ring = [at(0, 0), at(60, 0), at(60, 40), at(0, 40)];
const centreOf = (r: Ring) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length] as const;

describe("the map draws the m² the simulation counts", () => {
  it("lawn and pergolas cover their lever's share of the area, within one cell", () => {
    const l = piazzaLayout(area, 0, 30, 20)!;
    expect(l.lawnTarget).toBe(720);
    expect(l.shadeTarget).toBe(480);
    const cell = l.cell * l.cell;
    const drawn = (kind: string) => l.patches.filter((p) => p.kind === kind).reduce((s, p) => s + ringAreaM2(p.ring), 0);
    expect(Math.abs(drawn("lawn") - 720)).toBeLessThanOrEqual(cell);
    expect(Math.abs(drawn("shade") - 480)).toBeLessThanOrEqual(cell);
    expect(Math.abs(l.lawnM2 - drawn("lawn"))).toBeLessThan(5);
  });
  it("each tree's crown is the 30 m² of shade the simulation counts", () => {
    expect(Math.PI * TREE_RADIUS_M ** 2).toBeCloseTo(TREE_SHADE_M2, 5);
  });
});

describe("shadows follow the simulation's sun", () => {
  const l = piazzaLayout(area, 1, 0, 20)!;
  it("turns the clock into solar time, an hour less with ora legale", () => {
    expect(solarHour(13, 15, "legale")).toBeCloseTo(12);
    expect(solarHour(12, 15, "solare")).toBeCloseTo(12);
  });
  it("at summer noon a short shadow falls north; at dusk a long one falls east", () => {
    const noon = sunAt(41.56, 14.66, "estate", 13, 0, "legale")!;
    const late = sunAt(41.56, 14.66, "estate", 19, 0, "legale")!;
    const pergola = l.patches.find((p) => p.kind === "shade")!;
    const [pLat, pLng] = centreOf(pergola.ring);
    const [nLat, nLng] = centreOf(piazzaShadows(l, noon)[0]!);
    const [eLat, eLng] = centreOf(piazzaShadows(l, late)[0]!);
    expect(nLat).toBeGreaterThan(pLat);
    expect(Math.abs(nLng - pLng) * k).toBeLessThan(1);
    expect((nLat - pLat) * M).toBeLessThan(2);
    expect((eLng - pLng) * k).toBeGreaterThan(3);
  });
  it("in winter the noon shadow is longer than in summer", () => {
    const len = (s: "estate" | "inverno") => { const r = piazzaShadows(l, sunAt(41.56, 14.66, s, s === "estate" ? 13 : 12, 0, s === "estate" ? "legale" : "solare"))[0]!; return (centreOf(r)[0] - centreOf(l.patches.find((p) => p.kind === "shade")!.ring)[0]) * M; };
    expect(len("inverno")).toBeGreaterThan(len("estate") * 2);
  });
  it("casts nothing at night", () => {
    expect(sunAt(41.56, 14.66, "inverno", 22)).toBeNull();
    expect(piazzaShadows(l, null)).toEqual([]);
  });
  it("gives each tree a crown shadow and a trunk", () => {
    const t = piazzaLayout(area, 2, 0, 0)!;
    expect(piazzaShadows(t, sunAt(41.56, 14.66, "estate", 17, 0, "legale"))).toHaveLength(4);
  });
});

describe("day and night on the map follow the simulation's hour", async () => {
  const { dayLight, sunHeightDeg } = await import("@/models/sun-shadow");
  it("is day at summer noon and night at winter 22:00", () => {
    expect(dayLight(sunHeightDeg(41.56, 14.66, "estate", 13, 0, "legale"), false).phase).toBe("giorno");
    expect(dayLight(sunHeightDeg(41.56, 14.66, "inverno", 22, 0, "solare"), false)).toEqual({ phase: "notte", veil: "rgba(10, 18, 50, 0.5)" });
  });
  it("turns golden at sunset and clear by day", () => {
    expect(dayLight(4, false).phase).toBe("tramonto");
    expect(dayLight(4, true).phase).toBe("alba");
    expect(dayLight(30, true).veil).toBeNull();
  });
});
