import { describe, expect, it } from "vitest";
import { openLicence, pickGbifPhoto, pickPowoPhoto, wholePlantScore } from "@/models/ar-reference-photo";

describe("ar-reference-photo", () => {
  it("takes the Kew image of the accepted species and links its POWO page", () => {
    const json = { results: [
      { name: "Quercus ilex subsp. ballota", accepted: true, url: "/taxon/x", images: [{ fullsize: "//cdn.kew/x.jpg" }] },
      { name: "Quercus ilex", accepted: false, url: "/taxon/syn", images: [{ fullsize: "//cdn.kew/syn.jpg" }] },
      { name: "Quercus ilex", accepted: true, url: "/taxon/urn:lsid:ipni.org:names:296175-1", images: [{ thumbnail: "//cdn.kew/t.jpg", fullsize: "//cdn.kew/f.jpg", caption: "Habit" }] },
    ] };
    expect(pickPowoPhoto(json, "Quercus  ilex")).toEqual({
      url: "https://cdn.kew/f.jpg",
      credit: "Royal Botanic Gardens, Kew · Plants of the World Online · Habit",
      link: "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:296175-1",
    });
  });

  it("has no Kew photo without a matching result or image", () => {
    expect(pickPowoPhoto({ results: [{ name: "Quercus ilex", accepted: true, images: [] }] }, "Quercus ilex")).toBeNull();
    expect(pickPowoPhoto({ results: [{ name: "Quercus suber", images: [{ fullsize: "//cdn.kew/s.jpg" }] }] }, "Quercus ilex")).toBeNull();
    expect(pickPowoPhoto(null, "Quercus ilex")).toBeNull();
  });

  it("only shows openly licensed GBIF photos, crediting the author", () => {
    expect(openLicence("http://creativecommons.org/licenses/by-nc/4.0/")).toBe("CC BY-NC");
    expect(openLicence("http://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0");
    expect(openLicence("All rights reserved")).toBeNull();
    const json = { results: [
      { key: 1, media: [{ type: "StillImage", identifier: "https://img/1.jpg", license: "All rights reserved" }] },
      { key: 2, media: [{ type: "Sound", identifier: "https://img/2.mp3", license: "http://creativecommons.org/licenses/by/4.0/" },
        { type: "StillImage", identifier: "https://img/2.jpg", license: "http://creativecommons.org/licenses/by/4.0/", creator: "Ada" }] },
    ] };
    expect(pickGbifPhoto(json)).toEqual({ url: "https://img/2.jpg", credit: "Ada · CC BY · via GBIF", link: "https://www.gbif.org/occurrence/2" });
  });

  it("prefers a photo of the whole plant over a leaf, flower or herbarium sheet", () => {
    expect(wholePlantScore("Quercus ilex – habit")).toBeGreaterThan(wholePlantScore("Quercus ilex"));
    expect(wholePlantScore("Leaves and acorns")).toBeLessThan(0);
    expect(wholePlantScore("Herbarium specimen")).toBeLessThan(0);
    const powo = { results: [{ name: "Quercus ilex", accepted: true, url: "/taxon/q", images: [
      { fullsize: "//cdn.kew/leaf.jpg", caption: "Leaves" },
      { fullsize: "//cdn.kew/plain.jpg" },
      { fullsize: "//cdn.kew/habit.jpg", caption: "Habit" },
    ] }] };
    expect(pickPowoPhoto(powo, "Quercus ilex")?.url).toBe("https://cdn.kew/habit.jpg");
    // Without a habit caption Kew only yields its uncaptioned photo, and only when GBIF has nothing better.
    const plain = { results: [{ name: "Quercus ilex", accepted: true, images: [{ fullsize: "//cdn.kew/leaf.jpg", caption: "Leaf" }, { fullsize: "//cdn.kew/plain.jpg" }] }] };
    expect(pickPowoPhoto(plain, "Quercus ilex", true)).toBeNull();
    expect(pickPowoPhoto(plain, "Quercus ilex")?.url).toBe("https://cdn.kew/plain.jpg");
    const gbif = { results: [
      { key: 7, basisOfRecord: "PRESERVED_SPECIMEN", media: [{ type: "StillImage", identifier: "https://img/sheet.jpg", license: "CC0" }] },
      { key: 8, basisOfRecord: "HUMAN_OBSERVATION", media: [{ type: "StillImage", identifier: "https://img/flower.jpg", license: "CC0", title: "Flower close-up" },
        { type: "StillImage", identifier: "https://img/tree.jpg", license: "CC0", title: "Whole tree in habitat" }] },
    ] };
    expect(pickGbifPhoto(gbif)?.url).toBe("https://img/tree.jpg");
  });
});
