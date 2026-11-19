import { describe, expect, it } from "vitest";
import { CLOUD_QUOTA, bytesText, usageTone } from "@/lib/use-cloud-usage";

describe("cloud space", () => {
  it("is 50 GB and written in Italian units", () => {
    expect(CLOUD_QUOTA).toBe(50 * 1024 ** 3);
    expect(bytesText(512)).toBe("512 B");
    expect(bytesText(1.5 * 1024 ** 2)).toBe("1,5 MB");
    expect(bytesText(12 * 1024 ** 3)).toBe("12 GB");
  });
  it("blends from turquoise to red as the space fills", () => {
    expect(usageTone(0)).toBe("rgb(45, 212, 191)");
    expect(usageTone(0.72)).toBe("rgb(250, 204, 21)");
    expect(usageTone(1)).toBe("rgb(239, 68, 68)");
    expect(usageTone(2)).toBe("rgb(239, 68, 68)");
    const red = (s: number) => Number(/rgb\((\d+)/.exec(usageTone(s))![1]);
    expect(red(0.95)).toBeGreaterThan(red(0.6));
  });
});
