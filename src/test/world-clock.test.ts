import { describe, expect, it } from "vitest";
import { changeCalendar, changeHands, changeNotice, clockOffset, dstShift, placeTime, shiftHour, summerTime, sameClock, utcOffsetText, validTimeZone, zoneName } from "@/models/world-clock";

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
  it("moves an hour between zones", () => {
    const t = Date.UTC(2026, 9, 30, 12);
    expect(shiftHour(13, t, "Europe/Rome", "Asia/Tokyo")).toBe(21);
    expect(shiftHour(2, t, "Europe/Rome", "America/New_York")).toBe(21);
  });
  it("reads the clock in the ora chosen by hand", () => {
    const winter = Date.UTC(2026, 9, 30, 12);
    expect(dstShift(winter, "Europe/Rome", "legale")).toBe(60);
    expect(dstShift(winter, "Europe/Rome", "solare")).toBe(0);
    expect(dstShift(Date.UTC(2026, 6, 1), "Europe/Rome", "solare")).toBe(-60);
    expect(dstShift(winter, "Asia/Tokyo", "legale")).toBe(0);
    expect(dstShift(winter, "Europe/Rome", "auto")).toBe(0);
  });
  it("tells the change around it, once before and once after", () => {
    const at = Date.UTC(2026, 9, 25, 1); // 03:00 legale → 02:00 solare in Rome
    expect(changeHands(at, "Europe/Rome")).toEqual({ from: "03:00", to: "02:00" });
    expect(changeHands(Date.UTC(2027, 2, 28, 1), "Europe/Rome")).toEqual({ from: "02:00", to: "03:00" });
    expect(changeNotice(at - 40 * 3_600_000, "Europe/Rome")).toBeNull();
    expect(changeNotice(at - 30 * 3_600_000, "Europe/Rome")?.text).toBe("Domani notte torna l'ora solare: alle 03:00 le lancette vanno alle 02:00.");
    const before = changeNotice(at - 5 * 3_600_000, "Europe/Rome");
    expect(before?.ahead).toBe(true);
    expect(before?.text.startsWith("Stanotte torna l'ora solare")).toBe(true);
    const after = changeNotice(at + 6 * 3_600_000, "Europe/Rome");
    expect(after?.ahead).toBe(false);
    expect(after?.key).toBe(before?.key);
    expect(after?.text).toContain("è tornata l'ora solare");
    expect(changeNotice(at + 13 * 3_600_000, "Europe/Rome")).toBeNull();
    expect(changeNotice(at, "Asia/Tokyo")).toBeNull();
  });
  it("writes a calendar reminder the evening before", () => {
    const ics = changeCalendar(Date.UTC(2026, 9, 25, 1), "solare", { from: "03:00", to: "02:00" }, Date.UTC(2026, 9, 20));
    expect(ics).toContain("DTSTART:20261025T010000Z");
    expect(ics).toContain("TRIGGER:-PT6H");
    expect(ics).toContain("SUMMARY:Torna l'ora solare");
  });
});

describe("place-zone", () => {
  it("finds the zone from the position", async () => {
    const { placeZoneOf } = await import("@/lib/place-zone");
    expect(await placeZoneOf(41.5603, 14.6627)).toBe("Europe/Rome"); // Campobasso
    expect(await placeZoneOf(35.68, 139.69)).toBe("Asia/Tokyo");
    expect(await placeZoneOf(40.71, -74.0)).toBe("America/New_York");
  });
});
