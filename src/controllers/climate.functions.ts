import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { seasonalProfile, type SeasonProfile } from "@/models/season-climate";

const input = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export type RealClimate = {
  openMeteo: { temp: number | null; humidity: number | null; wind: number | null; soilMoisture: number | null; soilTemp: number | null; time: string | null } | null;
  nasa: { period: string; tMax: number | null; tMin: number | null; rain: number | null; solar: number | null } | null;
};

const num = (v: unknown) => (typeof v === "number" && v > -900 ? v : null);
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

export const getRealClimate = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }): Promise<RealClimate> => {
    const { lat, lng } = data;
    const om = (async () => {
      try {
        const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=soil_moisture_3_to_9cm,soil_temperature_6cm&forecast_days=1&timezone=auto`;
        const r = await fetch(u, { headers: { "User-Agent": "MicroDigitalTwin/1.0" } });
        if (!r.ok) return null;
        const j: any = await r.json();
        const ct: string | undefined = j.current?.time;
        let h = (j.hourly?.time as string[] | undefined)?.findIndex((x) => ct && x.slice(0, 13) === ct.slice(0, 13)) ?? -1;
        if (h < 0) h = 0;
        return {
          temp: num(j.current?.temperature_2m), humidity: num(j.current?.relative_humidity_2m), wind: num(j.current?.wind_speed_10m),
          soilMoisture: num(j.hourly?.soil_moisture_3_to_9cm?.[h]), soilTemp: num(j.hourly?.soil_temperature_6cm?.[h]), time: j.current?.time ?? null,
        };
      } catch { return null; }
    })();
    const nasa = (async () => {
      try {
        const end = new Date(Date.now() - 2 * 864e5); const start = new Date(end.getTime() - 6 * 864e5);
        const u = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN&community=AG&longitude=${lng}&latitude=${lat}&start=${ymd(start)}&end=${ymd(end)}&format=JSON`;
        const r = await fetch(u);
        if (!r.ok) return null;
        const p: any = (await r.json()).properties?.parameter ?? {};
        const avg = (k: string, sum = false) => {
          const vals = Object.values(p[k] ?? {}).map(num).filter((v): v is number => v !== null);
          if (!vals.length) return null;
          const s = vals.reduce((a, b) => a + b, 0);
          return sum ? s : s / vals.length;
        };
        const f = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
        return { period: `${f(start)}–${f(end)}`, tMax: avg("T2M_MAX"), tMin: avg("T2M_MIN"), rain: avg("PRECTOTCORR", true), solar: avg("ALLSKY_SFC_SW_DWN") };
      } catch { return null; }
    })();
    return { openMeteo: await om, nasa: await nasa };
  });

/**
 * The place's last full year of perceived temperature, hour by hour, averaged for each season and hour of the day.
 * Real data from the weather archive (it lags a few days behind today).
 */
export const getSeasonalClimate = createServerFn({ method: "POST" })
  .inputValidator((d) => input.parse(d))
  .handler(async ({ data }): Promise<{ profile: SeasonProfile; from: string; to: string; timezone: string | null } | null> => {
    const end = new Date(Date.now() - 6 * 864e5), start = new Date(end.getTime() - 364 * 864e5);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${data.lat}&longitude=${data.lng}&start_date=${day(start)}&end_date=${day(end)}&hourly=apparent_temperature&timezone=auto`;
    try {
      const r = await fetch(u, { headers: { "User-Agent": "MicroDigitalTwin/1.0" } });
      if (!r.ok) { console.error(`Seasonal climate failed [${r.status}]`); return null; }
      const j = (await r.json()) as { timezone?: string; hourly?: { time?: string[]; apparent_temperature?: Array<number | null> } };
      const times = j.hourly?.time ?? [], values = j.hourly?.apparent_temperature ?? [];
      if (!times.length) return null;
      return { profile: seasonalProfile(times, values), from: day(start), to: day(end), timezone: typeof j.timezone === "string" ? j.timezone : null };
    } catch { return null; }
  });
