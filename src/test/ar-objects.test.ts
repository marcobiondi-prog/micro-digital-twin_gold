import { describe, expect, it } from "vitest";
import { alignFromFix, alignTwoPoints, arDistance, arToEn, AR_OBJECTS, enToAr, fromEN, metresText, objectsToZones, toEN } from "@/models/ar-objects";

describe("AR alignment and objects", () => {
  it("round-trips map and AR points through any alignment", () => {
    const a = { theta: 0.7, tx: 3, tz: -2 };
    const p = { e: 12.5, n: -4 };
    const q = arToEn(enToAr(p, a), a);
    expect(q.e).toBeCloseTo(p.e, 9);
    expect(q.n).toBeCloseTo(p.n, 9);
  });

  it("puts two map corners exactly on the two AR points touched", () => {
    const A = { e: 0, n: 0 }, B = { e: 10, n: 0 };
    const a = { x: 1, z: -2 }, b = { x: 1, z: -12 }; // the corner B straight ahead of A, 10 m away
    const al = alignTwoPoints(A, B, a, b);
    const pa = enToAr(A, al), pb = enToAr(B, al);
    expect(pa.x).toBeCloseTo(1, 9); expect(pa.z).toBeCloseTo(-2, 9);
    expect(pb.x).toBeCloseTo(1, 9); expect(pb.z).toBeCloseTo(-12, 9);
    expect(arDistance(pa, pb)).toBeCloseTo(10, 9);
  });

  it("from the GPS fix: the fix is the origin and the heading is straight ahead (−z)", () => {
    const fix = { e: 5, n: 5 };
    const al = alignFromFix(fix, 90); // looking east
    const o = enToAr(fix, al);
    expect(o.x).toBeCloseTo(0, 9); expect(o.z).toBeCloseTo(0, 9);
    const ahead = enToAr({ e: 15, n: 5 }, al);
    expect(ahead.x).toBeCloseTo(0, 9); expect(ahead.z).toBeCloseTo(-10, 9);
  });

  it("lat/lng and metres agree, and the objects become zones of their kind", () => {
    const o = { lat: 45.44, lng: 10.99 };
    const [lat, lng] = fromEN({ e: 20, n: -30 }, o);
    const back = toEN(lat, lng, o);
    expect(back.e).toBeCloseTo(20, 6); expect(back.n).toBeCloseTo(-30, 6);
    const al = { theta: 0, tx: 0, tz: 0 };
    const zones = objectsToZones("urban", [{ uid: "1", id: "pergolato", x: 0, z: -5, yaw: 0 }, { uid: "2", id: "albero", x: 3, z: -5, yaw: 0 }], al, o, 1);
    expect(zones.map((z) => z.kind)).toEqual(["ombra", "alberi"]);
    const ring = zones[0]!.ring.map(([a, b]) => toEN(a, b, o));
    expect(Math.max(...ring.map((p) => p.e)) - Math.min(...ring.map((p) => p.e))).toBeCloseTo(4, 6);
    expect(ring.every((p) => p.n > 2.9 && p.n < 7.1)).toBe(true); // −z in AR is north here
    expect(AR_OBJECTS.vineyard.map((d) => d.zone)).toEqual(["teli", "frangivento", "irrigazione"]);
    expect(metresText(3.456)).toBe("3,46 m");
  });
});

import { insideRing, zonesInside } from "@/models/ar-objects";
describe("zonesInside", () => {
  it("keeps only the zones whose middle is in the area", () => {
    const area: Array<[number, number]> = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(insideRing(0.5, 0.5, area)).toBe(true);
    expect(insideRing(1.5, 0.5, area)).toBe(false);
    const z = (lat: number) => ({ id: String(lat), kind: "alberi" as const, ring: [[lat, 0.4], [lat, 0.6], [lat + 0.1, 0.5]] as Array<[number, number]> });
    const r = zonesInside([z(0.4), z(2)], area);
    expect(r.kept.map((x) => x.id)).toEqual(["0.4"]);
    expect(r.out).toBe(1);
  });
});

import { horizonAt, pitchForHorizon } from "@/models/ar-objects";
describe("floor adjustment", () => {
  it("puts the horizon where the line is dragged", () => {
    expect(horizonAt(0, 70)).toBeCloseTo(0.5);
    expect(horizonAt(-14, 70)).toBeLessThan(0.5);
    for (const ny of [0.1, 0.3, 0.5, 0.45]) expect(horizonAt(pitchForHorizon(ny, 70), 70)).toBeCloseTo(ny, 6);
  });
});

import { plantObject, recognisedPlants } from "@/models/ar-objects";
describe("recognised plants in Prova", () => {
  const sp = (scientificName: string, form: "conical" | "round" | "shrub" | "vine", heightM = 10, crownM = 6) =>
    ({ commonName: scientificName.split(" ")[0]!, scientificName, family: null, level: "Specie probabile", cooling: 0.3, shade: 20, form, heightM, crownM, evergreen: true });
  it("takes the species' shape and size, within bounds", () => {
    const fir = plantObject("urban", sp("Abies alba", "conical", 30, 8))!;
    expect(fir.id).toBe("pianta");
    expect(fir.plant?.form).toBe("conical");
    expect([fir.w, fir.h, fir.zone]).toEqual([8, 30, "alberi"]);
    expect(plantObject("urban", sp("Nerium oleander", "shrub", 3, 2))!.zone).toBe("prato");
    expect(plantObject("urban", sp("X y", "round", 400, 900))!.h).toBe(40);
    expect(plantObject("vineyard", sp("Vitis vinifera", "vine", 2, 1))!.w).toBe(4);
  });
  it("skips older records without a shape and lists each species once, newest first", () => {
    const { form: _drop, ...old } = sp("Quercus ilex", "round");
    const list = recognisedPlants("urban", [sp("Quercus ilex", "round"), null, old, sp("Pinus pinea", "round"), sp("Quercus ilex", "round")]);
    expect(list.map((d) => d.plant?.scientificName)).toEqual(["Quercus ilex", "Pinus pinea"]);
  });
});

import { placeHaptic } from "@/models/ar-objects";
describe("placeHaptic", () => {
  it("vibrates by the object's weight", () => {
    const mister = placeHaptic({ w: 0.4, d: 0.4, h: 3 });
    const tree = placeHaptic({ w: 6.2, d: 6.2, h: 9 });
    expect(mister).toHaveLength(1);
    expect(tree).toHaveLength(3);
    expect(tree[0]!).toBeGreaterThan(mister[0]!);
  });
});
