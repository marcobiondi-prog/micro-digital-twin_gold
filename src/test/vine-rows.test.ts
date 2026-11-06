import { describe, expect, it } from "vitest";
import { vineLayout, vineRowParts } from "@/models/area-layout";
import { ringContains } from "@/models/place-area";

const ring: Array<[number, number]> = [[41.56, 14.66], [41.56, 14.6612], [41.5609, 14.6612], [41.5609, 14.66]];

describe("vineRowParts", () => {
  const layout = vineLayout(ring, [{ irrigation: 0, shade: 0, windbreak: 0 }, { irrigation: 0, shade: 0, windbreak: 0 }, { irrigation: 0, shade: 0, windbreak: 0 }])!;
  const zones = layout.patches.filter((p) => p.kind === "zone").map((p) => p.ring);
  it("stands rows of vines inside the zones, at most max", () => {
    const parts = vineRowParts(zones, 160, true);
    expect(parts.length).toBeGreaterThan(5);
    expect(parts.length).toBeLessThanOrEqual(160);
    for (const p of parts) for (const [la, ln] of p.ring) expect(ringContains(ring, la, ln)).toBe(true);
    expect(parts.every((p) => p.base === 0 && p.height > 1)).toBe(true);
  });
  it("draws a foot and leaves in the full look", () => {
    expect(vineRowParts(zones, 160).length).toBe(vineRowParts(zones, 160, true).length * 3);
  });
});
