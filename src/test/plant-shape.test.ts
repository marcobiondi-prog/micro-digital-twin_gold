import { describe, expect, it } from "vitest";
import { cardOf, cleanSpecimen, crownDepth, crownRadius, CROWN_KINDS, customModel, genusOf, mixHex, shapeFor } from "@/models/plant-shape";
import { arRecognitionSchema, placePrompt, withPlantAlternatives } from "@/models/ar-recognition";
import { cypressRadius } from "@/views/ar-cypress";
import { lindenRadius } from "@/views/ar-linden";
import { planeRadius } from "@/views/ar-plane";

describe("plant cards", () => {
  it("reads genus and species, hybrid signs and authors aside", () => {
    expect(genusOf("Quercus ilex")).toBe("Quercus");
    expect(cardOf("Salix babylonica")?.crown).toBe("weeping");
    expect(cardOf("Salix alba")?.crown).toBe("round");
    expect(cardOf("Platanus × hispanica Mill.")?.bark).toBe("patchy");
    expect(cardOf("Populus nigra")?.crown).toBe("columnar");
    expect(cardOf("Xyzzia nova")).toBeNull();
  });

  it("gives the stone pine, the Italian cypress, the olive, the lime and the plane tree their own models", () => {
    expect(customModel("Pinus pinea", "round")).toBe("stonePine");
    expect(customModel("Pinus halepensis", "umbrella")).toBe("stonePine");
    expect(customModel("Pinus nigra", "conical")).toBeNull();
    expect(customModel("Cupressus sempervirens", "conical")).toBe("cypress");
    expect(customModel("Cupressus arizonica", "conical")).toBeNull();
    expect(customModel("Olea europaea", "round")).toBe("olive");
    expect(customModel("Tilia cordata", "round")).toBe("linden");
    expect(customModel("Tilia platyphyllos", "ovoid")).toBe("linden");
    expect(customModel("Platanus × hispanica", "round")).toBe("plane");
    expect(customModel("Platanus orientalis", "spreading")).toBe("plane");
    expect(customModel("Acer campestre", "round")).toBeNull();
  });
});

describe("shapeFor", () => {
  it("takes the species' card without a specimen", () => {
    const s = shapeFor("Tilia cordata", "round", false, null);
    expect(s).toMatchObject({ crown: "ovoid", leaf: "broad", stems: 1 });
    expect(s.density).toBeGreaterThan(0.7);
  });

  it("lets the specimen win for its own shape, but not for the leaf kind, and only tint the colours", () => {
    const s = shapeFor("Tilia cordata", "round", false, { crown: "round", widthRatio: 1.2, density: 0.4, stems: 2, leanDeg: 8, leaf: "needle", leafColor: "#ffffff" });
    expect(s).toMatchObject({ crown: "round", widthRatio: 1.2, density: 0.4, stems: 2, leanDeg: 8, leaf: "broad" });
    expect(s.leafColor).toBe(mixHex("#5b7f3e", "#ffffff", 1 / 3));
  });

  it("falls back on the form for a species without a card, and on the specimen's leaf there", () => {
    expect(shapeFor("Xyzzia nova", "conical", true, null)).toMatchObject({ crown: "conical", leaf: "needle" });
    expect(shapeFor("Xyzzia nova", "shrub", true, null)).toMatchObject({ crown: "shrub", clearTrunk: 0 });
    expect(shapeFor("Xyzzia nova", "round", true, { leaf: "compound" }).leaf).toBe("compound");
  });

  it("keeps every value in range", () => {
    const s = shapeFor("Xyzzia nova", "round", true, { widthRatio: 9, density: -1, clearTrunk: 3, stems: 40, leanDeg: 90 });
    expect(s.widthRatio).toBeLessThanOrEqual(1.6);
    expect(s.density).toBeGreaterThanOrEqual(0.2);
    expect(s.clearTrunk).toBeLessThanOrEqual(0.75);
    expect(s.stems).toBeLessThanOrEqual(8);
    expect(Math.abs(s.leanDeg)).toBeLessThanOrEqual(20);
  });
});

describe("cleanSpecimen", () => {
  it("drops nulls and bad values, clamps numbers, keeps #rrggbb colours", () => {
    expect(cleanSpecimen({ crown: "weeping", widthRatio: 5, density: null, clearTrunk: 0.3, stems: 2.6, leanDeg: null, leaf: "palm", leafColor: "#AABB33", barkColor: "brown" }))
      .toEqual({ crown: "weeping", widthRatio: 2, clearTrunk: 0.3, stems: 3, leafColor: "#aabb33" });
    expect(cleanSpecimen({ crown: null, widthRatio: null })).toBeNull();
    expect(cleanSpecimen(null)).toBeNull();
  });
});

describe("crown outlines", () => {
  it("stay within 0…1 and close at the top (but the umbrella's flat top)", () => {
    for (const c of CROWN_KINDS) {
      for (let f = 0; f <= 1; f += 0.05) {
        const v = crownRadius(c, f);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.05);
      }
      expect(crownRadius(c, 1)).toBeLessThan(0.05);
    }
  });
  it("is low for spreading and umbrella crowns", () => {
    expect(crownDepth("umbrella", 0.3)).toBeLessThan(crownDepth("round", 0.3));
    expect(crownDepth("round", 0.3)).toBeCloseTo(0.7);
  });
  it("makes the lime tree's crown an egg, broadest a little below the middle", () => {
    expect(lindenRadius(0.42)).toBeCloseTo(1);
    expect(lindenRadius(0.1)).toBeLessThan(lindenRadius(0.42));
    expect(lindenRadius(0.8)).toBeLessThan(lindenRadius(0.42));
    expect(lindenRadius(1)).toBe(0);
  });
  it("makes the plane tree's crown a broad dome, widest about a third of the way up", () => {
    expect(planeRadius(0.34)).toBeCloseTo(1);
    expect(planeRadius(0.7)).toBeLessThan(planeRadius(0.34));
    expect(planeRadius(1)).toBe(0);
  });
  it("makes the cypress a flame", () => {
    expect(cypressRadius(0)).toBeLessThan(cypressRadius(0.28));
    expect(cypressRadius(0.28)).toBeGreaterThan(cypressRadius(0.6));
    expect(cypressRadius(1)).toBe(0);
  });
});

describe("recognition schema", () => {
  it("reads a reply without specimen as none, and one with it", () => {
    const base = { identification: null, survey: null, found: true, outline: null, label: "Tiglio", type: "tree", box: { x: 0, y: 0, w: 1, h: 1 }, soil: null,
      plant: { scientificName: "Tilia cordata", commonName: "Tiglio", form: "round", heightM: 15, crownM: 10, evergreen: false, density: 0.8 } };
    expect(arRecognitionSchema.parse(withPlantAlternatives(structuredClone(base))).plant?.specimen).toBeNull();
    const withSpecimen = structuredClone(base) as typeof base & { plant: Record<string, unknown> };
    withSpecimen.plant["alternatives"] = [];
    withSpecimen.plant["specimen"] = { crown: "ovoid", widthRatio: 0.7, density: 0.8, clearTrunk: 0.25, stems: 1, leanDeg: 0, leaf: "broad", leafColor: "#5b7f3e", barkColor: null };
    expect(arRecognitionSchema.parse(withSpecimen).plant?.specimen?.crown).toBe("ovoid");
  });
});

describe("placePrompt", () => {
  it("gives the place to about 1 km and the month, as a tie-breaker only", () => {
    const p = placePrompt({ lat: 45.438551, lng: 10.992549, label: "Piazza Bra, Verona" }, 11);
    expect(p).toContain("Piazza Bra, Verona (45.44, 10.99)");
    expect(p).toContain("novembre");
    expect(p).toContain("spareggio");
  });
  it("says nothing without place nor month", () => {
    expect(placePrompt()).toBe("");
  });
});
