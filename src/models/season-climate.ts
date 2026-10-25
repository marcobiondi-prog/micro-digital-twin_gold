export const SEASONS = ["inverno", "primavera", "estate", "autunno"] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_LABEL: Record<Season, string> = { inverno: "Inverno", primavera: "Primavera", estate: "Estate", autunno: "Autunno" };

/** Meteorological seasons: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn. */
export function seasonOfMonth(month0: number): Season {
  return month0 === 11 || month0 <= 1 ? "inverno" : month0 <= 4 ? "primavera" : month0 <= 7 ? "estate" : "autunno";
}

/** Average perceived temperature for each season and each hour of the day (local time), null where no data. */
export type SeasonProfile = Record<Season, Array<number | null>>;

/** Builds the profile from an hourly series in local time ("YYYY-MM-DDTHH:MM"). */
export function seasonalProfile(times: string[], values: Array<number | null>): SeasonProfile {
  const sum = Object.fromEntries(SEASONS.map((s) => [s, Array<number>(24).fill(0)])) as Record<Season, number[]>;
  const count = Object.fromEntries(SEASONS.map((s) => [s, Array<number>(24).fill(0)])) as Record<Season, number[]>;
  times.forEach((t, i) => {
    const v = values[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    const month = Number(t.slice(5, 7)) - 1, hour = Number(t.slice(11, 13));
    if (!(month >= 0 && month < 12 && hour >= 0 && hour < 24)) return;
    const s = seasonOfMonth(month);
    sum[s][hour]! += v;
    count[s][hour]! += 1;
  });
  return Object.fromEntries(SEASONS.map((s) => [s, sum[s].map((v, h) => (count[s][h] ? Math.round((v / count[s][h]!) * 10) / 10 : null))])) as SeasonProfile;
}

/**
 * How much of the summer cooling trees, lawn and shade give at a given perceived temperature: all of it at 40 °C,
 * half at 30 °C, none at 20 °C or below (in the cool there is nothing to take away).
 */
export const coolingShare = (t: number) => Math.max(0, Math.min(1, (t - 20) / 20));

/**
 * Fallback when the real year cannot be read: a plain daily curve around a seasonal peak (the summer one from the
 * piazza, the others set below it). Shown as an estimate, never as real data.
 */
const SEASON_DROP: Record<Season, number> = { estate: 0, primavera: 12, autunno: 10, inverno: 26 };
export function estimatedTemp(season: Season, hour: number, summerPeak: number): number {
  const peak = summerPeak - SEASON_DROP[season], low = peak - 11;
  const day = Math.cos(((hour - 15) / 12) * Math.PI); // 1 at 15:00, −1 at 3:00
  return Math.round((low + ((peak - low) * (day + 1)) / 2) * 10) / 10;
}
