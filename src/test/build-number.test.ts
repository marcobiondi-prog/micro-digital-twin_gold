import { describe, expect, it } from "vitest";
import { buildLabel, buildNumber } from "@/lib/app-version";

describe("build number", () => {
  it("counts minutes from 2026-01-01 UTC, with no date nor time", () => {
    expect(buildNumber("2026-01-01T00:00:00.000Z")).toBe(0);
    expect(buildNumber("2026-01-02T00:01:30.000Z")).toBe(1441);
    expect(buildLabel("2026-01-02T00:01:30.000Z")).toBe("Build 1441");
    expect(buildLabel(null)).toBe("sviluppo");
  });
  it("grows with every later build", () => {
    expect(buildNumber("2026-11-07T05:09:00Z")!).toBeGreaterThan(buildNumber("2026-11-07T05:08:00Z")!);
  });
});
