import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, CloudRain, Droplets, Thermometer, Flower2, Grape,  Leaf, Ruler, ShieldCheck, Sprout, Umbrella, Wallet, Wind, Wine, type LucideIcon } from "lucide-react";
import { phenoPhases, type Pheno } from "@/models/data";
import { estimatedTemp, type Season } from "@/models/season-climate";
import { useSeasonClock, WhenPicker } from "@/views/v10/when";
import { comparison, type PrototypeId } from "@/models/scenarios";
import { setVineyard, useLab, vineMetrics } from "@/models/lab-store";
import { NO_MIX, VINE_LEVELS, VINE_MAX, VINE_REFERENCE_M2, vineCost, vineMixAt, vineMixOf, zoneMixOf, type VineMix } from "@/models/vine-interventions";
import { euroRange, grouped } from "@/models/intervention-cost";
import { getPlaceArea } from "@/controllers/osm-geo.functions";
import { GAIN_BG, GAIN_TEXT } from "@/views/v7/studio-ui";
import { Gauge, Lever, type Stop } from "@/views/v9c/UrbanThermometer";
import { ImportWeatherButton } from "@/views/SimulationGrid";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const PHASE_ICON: Record<Pheno, LucideIcon> = { Germogliamento: Sprout, Fioritura: Flower2, Invaiatura: Grape, Maturazione: Wine };
const PHASE_SHORT: Record<Pheno, string> = { Germogliamento: "Germogli", Fioritura: "Fiori", Invaiatura: "Acini", Maturazione: "Vendemmia" };
/** Thirst 0–100 → five-step scale (0 = worst), as in the rest of the vineyard. */
const stressGain = (s: number) => (s >= 80 ? 0 : s >= 65 ? 1 : s >= 45 ? 2 : s >= 25 ? 3 : 4);
/** How the vines are, in plain words. */
const verdict = (s: number) => (s >= 65 ? "Sete forte" : s >= 35 ? "Da tenere d'occhio" : "Le viti stanno bene");
const AIR_MIN = 0, AIR_MAX = 45;
/** The vine's phase that matches each season (winter keeps the one in hand: the vine rests). */
const PHASE_OF_SEASON: Partial<Record<Season, Pheno>> = { primavera: "Germogliamento", estate: "Invaiatura", autunno: "Maturazione" };
const avg = (n: number[]) => n.reduce((a, b) => a + b, 0) / Math.max(1, n.length);
const fmt1 = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/**
 * v10 vineyard simulation, built like the piazza one: the half-ring arc of the vines' thirst is the one control (the three
 * levels sit on it as stops; drag the white dot or touch a level), inside it the verdict, the thirst and the cost; under it the
 * three zones, the phase of the vine and the rain; then three levers (irrigation, shade cloth, windbreak) and the cost per hectare.
 */
export function VineThirst({ onImportWeather }: { onImportWeather?: (() => Promise<void>) | undefined }) {
  const vine = useLab().vineyard;
  // Scope: one zone, or the whole vineyard ("Tutte"); levels, levers and rain act on it.
  const all = vine.allZones;
  const targets = all ? vine.zones.map((_, i) => i) : [vine.selected];
  const legacy = vineMixOf(vine);
  const mixes = vine.zones.map((z) => zoneMixOf(z, legacy));
  // On the whole vineyard the levers show the average mix (the same everywhere once set from here).
  const avgMix = (ms: VineMix[]): VineMix => ({ irrigation: Math.round(avg(ms.map((m) => m.irrigation)) / 2) * 2, shade: Math.round(avg(ms.map((m) => m.shade)) / 10) * 10, windbreak: Math.round(avg(ms.map((m) => m.windbreak)) / 10) * 10 });
  const mix = all ? avgMix(mixes) : mixes[vine.selected] ?? NO_MIX;
  const [costOpen, setCostOpen] = useState(false);
  const gaugeRef = useRef<HTMLDivElement>(null);
  const [gaugeSeen, setGaugeSeen] = useState(true);
  useEffect(() => {
    const el = gaugeRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setGaugeSeen(e?.isIntersecting ?? true), { rootMargin: "-120px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Thirst of the scope (one zone, or the average of the three) with a given mix there, same model as the dashboard.
  const withMix = (m: VineMix) => ({ ...vine, zones: vine.zones.map((z, i) => ({ ...z, ...(targets.includes(i) ? m : mixes[i]) })) });
  const thirstOf = (m: VineMix) => { const r = vineMetrics(withMix(m)).results; return avg(targets.map((i) => r[i]?.s ?? 0)); };
  const zonesAfter = vineMetrics({ ...vine, zones: vine.zones.map((z, i) => ({ ...z, ...mixes[i] })) }).results;
  const before = thirstOf(NO_MIX);
  // What the vines feel now: on the whole vineyard, the real average of the zones (their mixes may differ).
  const after = avg(targets.map((i) => zonesAfter[i]?.s ?? 0));
  const lowest = Math.min(after, thirstOf(vineMixAt(3)));
  const dialMax = Math.min(100, before + 4), dialMin = Math.max(0, lowest - 6);
  const gain = stressGain(after);
  const preset = VINE_LEVELS.find((p) => p.irrigation === mix.irrigation && p.shade === mix.shade && p.windbreak === mix.windbreak)?.id ?? null;
  const nearest: PrototypeId = VINE_LEVELS.reduce((b, p) => (Math.abs(thirstOf(p) - after) < Math.abs(thirstOf(b) - after) ? p : b), VINE_LEVELS[0]!).id;
  const level = comparison.find((l) => l.id === (preset ?? nearest)) ?? comparison[0]!;
  const any = mix.irrigation + mix.shade + mix.windbreak > 0;

  // The vineyard's real surface, measured on its mapped plot; without one, one hectare (said so).
  const fetchArea = useServerFn(getPlaceArea);
  const { lat, lng } = vine.location;
  const area = useQuery({ queryKey: ["vine-area", lat, lng], queryFn: () => fetchArea({ data: { lat, lng, kind: "vigneto" } }), staleTime: Infinity, retry: 1 });
  const measured = area.data?.m2 ?? null;
  const m2 = measured ?? VINE_REFERENCE_M2;
  // Each zone is a third of the vineyard: the cost shown is the one of the scope.
  const zoneCost = (i: number) => vineCost(m2 / Math.max(1, vine.zones.length), mixes[i] ?? NO_MIX).total;
  const cost = { total: targets.reduce((t, i) => ({ lo: t.lo + zoneCost(i).lo, hi: t.hi + zoneCost(i).hi }), { lo: 0, hi: 0 }), perHa: vineCost(m2, mix).perHa };

  // Every zone keeps its own mix written down, so the scope can change without the others moving.
  const change = (patch: Partial<VineMix>) => setVineyard((v) => ({
    zones: v.zones.map((z, i) => ({ ...z, ...(mixes[i] ?? NO_MIX), ...(targets.includes(i) ? { ...mix, ...patch } : {}) })),
  }));
  // Air temperature of the scope, simulated by hand (15–45 °C): the base the interventions start from.
  const airShown = Math.round(avg(targets.map((i) => vine.zones[i]?.temperature ?? 0)));
  const setAir = (v: number) => {
    const delta = v + AIR_MIN - airShown;
    if (!delta) return;
    setVineyard((vv) => ({ zones: vv.zones.map((z, i) => (targets.includes(i) ? { ...z, temperature: Math.max(0, Math.min(45, z.temperature + delta)) } : z)) }));
  };
  // Season and hour (device clock until chosen by hand): they set the air temperature of the zones from the place's real
  // year (else a plain estimate), keeping each zone's difference from the others, and the vine's phase for the season.
  // Applied once per season, hour and place, so a reload keeps the temperature tuned by hand.
  const clock = useSeasonClock(vine.location.lat, vine.location.lng);
  const seasonAir = clock.real ?? estimatedTemp(clock.season, clock.hour, 36);
  const climateKey = `${clock.season}-${clock.hour}-${vine.location.lat.toFixed(3)},${vine.location.lng.toFixed(3)}-${clock.real === null ? "stima" : "reale"}`;
  useEffect(() => {
    if (clock.pending || vine.climateKey === climateKey) return;
    setVineyard((v) => {
      const mean = avg(v.zones.map((z) => z.temperature));
      const phase = PHASE_OF_SEASON[clock.season];
      return { climateKey, ...(phase ? { phase } : {}), zones: v.zones.map((z) => ({ ...z, temperature: Math.round(Math.max(0, Math.min(45, seasonAir + z.temperature - mean)) * 10) / 10 })) };
    });
  }, [climateKey, clock.pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopeName = all ? "tutto il vigneto" : `zona ${vine.selected + 1}`;
  // Sliding asks for a thirst: the vineyard walks the path no mix → the three ready vineyards (smallest step that reaches it).
  const slideTo = (t: number) => {
    let lo = 0, hi = 3;
    for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (thirstOf(vineMixAt(mid)) <= t) hi = mid; else lo = mid; }
    const next = t >= before - 0.05 ? NO_MIX : vineMixAt(hi);
    if (next.irrigation === mix.irrigation && next.shade === mix.shade && next.windbreak === mix.windbreak) return;
    change(next);
  };
  const applyLevel = (id: PrototypeId) => {
    const p = VINE_LEVELS.find((x) => x.id === id)!;
    hapticTick();
    change({ irrigation: p.irrigation, shade: p.shade, windbreak: p.windbreak });
  };
  const reach = before - lowest;
  const stops: Stop[] = VINE_LEVELS.map((p) => ({ id: p.id, label: comparison.find((c) => c.id === p.id)!.s, t: thirstOf(p), on: preset === p.id, near: !preset && any && nearest === p.id }));
  const raining = targets.length > 0 && targets.every((i) => vine.zones[i]?.rain);
  const safe = zonesAfter.filter((r) => r.s < 35).length;
  const facts: Array<{ icon: LucideIcon; value: string; label: string }> = [
    { icon: ShieldCheck, value: `${safe} di ${zonesAfter.length}`, label: "Zone al sicuro" },
    { icon: Leaf, value: `−${fmt1((mix.shade / 100) * 3)} °C`, label: "Sulle foglie" },
    { icon: Wind, value: `−${Math.round((mix.windbreak / 100) * 60)}%`, label: "Vento" },
  ];
  const surface = area.isPending ? "…" : `${grouped(m2)} m²`;
  const surfaceNote = area.isPending ? "misuro il vigneto…" : measured ? "superficie del vigneto" : "superficie di riferimento (1 ettaro)";

  return (
    <section className="fuse-canvas space-y-5 rounded-t-3xl px-3 pb-6 pt-4 text-foreground sm:px-5" aria-label="Sete del vigneto">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{reach > 1 ? "Trascina il punto bianco o tocca un livello" : "Ritocca il vigneto qui sotto"}</p>
      </div>

      {/* The scope: the whole vineyard or one zone, each with its thirst after the interventions. */}
      <div className="grid grid-cols-4 gap-1 rounded-3xl bg-foreground/[0.04] p-1" role="radiogroup" aria-label="Zona del vigneto">
        {[-1, ...vine.zones.map((_, i) => i)].map((i) => {
          const on = i === -1 ? all : !all && vine.selected === i;
          const s = i === -1 ? avg(zonesAfter.map((r) => r.s)) : zonesAfter[i]?.s ?? 0;
          return (
            <button key={i} type="button" role="radio" aria-checked={on} aria-label={`${i === -1 ? "Tutte le zone" : `Zona ${i + 1}`}, sete ${Math.round(s)} su 100`}
              onClick={() => { if (on) return; hapticTick(); setVineyard(i === -1 ? { allZones: true } : { allZones: false, selected: i }); }}
              className={cn("flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-secondary text-secondary-foreground shadow-[0_0_0_2px_var(--foreground)]" : "text-foreground/75 hover:bg-foreground/[0.06]")}>
              <span className="truncate text-[12px] font-semibold">{i === -1 ? "Tutte" : `Zona ${i + 1}`}</span>
              <span className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", GAIN_BG[stressGain(s)])} aria-hidden="true" /><span className={cn("font-mono text-sm font-semibold tabular-nums", on ? "" : GAIN_TEXT[stressGain(s)])}>{Math.round(s)}</span></span>
            </button>
          );
        })}
      </div>

      {/* Once the arc scrolls away, its reading rides under the tabs. */}
      <div aria-hidden={gaugeSeen} className={cn("pointer-events-none sticky top-[calc(var(--nav-h)+3.75rem)] z-[999999996] -mb-5 flex h-0 justify-center transition-opacity duration-200 motion-reduce:transition-none", gaugeSeen ? "opacity-0" : "opacity-100")}>
        <button type="button" tabIndex={gaugeSeen ? -1 : 0} onClick={() => gaugeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="mt-1 flex h-11 items-center gap-2 rounded-full bg-card/95 px-4 shadow-lg ring-1 ring-foreground/10 backdrop-blur" style={{ pointerEvents: gaugeSeen ? "none" : "auto" }}>
          <span className={cn("size-2.5 rounded-full", GAIN_BG[gain])} aria-hidden="true" />
          <span className="font-display text-xl font-light tabular-nums">{Math.round(after)}<span className="text-sm text-muted-foreground">/100</span></span>
          <span className="text-sm text-muted-foreground">{all ? "Tutte" : `Zona ${vine.selected + 1}`} · {verdict(after)}</span>
        </button>
      </div>

      {/* The arc of the vines' thirst: drag the white dot or touch a level. */}
      <div ref={gaugeRef} className="relative mx-auto mt-10 flex max-w-[21rem] flex-col items-center px-7">
        <Gauge before={before} after={after} lowest={lowest} min={dialMin} max={dialMax} stops={reach > 1 ? stops : []} onSlide={slideTo} onStop={applyLevel}
          unit="" spoken="su 100" label={`Sete della vite da raggiungere, ${scopeName}`} step={1} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center" aria-live="polite">
          <span className={cn("rounded-full px-3 py-0.5 text-[13px] font-semibold text-white transition-colors duration-300", GAIN_BG[gain])}>{verdict(after)}</span>
          <span className="mt-1 font-display text-6xl font-light leading-none tracking-tight tabular-nums">{Math.round(after)}<span className="text-2xl text-muted-foreground">/100</span></span>
          <span className="mt-1.5 font-mono text-sm font-semibold tabular-nums">{any ? euroRange(cost.total) : "Nessun intervento"}</span>
        </div>
      </div>

      {/* The three zones after the interventions, then the phase of the vine and the rain. */}
      <div className="-mt-2 space-y-3">
        <p className="text-center text-sm text-muted-foreground">Sete della vite, {scopeName}: senza interventi {Math.round(before)}/100</p>
        <WhenPicker clock={clock} id="vigneto-when" detail={<>aria {Math.round(seasonAir)}°</>}
          note={clock.pending ? "Leggo l'anno del luogo…" : clock.real !== null ? "Temperatura percepita media dell'ultimo anno in questo luogo, a quella stagione e ora" : "Stima indicativa: i dati reali del luogo non sono disponibili"} />
        <div className="flex items-stretch gap-2">
          <div className="grid flex-1 grid-cols-4 gap-1 rounded-3xl bg-foreground/[0.04] p-1" role="radiogroup" aria-label="Fase della vite">
            {phenoPhases.map((p) => {
              const Icon = PHASE_ICON[p], on = vine.phase === p;
              return (
                <button key={p} type="button" role="radio" aria-checked={on} onClick={() => { hapticTick(); setVineyard({ phase: p }); }}
                  className={cn("flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1.25rem] px-1 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-secondary text-secondary-foreground" : "text-foreground/70 hover:bg-foreground/[0.06]")}>
                  <Icon className="size-5" aria-hidden="true" /><span className="truncate">{PHASE_SHORT[p]}</span>
                </button>
              );
            })}
          </div>
          <button type="button" aria-pressed={raining} onClick={() => { hapticTick(); setVineyard((v) => ({ zones: v.zones.map((z, i) => (targets.includes(i) ? { ...z, rain: !raining } : z)) })); }}
            className={cn("flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-3xl text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", raining ? "bg-foreground text-background" : "bg-foreground/[0.06] text-foreground/70")}>
            <CloudRain className="size-5" aria-hidden="true" />Pioggia
          </button>
        </div>
        {/* The air temperature of the scope (on Tutte the average; moving it shifts every zone by the same degrees). */}
        <Lever icon={Thermometer} label="Temperatura" value={airShown - AIR_MIN} step={1} max={AIR_MAX - AIR_MIN} color="text-radar-hot" swatch="bg-radar-hot" shown={`${airShown} °C`} onChange={setAir} />
        {onImportWeather && <ImportWeatherButton onImport={onImportWeather} />}
      </div>

      {/* Fine-tuning by hand: always open, one line each. */}
      <div className="space-y-3" role="group" aria-label={`Interventi, ${scopeName}`}>
        <Lever icon={Droplets} label="Irrigazione" value={mix.irrigation} step={2} max={VINE_MAX.irrigation} color="text-water" swatch="bg-water" shown={`+${mix.irrigation}%`} onChange={(v) => change({ irrigation: v })} />
        <Lever icon={Umbrella} label="Teli d'ombra" value={mix.shade} step={10} max={VINE_MAX.shade} color="text-urban" swatch="bg-urban" onChange={(v) => change({ shade: v })} />
        <Lever icon={Wind} label="Frangivento" value={mix.windbreak} step={10} max={VINE_MAX.windbreak} color="text-ok" swatch="bg-ok" onChange={(v) => change({ windbreak: v })} />
      </div>

      {/* Cost per hectare and benefits, folded. */}
      <div className="rounded-3xl bg-foreground/[0.05]">
        <button type="button" onClick={() => setCostOpen((o) => !o)} aria-expanded={costOpen} aria-controls="vine-cost-body"
          className="flex w-full items-center gap-3 rounded-3xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Wallet className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">Dettagli costo e benefici{any ? (preset ? ` · ${level.s}` : ` · vicino a ${level.s}`) : ""}</span>
            <span className="block font-mono text-base font-semibold tabular-nums">{any ? `${euroRange(cost.perHa)} all'ettaro` : "Nessun intervento"}</span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", costOpen && "rotate-180")} aria-hidden="true" />
        </button>
        <div id="vine-cost-body" hidden={!costOpen} className="space-y-3 px-4 pb-4">
          <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><Ruler className="size-4 shrink-0" aria-hidden="true" />{surface} · {surfaceNote}</p>
          <dl className="grid grid-cols-3 gap-2 border-t border-foreground/10 pt-3">
            {facts.map(({ icon: Icon, value, label }) => (
              <div key={label} className="flex min-w-0 flex-col items-center gap-1 text-center">
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="flex min-w-0 flex-col-reverse"><dt className="truncate text-[11px] text-muted-foreground">{label}</dt><dd className="font-mono text-sm font-semibold tabular-nums">{value}</dd></div>
              </div>
            ))}
          </dl>
          <p className="text-[11px] leading-snug text-muted-foreground">Stima indicativa all'ettaro, IVA esclusa, per l'intervento completo: irrigazione a goccia 3.000–6.000 €, teli d'ombra 4.000–8.000 €, frangivento 6.000–12.000 €.</p>
        </div>
      </div>
    </section>
  );
}
