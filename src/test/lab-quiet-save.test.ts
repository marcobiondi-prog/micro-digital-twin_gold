import { describe, expect, it } from "vitest";
import { getLab, setUrban, setVineyard } from "@/models/lab-store";

describe("lab store saves only real changes", () => {
  it("does not mark a save when nothing changes", () => {
    setUrban({ trees: 7 });
    const at = getLab().savedAt;
    setUrban({ trees: 7, permeable: getLab().urban.permeable });
    expect(getLab().savedAt).toBe(at);
  });
  it("keeps a GPS step within the place without marking a save", async () => {
    setUrban({ location: { label: "Prova", lat: 41.56, lng: 14.66 } });
    const at = getLab().savedAt;
    await new Promise((r) => setTimeout(r, 2));
    setUrban({ location: { label: "Prova", lat: 41.56005, lng: 14.66005 } });
    expect(getLab().urban.location.lat).toBe(41.56005);
    expect(getLab().savedAt).toBe(at);
  });
  it("marks a save for a lever, not for the season's air", async () => {
    const at = getLab().savedAt;
    await new Promise((r) => setTimeout(r, 2));
    setVineyard({ climateKey: "estate-15-x", zones: getLab().vineyard.zones.map((z) => ({ ...z, temperature: 30 })) });
    expect(getLab().savedAt).toBe(at);
    setUrban({ trees: 9 });
    expect(getLab().savedAt).not.toBe(at);
  });
});
