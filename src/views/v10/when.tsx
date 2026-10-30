import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, Clock, Globe } from "lucide-react";
import { getSeasonalClimate } from "@/controllers/climate.functions";
import { SEASONS, SEASON_LABEL, seasonOfMonth, type Season } from "@/models/season-climate";
import { clearRequestedWhen, clockText, peekRequestedWhen, setSimWhen } from "@/models/sim-when";
import { changeCalendar, changeHands, deviceTimeZone, dstShift, placeTime, sameClock, shiftHour, summerTime, utcOffsetText, validTimeZone, zoneName, zoneOffsets, type DstMode } from "@/models/world-clock";
import { askChangeNotifications, changeNotificationsOn } from "@/lib/dst-notice";
import { placeZoneOf } from "@/lib/place-zone";
import { syncWorldTime, worldNow } from "@/lib/world-time";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Season and hour of a simulation: they follow the world time read in the place's own time zone ("Adesso", checked
 * every 30 s and on return to the app; the device clock corrected against the server's, the zone the one the place's
 * weather year comes in, else the device's) until one is chosen by hand, and read the place's real year averaged by
 * season and hour (null where it is missing).
 */
export function useSeasonClock(lat: number, lng: number, kind?: "urban" | "vineyard") {
  // "Riprendi nella simulazione" from the history can ask for the season and hour of a past intervention: the clock then starts there, by hand.
  const [asked] = useState(() => (kind ? peekRequestedWhen(kind) : null));
  const [live, setLive] = useState(!asked);
  const fetchSeasons = useServerFn(getSeasonalClimate);
  const climate = useQuery({ queryKey: ["season-climate", lat, lng], queryFn: () => fetchSeasons({ data: { lat, lng } }), staleTime: Infinity, retry: 1 });
  // The place's time zone, automatic from its position (worked out on the device), else the one its weather year
  // comes in, else the device's.
  const [coordZone, setCoordZone] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    setCoordZone(null);
    void placeZoneOf(lat, lng).then((z) => { if (on) setCoordZone(z); });
    // The zone used to be choosable by hand: that choice is dropped.
    try { localStorage.removeItem("mdt-zone-v1"); } catch { /* storage off */ }
    return () => { on = false; };
  }, [lat, lng]);
  const yearZone = validTimeZone(climate.data?.timezone);
  const placeZone = coordZone ?? yearZone;
  const tz = placeZone ?? deviceTimeZone();
  // Ora solare or legale by hand ("auto" follows the calendar): the clock reads that many minutes on.
  const [dstMode, setDstModeState] = useState<DstMode>(() => readDstMode(kind));
  const setDstMode = (m: DstMode) => { setDstModeState(m); saveChoice(DST_KEY, kind, m === "auto" ? null : m); };
  const at = (ms: number) => placeTime(ms + dstShift(ms, tz, dstMode) * 60_000, tz);
  const [season, setSeason] = useState<Season>(() => asked?.season ?? seasonOfMonth(at(worldNow()).month));
  const [hour, setHourOnly] = useState(() => asked?.hour ?? at(worldNow()).hour);
  // The minutes follow the clock while live; an hour chosen by hand starts on the hour.
  const [minute, setMinute] = useState(() => (asked ? asked.minute ?? 0 : at(worldNow()).minute));
  // The ora the clock is read in: the one chosen by hand, else the calendar's (none where there is no ora legale).
  const calendar = summerTime(worldNow(), tz).kind;
  const dst = zoneOffsets(worldNow(), tz) ? (dstMode === "auto" ? (calendar === "nessuna" ? undefined : calendar) : dstMode) : undefined;
  const setHour = (h: number | ((h: number) => number)) => { setHourOnly(h); setMinute(0); };
  useEffect(() => { if (kind) clearRequestedWhen(kind); }, [kind]);
  // What the simulation is set to now, for the history to record with an intervention.
  useEffect(() => { if (kind) setSimWhen(kind, { season, hour, minute, ...(dst ? { dst } : {}) }); }, [kind, season, hour, minute, dst]);
  useEffect(() => {
    if (!live) return;
    let on = true;
    const sync = () => { if (!on) return; const now = at(worldNow()); setSeason(seasonOfMonth(now.month)); setHourOnly(now.hour); setMinute(now.minute); };
    sync();
    // Once the world time is known, again (a phone whose clock is off moves to the right minute).
    void syncWorldTime().then(sync);
    const id = window.setInterval(sync, 30_000);
    document.addEventListener("visibilitychange", sync);
    return () => { on = false; window.clearInterval(id); document.removeEventListener("visibilitychange", sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tz, dstMode]);
  // The place's year is hour by hour in its own zone: a zone chosen by hand reads the place's hour at that moment.
  // An ora chosen by hand is undone first: the year is in the calendar's ora.
  const shift = Math.round(dstShift(worldNow(), tz, dstMode) / 60);
  const calHour = (((hour - shift) % 24) + 24) % 24;
  // The year is hour by hour in the zone it came in (the same as the position's but at a border).
  const placeHour = yearZone && yearZone !== tz ? shiftHour(calHour, worldNow(), tz, yearZone) : calHour;
  const real = climate.data?.profile[season][placeHour] ?? null;
  return { live, setLive, season, setSeason, hour, setHour, minute, tz, placeZone: !!placeZone, dstMode, setDstMode, dst, pending: climate.isPending, real };
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
        <ZoneLine clock={clock} />
        <p className="text-center text-[11px] text-muted-foreground">{note}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Whose hour it is: the place's own, from its position (its zone and UTC offset, on world time), and the hour where
 * the phone is when that differs; while the place's zone is not known yet, the phone's.
 */
function ZoneLine({ clock }: { clock: SeasonClock }) {
  const now = worldNow(), here = deviceTimeZone();
  const away = clock.placeZone && !sameClock(now, clock.tz, here);
  const mine = placeTime(now, here);
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-xs text-foreground/80">
        <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>{clock.placeZone ? "Fuso del luogo, dalla sua posizione" : "Ora del tuo dispositivo"} · {zoneName(now, clock.tz)} ({utcOffsetText(now, clock.tz)})</span>
        {away && <span className="text-muted-foreground">· da te sono le {clockText(mine.hour, mine.minute)}</span>}
        <SummerLine tz={clock.tz} now={now} mode={clock.dstMode} />
      </p>
      <DstChoice clock={clock} />
      <ChangeReminders tz={clock.tz} now={now} />
    </div>
  );
}

const DST_KEY = "mdt-dst-v1";
/** A choice made by hand for each simulation (the zone, the ora), kept on this device. */
function readChoice(key: string, kind: string | undefined): unknown {
  if (!kind || typeof window === "undefined") return null;
  try { return (JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>)[kind] ?? null; } catch { return null; }
}
const readDstMode = (kind: string | undefined): DstMode => { const v = readChoice(DST_KEY, kind); return v === "solare" || v === "legale" ? v : "auto"; };
function saveChoice(key: string, kind: string | undefined, value: string | null) {
  if (!kind) return;
  try {
    const all = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, string>;
    if (value) all[kind] = value; else delete all[kind];
    localStorage.setItem(key, JSON.stringify(all));
  } catch { /* storage off: the choice lasts this visit */ }
}

/** Ora solare or legale by hand, also out of season (only in a zone that has ora legale). */
function DstChoice({ clock }: { clock: SeasonClock }) {
  if (!zoneOffsets(worldNow(), clock.tz)) return null;
  const items: Array<[DstMode, string]> = [["auto", "Come il calendario"], ["solare", "Ora solare"], ["legale", "Ora legale"]];
  return (
    <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Ora solare o legale">
      {items.map(([m, label]) => (
        <button key={m} type="button" role="radio" aria-checked={clock.dstMode === m} onClick={() => { hapticTick(); clock.setDstMode(m); clock.setLive(true); }}
          className={cn("h-10 min-w-0 truncate rounded-full px-1 text-[12px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", clock.dstMode === m ? "bg-secondary text-secondary-foreground" : "text-foreground/80 hover:bg-foreground/[0.06]")}>{label}</button>
      ))}
    </div>
  );
}

/** Reminders of the next change: a calendar event that rings the evening before, and the phone's notifications. */
function ChangeReminders({ tz, now }: { tz: string; now: number }) {
  const next = summerTime(now, tz).next;
  const [notify, setNotify] = useState(changeNotificationsOn);
  if (!next) return null;
  const save = () => {
    const ics = changeCalendar(next.at, next.to, changeHands(next.at, tz));
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: next.to === "solare" ? "torna-ora-solare.ics" : "arriva-ora-legale.ics" });
    document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const btn = "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full bg-foreground/[0.07] px-3 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <button type="button" onClick={save} className={btn}><CalendarPlus className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">Promemoria in calendario</span></button>
      <button type="button" disabled={notify === "on" || notify === "denied" || notify === "unsupported"} onClick={() => void askChangeNotifications().then(setNotify)} className={btn}>
        <Bell className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{notify === "on" ? "Notifiche attive" : notify === "denied" ? "Notifiche bloccate" : notify === "unsupported" ? "Notifiche non disponibili" : "Avvisami sul telefono"}</span>
      </button>
    </div>
  );
}

/** "Ora legale · torna l'ora solare domenica 25 ottobre alle 03:00", "Ora solare · …", or that the zone has no summer time. */
function SummerLine({ tz, now, mode }: { tz: string; now: number; mode: DstMode }) {
  const st = summerTime(now, tz);
  const when = st.next && (() => {
    const h = changeHands(st.next.at, tz);
    const day = new Date(st.next.at).toLocaleDateString("it-IT", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
    return `${st.next.to === "legale" ? "arriva l'ora legale" : "torna l'ora solare"} ${day}: alle ${h.from} le lancette vanno alle ${h.to}`;
  })();
  return (
    <span className="basis-full text-muted-foreground">
      <b className="font-semibold text-foreground/80">{st.kind === "nessuna" ? "Nessuna ora legale qui" : mode !== "auto" ? `Ora ${mode}, scelta da te (il calendario dice ora ${st.kind})` : st.kind === "legale" ? "Ora legale" : "Ora solare"}</b>{when ? ` · ${when}` : ""}
    </span>
  );
}
