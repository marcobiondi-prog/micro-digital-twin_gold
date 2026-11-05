import type { Season } from "./season-climate";
import type { SunPos } from "./area-layout";
import { sunPath } from "./sun-exposure";

/**
 * Where the sun stands at the simulation's season and hour, for the shadows drawn on the map. The day is the middle of
 * the season (meteorological seasons, as the place's year is read: winter Dec–Feb, spring Mar–May, …); the clock hour
 * is turned to solar time from the place's longitude (its zone taken as the nearest 15° meridian) and an hour less with
 * ora legale.
 */
export const SEASON_DAY: Record<Season, number> = { inverno: 15, primavera: 105, estate: 197, autunno: 289 };

export function solarHour(clock: number, lng: number, dst?: "solare" | "legale"): number {
  return clock - (dst === "legale" ? 1 : 0) + (lng - 15 * Math.round(lng / 15)) / 15;
}

/** The sun at that season and clock time over (lat, lng); null when it is below the horizon. */
export function sunAt(lat: number, lng: number, season: Season, hour: number, minute = 0, dst?: "solare" | "legale"): SunPos | null {
  return sunPath(lat, SEASON_DAY[season], [solarHour(hour + minute / 60, lng, dst)])[0] ?? null;
}

/** The sun's height (degrees, negative below the horizon) at that season and clock time over (lat, lng). */
export function sunHeightDeg(lat: number, lng: number, season: Season, hour: number, minute = 0, dst?: "solare" | "legale"): number {
  const rad = Math.PI / 180, day = SEASON_DAY[season];
  const decl = 23.44 * rad * Math.sin(((2 * Math.PI) / 365) * (284 + day));
  const h = 15 * (solarHour(hour + minute / 60, lng, dst) - 12) * rad, phi = lat * rad;
  return Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(h)) / rad;
}

export type DayPhase = "giorno" | "alba" | "tramonto" | "notte";
/**
 * The light of the map at the simulation's hour: full day above 10°, the golden hour of dawn or dusk down to the
 * horizon, twilight to −6° and night below; `veil` is the colour laid over the map (none by day).
 */
export function dayLight(height: number, morning: boolean): { phase: DayPhase; veil: string | null } {
  if (height >= 10) return { phase: "giorno", veil: null };
  if (height >= 0) {
    const k = 1 - height / 10;
    return { phase: morning ? "alba" : "tramonto", veil: `rgba(255, 140, 60, ${(0.08 + 0.14 * k).toFixed(3)})` };
  }
  if (height >= -6) {
    const k = -height / 6;
    return { phase: morning ? "alba" : "tramonto", veil: `rgba(${Math.round(120 - 95 * k)}, ${Math.round(70 - 45 * k)}, ${Math.round(90 - 10 * k)}, ${(0.25 + 0.3 * k).toFixed(3)})` };
  }
  return { phase: "notte", veil: "rgba(10, 18, 50, 0.5)" };
}
