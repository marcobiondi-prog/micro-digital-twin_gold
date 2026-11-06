import { describe, expect, it } from "vitest";
import { bedParts, BEDS_3D } from "@/models/area-layout";
import { ringContains, ringAreaM2, type Ring } from "@/models/place-area";

const lat = 41.56, lng = 14.66, k = 111_320 * Math.cos((lat * Math.PI) / 180);
const box = (w: number, h: number, dx = 0, dy = 0): Ring => [[lat + dy / 111_320, lng + dx / k], [lat + dy / 111_320, lng + (dx + w) / k], [lat + (dy + h) / 111_320, lng + (dx + w) / k], [lat + (dy + h) / 111_320, lng + dx / k]];
const grass = (c: string) => (BEDS_3D.grass as readonly string[]).includes(c);

describe("aiuole e ciottoli in 3D, like the 2D pattern", () => {
  it("lays a pebble ground and north–south beds of grass 1,2 m wide with 0,4 m of path between them", () => {
    const patch = box(21, 12);
    const { beds, parts } = bedParts([patch]);
    expect(beds.length).toBeGreaterThanOrEqual(8);
    for (const b of beds) for (const [a, c] of b) expect(ringContains(box(21.01, 12.01, -0.005, -0.005), a, c)).toBe(true);
    const green = beds.reduce((t, b) => t + ringAreaM2(b), 0);
    expect(green / ringAreaM2(patch)).toBeGreaterThan(0.68);
    expect(green / ringAreaM2(patch)).toBeLessThan(0.85);
    // No ground sheet: the paths are pebbles only, packed.
    expect(parts.filter((p) => p.color === BEDS_3D.pebbles)).toHaveLength(0);
    expect(parts.filter((p) => (BEDS_3D.stones as readonly string[]).includes(p.color)).length).toBeGreaterThan(100);
    expect(parts.filter((p) => grass(p.color))).toHaveLength(beds.length);
    expect(parts.every((p) => p.height > p.base && p.base > 0)).toBe(true);
  });
  it("runs the beds along the longest side, across neighbouring row strips", () => {
    const rows = [box(12, 3, 0, 0), box(12, 3, 0, 3), box(12, 3, 0, 6)];
    expect(bedParts(rows).beds).toHaveLength(6);
  });
  it("follows a zone traced at an angle: beds parallel to its long side and cut to its outline", () => {
    const P = (x: number, y: number): [number, number] => [lat + y / 111_320, lng + x / k];
    const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6);
    const R = (x: number, y: number) => P(x * c - y * sn, x * sn + y * c);
    const zone: Ring = [R(0, 0), R(20, 0), R(20, 8), R(0, 8)];
    const { beds } = bedParts([zone]);
    expect(beds.length).toBeGreaterThanOrEqual(4);
    for (const b of beds) {
      // Every corner inside the zone (a hair of tolerance on its edges).
      for (const [a2, b2] of b) expect(ringContains([R(-0.05, -0.05), R(20.05, -0.05), R(20.05, 8.05), R(-0.05, 8.05)], a2, b2)).toBe(true);
      // Long side at 30°, like the zone's.
      const xs = b.map(([la, ln]) => [(ln - lng) * k, (la - lat) * 111_320] as const);
      let best = 0, ang = 0;
      xs.forEach((p, i) => { const q = xs[(i + 1) % xs.length]!; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d > best) { best = d; ang = Math.atan2(q[1] - p[1], q[0] - p[0]); } });
      expect(Math.abs(Math.sin(ang - Math.PI / 6))).toBeLessThan(0.02);
    }
  });
  it("keeps the pieces few on a big lawn and is the same every time", () => {
    expect(bedParts([box(300, 40)]).beds.length).toBeLessThanOrEqual(50);
    expect(bedParts([box(30, 20)])).toEqual(bedParts([box(30, 20)]));
    expect(bedParts([]).parts).toHaveLength(0);
  });
  it("never reaches past the drawn area", () => {
    const area: Ring = [[lat, lng], [lat, lng + 10 / k], [lat + 12 / 111_320, lng + 20 / k], [lat + 12 / 111_320, lng]];
    const { beds, parts } = bedParts([box(21, 12)], 50, area);
    expect(beds.length).toBeGreaterThan(3);
    for (const p of parts) for (const [a, c] of p.ring) expect(ringContains([[lat - 1e-6, lng - 1e-6], [lat - 1e-6, lng + 10.3 / k], [lat + 12.1 / 111_320, lng + 20.3 / k], [lat + 12.1 / 111_320, lng - 1e-6]], a, c)).toBe(true);
  });
});

import { piazzaLayout } from "@/models/area-layout";
describe("aiuole zone in 3D", () => {
  it("keeps the beds inside a zone drawn for them when the lever was only raised to fill it", () => {
    const P = (x: number, y: number): [number, number] => [lat + y / 111_320, lng + x / k];
    const area: Ring = [P(0, 0), P(90, -10), P(100, 60), P(10, 75)];
    const zone: Ring = [P(30, 20), P(52, 18), P(55, 32), P(33, 35)];
    const l = piazzaLayout(area, 0, 10, 0, {}, [{ kind: "prato", ring: zone }], 0)!;
    const lawn = l.patches.filter((p) => p.kind === "lawn");
    expect(lawn).toHaveLength(1);
    const { parts } = bedParts(lawn.map((p) => p.ring), 40, area);
    expect(parts.length).toBeLessThan(200);
  });
});
