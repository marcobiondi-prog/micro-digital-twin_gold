import { describe, expect, it } from "vitest";
import { shotKind, shotLabel } from "@/models/shot-kind";
describe("AR and AI labels", () => {
  it("tells the AR view's photos from the scans'", () => {
    expect(shotLabel({ name: "foto-ar-prova-123.jpg", kind: "image" })).toBe("AR");
    expect(shotLabel({ name: "foto-ar-prova-multiplo-123.jpg", kind: "image" })).toBe("AR · Multiplo");
    expect(shotLabel({ name: "foto-ar-albero-multiplo-123.jpg", kind: "image" })).toBe("AI · Multiplo");
    expect(shotLabel({ name: "Lotto A - foto-ar-albero-123.jpg", kind: "image" })).toBe("AI");
    expect(shotKind({ name: "foto-ar-prova-123.jpg", kind: "image" })).toBe("ai");
  });
});
