import { describe, expect, it } from "vitest";
import { genusOf, plantProfile, presetName } from "@/models/plant-profile";

describe("plantProfile", () => {
  it("reads the genus from the scientific name", () => {
    expect(genusOf("Quercus ilex")).toBe("Quercus");
    expect(genusOf("  platanus × hispanica ")).toBe("Platanus");
    expect(genusOf("")).toBe("");
  });

  it("gives known genera their own bark and leaves", () => {
    expect(plantProfile("Betula pendula", "round", false)).toMatchObject({ base: "Aspen", bark: "birch" });
    expect(plantProfile("Cupressus sempervirens", "columnar", true)).toMatchObject({ base: "Pine", squeeze: 0.35 });
    expect(plantProfile("Olea europaea", "round", true)).toMatchObject({ leaves: "ash", leafShare: 2.4 });
    expect(plantProfile("Platanus × hispanica", "round", false).bark).toBe("birch");
  });

  it("tells evergreen oaks and the umbrella pine apart", () => {
    expect(plantProfile("Quercus ilex", "round", true).leafTint).toBeDefined();
    expect(plantProfile("Quercus robur", "round", false).leafTint).toBeUndefined();
    expect(plantProfile("Pinus pinea", "umbrella", true)).toMatchObject({ base: "Ash", bark: "pine" });
    expect(plantProfile("Pinus nigra", "conical", true).base).toBe("Pine");
  });

  it("falls back on the form for an unknown genus", () => {
    expect(plantProfile("Xyzzia nova", "conical", true).base).toBe("Pine");
    expect(plantProfile("Xyzzia nova", "shrub", false).base).toBe("Bush");
    expect(plantProfile(undefined, "round", false).base).toBe("Aspen");
    expect(plantProfile(undefined, "round", true).base).toBe("Oak");
  });

  it("names the preset by size", () => {
    expect(presetName("Oak", 4)).toBe("Oak Small");
    expect(presetName("Oak", 9)).toBe("Oak Medium");
    expect(presetName("Pine", 20)).toBe("Pine Large");
    expect(presetName("Bush", 1, 4)).toBe("Bush 2");
  });
});

import { placePrompt } from "@/models/ar-recognition";

describe("placePrompt", () => {
  it("gives the place to about 1 km and the month, as a tie-breaker only", () => {
    const p = placePrompt({ lat: 45.438551, lng: 10.992549, label: "Piazza Bra, Verona" }, 11);
    expect(p).toContain("Piazza Bra, Verona (45.44, 10.99)");
    expect(p).toContain("novembre");
    expect(p).toContain("spareggio");
    expect(p).not.toContain("45.4385");
  });
  it("says nothing without place nor month", () => {
    expect(placePrompt()).toBe("");
    expect(placePrompt(undefined, 4)).toContain("aprile");
  });
});
