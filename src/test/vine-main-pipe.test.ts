import { describe, expect, it } from "vitest";
import { vineLayout } from "@/models/area-layout";
import { ringContains } from "@/models/place-area";

// A vineyard whose western side is a curve (a quarter of a circle) and slanted on the east.
const lat0 = 41.56, lng0 = 14.66, k = 111_320 * Math.cos((lat0 * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [lat0 + y / 111_320, lng0 + x / k];
const ring: Array<[number, number]> = [
  ...Array.from({ length: 9 }, (_, i) => { const t = (Math.PI / 2) * (i / 8); return at(40 - 40 * Math.cos(t), 40 * Math.sin(t) - 0); }),
  at(140, 60), at(120, 0),
];

describe("vineyard main pipe", () => {
  const layout = vineLayout(ring, [16, 16, 16].map((irrigation) => ({ irrigation, shade: 0, windbreak: 0 })))!;
  const mains = layout.lines.filter((l) => l.kind === "main");
  it("follows the zone's western edge row by row and stays inside the area", () => {
    expect(mains.length).toBe(3);
    for (const m of mains) {
      expect(m.line.length).toBeGreaterThan(2);
      for (const [la, ln] of m.line) expect(ringContains(ring, la, ln)).toBe(true);
    }
    // On the curved side the pipe bends: its points do not all share one longitude.
    const west = mains[0]!.line.map((p) => p[1]);
    expect(Math.max(...west) - Math.min(...west)).toBeGreaterThan(1e-5);
  });
});

describe("vineyard zones with an intervention", () => {
  it("lays drip lines, cloth and a hedge where the zones are drawn", async () => {
    const { vineLayout } = await import("@/models/area-layout");
    const lat = 41.8, lng = 14.9, dLat = 60 / 111320, dLng = 80 / (111320 * Math.cos((lat * Math.PI) / 180));
    const ring: Array<[number, number]> = [[lat - dLat, lng - dLng], [lat - dLat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng - dLng]];
    const box = (a: number, b: number): Array<[number, number]> => [[lat - dLat / 2, lng + dLng * a], [lat - dLat / 2, lng + dLng * b], [lat + dLat / 2, lng + dLng * b], [lat + dLat / 2, lng + dLng * a]];
    const none = { irrigation: 0, shade: 0, windbreak: 0 };
    const plain = vineLayout(ring, [none, none, none])!;
    const zoned = vineLayout(ring, [none, none, none], {}, [{ kind: "irrigazione", ring: box(-0.8, -0.3) }, { kind: "teli", ring: box(-0.2, 0.3) }, { kind: "frangivento", ring: box(0.4, 0.9) }])!;
    expect(plain.lines.filter((l) => l.kind === "drip").length).toBe(0);
    expect(zoned.lines.filter((l) => l.kind === "drip").length).toBeGreaterThan(0);
    expect(zoned.lines.some((l) => l.kind === "main")).toBe(true);
    expect(zoned.patches.some((p) => p.kind === "cloth")).toBe(true);
    expect(zoned.lines.some((l) => l.kind === "wind")).toBe(true);
  });
});

describe("vineyard: only what was drawn", () => {
  it("keeps the levers' cloth, drip lines and hedge off, the zones' ones on", async () => {
    const { vineLayout } = await import("@/models/area-layout");
    const lat = 41.8, lng = 14.9, dLat = 60 / 111320, dLng = 80 / (111320 * Math.cos((lat * Math.PI) / 180));
    const ring: Array<[number, number]> = [[lat - dLat, lng - dLng], [lat - dLat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng - dLng]];
    const full = { irrigation: 20, shade: 100, windbreak: 100 };
    const zone: Array<[number, number]> = [[lat - dLat / 2, lng - dLng / 2], [lat - dLat / 2, lng], [lat + dLat / 2, lng], [lat + dLat / 2, lng - dLng / 2]];
    const auto = vineLayout(ring, [full, full, full])!;
    const only = vineLayout(ring, [full, full, full], { onlyDrawn: true }, [{ kind: "teli", ring: zone }])!;
    expect(only.lines.filter((l) => l.kind === "drip").length).toBe(0);
    expect(only.lines.some((l) => l.kind === "wind")).toBe(false);
    expect(only.patches.filter((p) => p.kind === "cloth").length).toBeGreaterThan(0);
    expect(only.patches.filter((p) => p.kind === "cloth").length).toBeLessThan(auto.patches.filter((p) => p.kind === "cloth").length);
  });
});
