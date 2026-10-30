import { describe, expect, it } from "vitest";
import { clockOffset, placeTime, sameClock, utcOffsetText, validTimeZone, zoneName } from "@/models/world-clock";

describe("world-clock", () => {
  const t = Date.UTC(2026, 9, 30, 12, 7); // 30 Oct 2026, 12:07 UTC
  it("reads the instant in the place's own zone", () => {
    expect(placeTime(t, "Europe/Rome")).toEqual({ month: 9, hour: 13, minute: 7 });
    expect(placeTime(t, "Asia/Tokyo")).toEqual({ month: 9, hour: 21, minute: 7 });
    expect(placeTime(t, "America/New_York")).toEqual({ month: 9, hour: 8, minute: 7 });
    expect(placeTime(t, "Asia/Kolkata")).toEqual({ month: 9, hour: 17, minute: 37 });
    expect(placeTime(Date.UTC(2026, 11, 31, 23, 30), "Asia/Tokyo").month).toBe(0);
  });
  it("writes the UTC offset with summer time", () => {
    expect(utcOffsetText(t, "Europe/Rome")).toBe("UTC+1");
    expect(utcOffsetText(Date.UTC(2026, 6, 1), "Europe/Rome")).toBe("UTC+2");
    expect(utcOffsetText(t, "America/New_York")).toBe("UTC−4");
    expect(utcOffsetText(t, "Asia/Kolkata")).toBe("UTC+5:30");
    expect(utcOffsetText(t, "UTC")).toBe("UTC");
    expect(sameClock(t, "Europe/Rome", "Europe/Paris")).toBe(true);
    expect(sameClock(t, "Europe/Rome", "Asia/Tokyo")).toBe(false);
  });
  it("names zones and refuses unknown ones", () => {
    expect(zoneName(t, "Asia/Tokyo").length).toBeGreaterThan(0);
    expect(validTimeZone("Europe/Rome")).toBe("Europe/Rome");
    expect(validTimeZone("Mars/Base")).toBeNull();
    expect(validTimeZone(null)).toBeNull();
  });
  it("takes half the round trip off the server reading", () => {
    expect(clockOffset(10_100, 1_000, 1_200)).toBe(9_000);
  });
});
