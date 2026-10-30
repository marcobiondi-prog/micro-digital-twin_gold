import { describe, expect, it } from "vitest";
import { clockOffset, placeTime, shiftHour, summerTime, zoneOptions, sameClock, utcOffsetText, validTimeZone, zoneName } from "@/models/world-clock";

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
  it("tells ora solare from ora legale and when it changes", () => {
    const rome = summerTime(Date.UTC(2026, 6, 1), "Europe/Rome");
    expect(rome.kind).toBe("legale");
    expect(rome.next).toEqual({ at: Date.UTC(2026, 9, 25, 1, 0), to: "solare" }); // 03:00 legale → 02:00 solare
    const winter = summerTime(Date.UTC(2026, 9, 30, 12), "Europe/Rome");
    expect(winter.kind).toBe("solare");
    expect(winter.next).toEqual({ at: Date.UTC(2027, 2, 28, 1, 0), to: "legale" });
    expect(summerTime(Date.UTC(2026, 6, 1), "Asia/Tokyo")).toEqual({ kind: "nessuna", next: null });
    expect(summerTime(Date.UTC(2026, 6, 1), "Australia/Sydney").kind).toBe("solare");
  });
  it("lists zones by offset and moves an hour between zones", () => {
    const t = Date.UTC(2026, 9, 30, 12);
    const list = zoneOptions(t);
    expect(list.find((o) => o.tz === "Europe/Rome")?.label).toBe("UTC+1 · Rome (Europa)");
    expect(list.find((o) => o.tz === "UTC")?.label).toBe("UTC · Tempo universale");
    expect(list.every((o, i) => i === 0 || list[i - 1]!.offset <= o.offset)).toBe(true);
    expect(list.some((o) => o.tz.startsWith("Etc/"))).toBe(false);
    expect(shiftHour(13, t, "Europe/Rome", "Asia/Tokyo")).toBe(21);
    expect(shiftHour(2, t, "Europe/Rome", "America/New_York")).toBe(21);
  });
});
