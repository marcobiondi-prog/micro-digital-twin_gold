import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPlaceArea } from "@/lib/place-area-client";

const square = { type: "way", tags: { place: "square", name: "Piazza" }, geometry: [
  { lat: 41.5600, lon: 14.6600 }, { lat: 41.5600, lon: 14.6610 }, { lat: 41.5607, lon: 14.6610 }, { lat: 41.5607, lon: 14.6600 }, { lat: 41.5600, lon: 14.6600 },
] };

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe("loadPlaceArea", () => {
  it("takes the phone's answer when the app's server hangs", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ elements: [square] }))));
    const ask = () => new Promise<never>(() => {});
    const v = await loadPlaceArea(ask, 41.5603, 14.6605);
    expect(v?.m2).toBeGreaterThan(1000);
  });
  it("keeps a shape read before and asks nothing the next time", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ elements: [square] })));
    vi.stubGlobal("fetch", f);
    await loadPlaceArea(() => new Promise<never>(() => {}), 41.5603, 14.6605);
    f.mockClear();
    const v = await loadPlaceArea(() => Promise.reject(new Error("x")), 41.5603, 14.6605);
    expect(v?.m2).toBeGreaterThan(1000);
    expect(f).not.toHaveBeenCalled();
  });
  it("says null when nothing answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 504 })));
    expect(await loadPlaceArea(() => Promise.reject(new Error("x")), 41.5603, 14.6605)).toBeNull();
  });
});

import { areaCandidates, joinOuter } from "@/models/place-area";
describe("multipolygon outer edges", () => {
  it("chains split ways into one ring", () => {
    const a = { lat: 41, lon: 14 }, b = { lat: 41, lon: 14.001 }, c = { lat: 41.001, lon: 14.001 }, d = { lat: 41.001, lon: 14 };
    expect(joinOuter([[a, b], [c, b], [d, c], [d, a]])).toHaveLength(1);
    const els = [{ type: "relation", tags: { place: "square" }, members: [{ role: "outer", geometry: [a, b, c] }, { role: "outer", geometry: [a, d, c] }] }];
    expect(areaCandidates(els as never)[0]?.kind).toBe("piazza");
  });
  it("reads a market square as a piazza", () => {
    const g = [{ lat: 41, lon: 14 }, { lat: 41, lon: 14.001 }, { lat: 41.001, lon: 14.001 }, { lat: 41, lon: 14 }];
    expect(areaCandidates([{ type: "way", tags: { amenity: "marketplace" }, geometry: g }] as never)[0]?.kind).toBe("piazza");
  });
});
