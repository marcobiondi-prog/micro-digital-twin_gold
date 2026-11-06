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
