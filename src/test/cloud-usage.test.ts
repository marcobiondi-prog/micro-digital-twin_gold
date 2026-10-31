import { describe, expect, it } from "vitest";
import { CLOUD_QUOTA, bytesText, usageTone } from "@/lib/use-cloud-usage";

describe("cloud space", () => {
  it("is 50 GB and written in Italian units", () => {
    expect(CLOUD_QUOTA).toBe(50 * 1024 ** 3);
    expect(bytesText(512)).toBe("512 B");
    expect(bytesText(1.5 * 1024 ** 2)).toBe("1,5 MB");
    expect(bytesText(12 * 1024 ** 3)).toBe("12 GB");
  });
  it("turns amber past 80 % and red past 95 %", () => {
    expect(usageTone(0.5)).toContain("turquoise");
    expect(usageTone(0.85)).toBe("#f59e0b");
    expect(usageTone(0.97)).toContain("danger");
  });
});
