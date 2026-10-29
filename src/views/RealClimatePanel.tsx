import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Satellite, CloudSun } from "lucide-react";
import { Card } from "@/views/health";
import { RefreshCw } from "lucide-react";
import { getRealClimate, type RealClimate } from "@/controllers/climate.functions";
import { useLab } from "@/models/lab-store";

const fmt = (v: number | null | undefined, d = 1, u = "") => (v == null ? "—" : `${v.toLocaleString("it-IT", { maximumFractionDigits: d })}${u}`);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2 xl:flex xl:items-center xl:justify-between xl:gap-3 xl:px-4 xl:py-5">
      <div className="text-[11.5px] text-muted-foreground xl:text-xs">{label}</div>
      <div className="font-display text-base font-semibold xl:whitespace-nowrap xl:text-right xl:text-2xl">{value}</div>
    </div>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border/70 p-3 md:p-4 xl:min-h-[20rem] xl:p-5">
      <div className="mb-2.5 flex items-center gap-1.5 text-xs font-medium xl:mb-4">{icon}{title}</div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

async function fetchOpenMeteoBrowser(lat: number, lng: number): Promise<RealClimate["openMeteo"]> {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=soil_moisture_3_to_9cm,soil_temperature_6cm&forecast_days=1&timezone=auto`;
    const r = await fetch(u);
    if (!r.ok) return null;
    const j: any = await r.json();
    const num = (v: unknown) => (typeof v === "number" ? v : null);
    const t: string | null = j.current?.time ?? null;
    let h = (j.hourly?.time as string[] | undefined)?.findIndex((x) => t && x.slice(0, 13) === t.slice(0, 13)) ?? -1;
    if (h < 0) h = 0;
    return {
      temp: num(j.current?.temperature_2m), humidity: num(j.current?.relative_humidity_2m), wind: num(j.current?.wind_speed_10m),
      soilMoisture: num(j.hourly?.soil_moisture_3_to_9cm?.[h]), soilTemp: num(j.hourly?.soil_temperature_6cm?.[h]), time: t,
    };
  } catch { return null; }
}

export function RealClimatePanel({ kind }: { kind: "urban" | "vineyard" }) {
  const fetchClimate = useServerFn(getRealClimate);
  const lab = useLab();
  const location = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const [data, setData] = useState<RealClimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => { setLoading(true); setData(null); }, [location.lat, location.lng]);

  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) setTick((t) => t + 1); }, 5 * 60_000);
    const onVis = () => { if (!document.hidden) setTick((t) => t + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  useEffect(() => {
    let alive = true;
    setRefreshing(true);
    const { lat, lng } = location;
    (async () => {
      let r: RealClimate = { openMeteo: null, nasa: null };
      try { r = await fetchClimate({ data: { lat, lng } }); } catch { /* fallback below */ }
      if (!r.openMeteo) r = { ...r, openMeteo: await fetchOpenMeteoBrowser(lat, lng) };
      if (alive) {
        setData((prev) => ({ openMeteo: r.openMeteo ?? prev?.openMeteo ?? null, nasa: r.nasa ?? prev?.nasa ?? null }));
        setUpdatedAt(new Date()); setLoading(false); setRefreshing(false);
      }
    })();
    return () => { alive = false; };
  }, [location.lat, location.lng, tick]);

  const om = data?.openMeteo; const n = data?.nasa;
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <Satellite className="size-5 text-primary" />
        <h3 className="font-semibold">Dati reali della località</h3>
        <span className="text-xs text-muted-foreground">{location.label}</span>
        <button
          type="button"
          onClick={() => setTick((t) => t + 1)}
          disabled={refreshing}
          aria-label="Aggiorna dati reali"
          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-muted px-2.5 text-[11.5px] text-muted-foreground disabled:opacity-70"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} />
          {updatedAt ? `Aggiornato ${updatedAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : "Aggiorna"}
        </button>
        <span className="ml-auto hidden max-w-[46ch] text-right text-[11.5px] text-muted-foreground lg:block">
          Dati reali informativi; la griglia del Lab resta una simulazione.
        </span>
      </div>
      {loading ? <p className="mt-3 text-sm text-muted-foreground">Caricamento dati reali…</p> : (
        <div className="mt-3 grid gap-3 md:grid-cols-2 md:gap-5">
          <Group
            icon={<CloudSun className="size-4" />}
            title="Open-Meteo · adesso"
          >
            {om ? <div className="grid grid-cols-2 gap-2 md:gap-3 xl:flex-1 xl:grid-rows-2 xl:gap-3">
              <Stat label="Temperatura" value={fmt(om.temp, 1, " °C")} />
              <Stat label="Umidità" value={fmt(om.humidity, 0, " %")} />
              <Stat label="Vento" value={fmt(om.wind, 0, " km/h")} />
              <Stat label={kind === "vineyard" ? "Umidità suolo 3–9 cm" : "Temp. suolo 6 cm"} value={kind === "vineyard" ? fmt(om.soilMoisture != null ? om.soilMoisture * 100 : null, 0, " %") : fmt(om.soilTemp, 1, " °C")} />
            </div> : <p className="text-sm text-muted-foreground">Dati non disponibili.</p>}
          </Group>
          <Group
            icon={<Satellite className="size-4" />}
            title={<>NASA POWER · satellite, 7 giorni {n ? `(${n.period})` : ""}</>}
          >
            {n ? <div className="grid grid-cols-2 gap-2 md:gap-3 xl:flex-1 xl:grid-rows-2 xl:gap-3">
              <Stat label="Max media" value={fmt(n.tMax, 1, " °C")} />
              <Stat label="Min media" value={fmt(n.tMin, 1, " °C")} />
              <Stat label="Pioggia totale" value={fmt(n.rain, 1, " mm")} />
              <Stat label="Radiazione solare" value={fmt(n.solar, 1, " kWh/m²")} />
            </div> : <p className="text-sm text-muted-foreground">Dati non disponibili.</p>}
          </Group>
        </div>
      )}
      <p className="mt-3 text-[11.5px] text-muted-foreground lg:hidden">Dati reali informativi; la griglia del Lab resta una simulazione.</p>
    </Card>
  );
}
