import { beforeEach, describe, expect, it } from "vitest";
import { addFind, fieldFinds, findFromScan, findsCountText, moveFind, offsetLatLng, removeFind, SCAN_DISTANCE_M } from "@/models/field-finds";
import type { ScanRecord } from "@/models/ar-scan-log";

const rec = (over: Partial<ScanRecord> = {}): ScanRecord => ({
  id: "scan-1", at: "2026-11-15T10:00:00Z", kind: "urban", target: "Alberi e ombra", context: "", result: "ok",
  species: { commonName: "Leccio", scientificName: "Quercus ilex", family: "Fagaceae", level: "species", cooling: 0.4, shade: 28 },
  soil: null, count: 1, totalCooling: 0.4, totalShade: 28, satellite: null, ...over,
});

describe("field finds", () => {
  beforeEach(() => { localStorage.clear(); for (const f of [...fieldFinds("urban"), ...fieldFinds("vineyard")]) removeFind(f.id); });

  it("moves a point along the compass heading by the distance", () => {
    const [lat, lng] = offsetLatLng(45, 11, 90, 100);
    expect(lat).toBeCloseTo(45, 6);
    expect((lng - 11) * 111_320 * Math.cos((45 * Math.PI) / 180)).toBeCloseTo(100, 0);
    const [lat2] = offsetLatLng(45, 11, 0, 111.32);
    expect(lat2 - 45).toBeCloseTo(0.001, 6);
  });

  it("places a tree found with GPS and compass, else with GPS, else on the place", () => {
    const withHeading = findFromScan(rec(), "tree", { lat: 45, lng: 11, accuracy: 5, heading: 0 }, { lat: 1, lng: 1 }, null);
    expect(withHeading.placed).toBe("gps-heading");
    expect((withHeading.lat - 45) * 111_320).toBeCloseTo(SCAN_DISTANCE_M.tree, 0);
    expect(withHeading.title).toBe("Leccio");
    expect(withHeading.crownM).toBeCloseTo(6, 0);
    expect(findFromScan(rec(), "tree", { lat: 45, lng: 11, accuracy: 5, heading: null }, { lat: 1, lng: 1 }, null).placed).toBe("gps");
    const none = findFromScan(rec(), "tree", null, { lat: 1, lng: 2 }, null);
    expect([none.placed, none.lat, none.lng]).toEqual(["place", 1, 2]);
  });

  it("describes a soil find and counts finds in plain words", () => {
    const soil = findFromScan(rec({ species: null, soil: { label: "asfalto", permeability: "bassa", plantable: false, note: "" }, target: "Suolo e depavimentazione" }), "ground", null, { lat: 1, lng: 1 }, null);
    expect(soil.title).toBe("Suolo: asfalto");
    expect(soil.detail).toContain("non adatta");
    expect(findsCountText([soil, findFromScan(rec(), "tree", null, { lat: 1, lng: 1 }, null), findFromScan(rec(), "tree", null, { lat: 1, lng: 1 }, null)])).toBe("1 suolo · 2 alberi");
  });

  it("keeps one find per scan, per flow, and moves it", () => {
    const a = findFromScan(rec(), "tree", null, { lat: 1, lng: 1 }, null);
    addFind(a);
    addFind({ ...findFromScan(rec(), "tree", null, { lat: 1, lng: 1 }, null) });
    expect(fieldFinds("urban")).toHaveLength(1);
    expect(fieldFinds("vineyard")).toHaveLength(0);
    moveFind(fieldFinds("urban")[0]!.id, 3, 4);
    expect([fieldFinds("urban")[0]!.lat, fieldFinds("urban")[0]!.lng]).toEqual([3, 4]);
  });
});
