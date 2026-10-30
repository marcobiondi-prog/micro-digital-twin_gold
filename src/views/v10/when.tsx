import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { getSeasonalClimate } from "@/controllers/climate.functions";
import { SEASONS, SEASON_LABEL, seasonOfMonth, type Season } from "@/models/season-climate";
import { clearRequestedWhen, clockText, peekRequestedWhen, setSimWhen } from "@/models/sim-when";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Season and hour of a simulation: they follow the device clock ("Adesso", checked every 30 s and on return to the app)
 * until one is chosen by hand, and read the place's real year averaged by season and hour (null where it is missing).
 */
export function useSeasonClock(lat: number, lng: number, kind?: "urban" | "vineyard") {
  // "Riprendi nella simulazione" from the history can ask for the season and hour of a past intervention: the clock then starts there, by hand.
  const [asked] = useState(() => (kind ? peekRequestedWhen(kind) : null));
  const [live, setLive] = useState(!asked);
  const [season, setSeason] = useState<Season>(() => asked?.season ?? seasonOfMonth(new Date().getMonth()));
  const [hour, setHourOnly] = useState(() => asked?.hour ?? new Date().getHours());
  // The minutes follow the clock while live; an hour chosen by hand starts on the hour.
  const [minute, setMinute] = useState(() => (asked ? asked.minute ?? 0 : new Date().getMinutes()));
  const setHour = (h: number | ((h: number) => number)) => { setHourOnly(h); setMinute(0); };
  useEffect(() => { if (kind) clearRequestedWhen(kind); }, [kind]);
  // What the simulation is set to now, for the history to record with an intervention.
  useEffect(() => { if (kind) setSimWhen(kind, { season, hour, minute }); }, [kind, season, hour, minute]);
  useEffect(() => {
    if (!live) return;
    const sync = () => { const now = new Date(); setSeason(seasonOfMonth(now.getMonth())); setHourOnly(now.getHours()); setMinute(now.getMinutes()); };
    sync();
    const id = window.setInterval(sync, 30_000);
    document.addEventListener("visibilitychange", sync);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", sync); };
  }, [live]);
  const fetchSeasons = useServerFn(getSeasonalClimate);
  const climate = useQuery({ queryKey: ["season-climate", lat, lng], queryFn: () => fetchSeasons({ data: { lat, lng } }), staleTime: Infinity, retry: 1 });
  const real = climate.data?.profile[season][hour] ?? null;
  return { live, setLive, season, setSeason, hour, setHour, minute, pending: climate.isPending, real };
}
export type SeasonClock = ReturnType<typeof useSeasonClock>;

/** One chip (live dot, "Stagione, ore H · …") that opens the season pills, the hour stepper with "Adesso" and a note. */
export function WhenPicker({ clock, id, detail, note, children }: { clock: SeasonClock; id: string; detail: ReactNode; note: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { live, setLive, season, setSeason, hour, setHour, minute } = clock;
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
        className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full bg-foreground/[0.06] px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className={cn("size-2 shrink-0 rounded-full", live ? "bg-ok animate-pulse motion-reduce:animate-none" : "bg-muted-foreground")} aria-hidden="true" />
        <span className="truncate"><b className="font-semibold">{SEASON_LABEL[season]}, ore {clockText(hour, minute)}</b> · {detail}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
      </button>
      <div id={id} hidden={!open} className="w-full space-y-2 rounded-3xl bg-foreground/[0.04] p-3">
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Stagione">
          {SEASONS.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={season === x} onClick={() => { hapticTick(); setLive(false); setSeason(x); }}
              className={cn("h-10 min-w-0 truncate rounded-full px-1 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", season === x ? "bg-secondary text-secondary-foreground" : "text-foreground/80 hover:bg-foreground/[0.06]")}>{SEASON_LABEL[x]}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { hapticTick(); setLive(false); setHour((h) => (h + 23) % 24); }} aria-label="Un'ora prima" className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground/[0.07] outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronLeft className="size-5" aria-hidden="true" /></button>
          <span className="flex min-w-0 flex-1 items-center justify-center gap-2" aria-live="polite">
            <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-mono text-xl font-semibold tabular-nums">{clockText(hour, minute)}</span>
          </span>
          <button type="button" onClick={() => { hapticTick(); setLive(false); setHour((h) => (h + 1) % 24); }} aria-label="Un'ora dopo" className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground/[0.07] outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight className="size-5" aria-hidden="true" /></button>
          <button type="button" aria-pressed={live} onClick={() => { hapticTick(); setLive(true); }}
            className={cn("inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", live ? "bg-foreground text-background" : "bg-foreground/[0.07]")}>Adesso</button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">{note}</p>
        {children}
      </div>
    </div>
  );
}
