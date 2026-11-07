import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPlaceArea } from "@/lib/place-area-client";

// A 40 × 40 m square around (41.56, 14.66), mapped as place=square.
const d = 0.00018;
const square = { type: "way", tags: { place: "square", name: "Piazza" }, geometry: [[-d, -d], [-d, d], [d, d], [d, -d], [-d, -d]].map(([a, b]) => ({ lat: 41.56 + a!, lon: 14.66 + b! })) };

afterEach(() => vi.unstubAllGlobals());

describe("loadPlaceArea", () => {
  it("keeps the server’s answer when it has one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await loadPlaceArea(async () => ({ centre: [1, 2] }), 41.56, 14.66);
    expect(r).toEqual({ centre: [1, 2] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("asks the map servers from the phone when the server reached none, moving on after a busy one", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ elements: [square] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await loadPlaceArea(async () => { throw new Error("place-area-unreachable"); }, 41.56, 14.66);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r?.centre?.[0]).toBeCloseTo(41.56, 4);
    expect(r?.centre?.[1]).toBeCloseTo(14.66, 4);
    expect(r?.m2).toBeGreaterThan(1000);
  });
});
