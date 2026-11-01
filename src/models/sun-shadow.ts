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
