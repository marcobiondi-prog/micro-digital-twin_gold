import { describe, expect, it } from "vitest";
import { momentsOf } from "@/models/shot-moments";
import { shotTag } from "@/models/shot-kind";

const m = 60_000;
describe("shot moments", () => {
  it("gathers shots close in time, newest first", () => {
    const t = Date.UTC(2026, 10, 25, 10);
    const ms = momentsOf([
      { id: "a", at: t }, { id: "b", at: t + 5 * m }, { id: "c", at: t + 22 * m }, { id: "d", at: t + 90 * m }, { id: "x", at: null },
    ]);
    expect(ms.map((x) => x.shots.map((s) => s.id))).toEqual([["d"], ["c", "b", "a"]]);
    expect(ms[1]!.at).toBe(t + 22 * m);
    expect(ms[1]!.first).toBe(t);
  });
});

describe("shot tags", () => {
  it("tells AR from AI", () => {
    expect(shotTag({ name: "foto-ar-prova-1.jpg", kind: "image" })).toBe("ar");
    expect(shotTag({ name: "foto-ar-prova-multiplo-1.jpg", kind: "image" })).toBe("ar");
    expect(shotTag({ name: "foto-ar-specie-1.jpg", kind: "image" })).toBe("ai");
    expect(shotTag({ name: "multiplo-1.jpg", kind: "image" })).toBe("multiplo");
    expect(shotTag({ name: "IMG_1.mp4", kind: "video" })).toBe("video");
    expect(shotTag({ name: "foto-1.jpg", kind: "image" })).toBe("foto");
  });
});
