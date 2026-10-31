import { describe, expect, it } from "vitest";
import { kindCountText, shotKind } from "@/models/shot-kind";

describe("shot kinds", () => {
  it("reads the kind from the file name, also with a zone or an upload prefix", () => {
    expect(shotKind({ name: "foto-ar-1790000000000.jpg", kind: "image" })).toBe("ai");
    expect(shotKind({ name: "0-ab12c-Lotto_A_-_video-ar-specie-17.webm", kind: "video" })).toBe("ai");
    expect(shotKind({ name: "multiplo-1790000000000.jpg", kind: "image" })).toBe("multiplo");
    expect(shotKind({ name: "0-x1y2z-multiplo-17.jpg", kind: "image" })).toBe("multiplo");
    expect(shotKind({ name: "IMG_2041.mp4", kind: "video" })).toBe("video");
    expect(shotKind({ name: "foto-1790000000000.jpg", kind: "image" })).toBe("foto");
  });
  it("counts only the kinds there are", () => {
    expect(kindCountText([{ name: "a.jpg", kind: "image" }, { name: "multiplo-1.jpg", kind: "image" }, { name: "multiplo-2.jpg", kind: "image" }, { name: "v.mp4", kind: "video" }]))
      .toBe("1 foto · 2 scatti multipli · 1 video");
  });
});

describe("shot labels", () => {
  it("labels every kind, the AI camera's multiple shot included", async () => {
    const { shotLabel } = await import("@/models/shot-kind");
    expect(shotLabel({ name: "IMG_1.jpg", kind: "image" })).toBe("Foto");
    expect(shotLabel({ name: "multiplo-1.jpg", kind: "image" })).toBe("Multiplo");
    expect(shotLabel({ name: "foto-ar-specie-multiplo-17.jpg", kind: "image" })).toBe("AI · Multiplo");
    expect(shotLabel({ name: "foto-ar-17.jpg", kind: "image" })).toBe("AI");
    expect(shotLabel({ name: "v.mp4", kind: "video" })).toBe("Video");
  });
});
