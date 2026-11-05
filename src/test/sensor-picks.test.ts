import { describe, expect, it } from "vitest";
import { cleanPicks, fallbackPicks, metres, readModelJson, MIN_GAP_M } from "@/models/sensor-picks";

const C = { lat: 41.558, lng: 14.66 };
const at = (n: number, e: number) => ({ lat: C.lat + n / 111_320, lng: C.lng + e / (111_320 * Math.cos((C.lat * Math.PI) / 180)) });
const pois = [
  { kind: "school", name: "Scuola Petrone", ...at(400, 100) },
  { kind: "nursing_home", name: "RSA Molise", ...at(-500, -300) },
  { kind: "bus_stop", name: "", ...at(120, 600) },
  { kind: "park", name: "Villa de Capoa", ...at(-200, 700) },
];

describe("sensor suggestions", () => {
  it("reads the model's JSON inside fences and with trailing commas", () => {
    expect(readModelJson('Ecco:\n```json\n{"sintesi":"ok","sensori":[{"nome":"A",},],}\n```')).toEqual({ sintesi: "ok", sensori: [{ nome: "A" }] });
    expect(readModelJson("nessun json")).toBeNull();
  });
  it("always gives at least three picks from the data, the most vulnerable first, away from sensors", () => {
    const sensors = [{ ...at(380, 90), temp: 24 }];
    const picks = fallbackPicks("urban", C.lat, C.lng, sensors, pois);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    for (const p of picks) for (const s of sensors) expect(metres(p, s)).toBeGreaterThanOrEqual(MIN_GAP_M);
    expect(picks.some((p) => p.nome.includes("Scuola Petrone"))).toBe(false);
    expect(picks.find((p) => p.nome.includes("RSA"))?.priorita).toBe("alta");
  });
  it("gives a vineyard its slopes when there are no places", () => {
    const picks = fallbackPicks("vineyard", C.lat, C.lng, [], []);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    expect(picks.some((p) => p.nome === "Versante sud")).toBe(true);
  });
  it("drops the AI's points out of the area or on a sensor and fills up to three", () => {
    const raw = [
      { nome: "Lontano", luogo: "x", ...at(5000, 0), priorita: "alta", motivi: ["a"] },
      { nome: "Sul sensore", luogo: "y", ...at(0, 20), priorita: "alta", motivi: ["b"] },
      { nome: "Buono", luogo: "", ...at(-500, -290), priorita: "alta", motivi: [] },
    ];
    const { picks, filled } = cleanPicks(raw, "urban", C.lat, C.lng, [{ ...at(0, 0), temp: null }], pois);
    expect(picks.map((p) => p.nome)).toContain("Buono");
    expect(picks.some((p) => p.nome === "Lontano" || p.nome === "Sul sensore")).toBe(false);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    expect(filled).toBeGreaterThan(0);
    expect(picks.find((p) => p.nome === "Buono")!.luogo).not.toBe("");
  });
});
