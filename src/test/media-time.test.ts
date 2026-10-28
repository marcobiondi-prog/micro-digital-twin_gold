import { describe, expect, it } from "vitest";
import { mediaTime } from "@/models/media-time";

describe("mediaTime", () => {
  it("reads a guest id", () => expect(mediaTime({ id: "1761600000000-2" })).toBe(1761600000000));
  it("reads an account path", () => expect(mediaTime({ id: "u/urban/1761600000000-foto.jpg", path: "u/urban/1761600000000-foto.jpg" })).toBe(1761600000000));
  it("is null when unknown", () => expect(mediaTime({ id: "abc" })).toBeNull());
});
