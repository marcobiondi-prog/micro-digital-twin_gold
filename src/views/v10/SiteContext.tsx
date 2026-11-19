import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Landmark, LoaderCircle, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { loadSiteContext } from "@/lib/site-context-client";
import { crowdEstimate, interventionAdvice, siteConstraints, type Constraint, type SiteContext } from "@/models/site-context";
import { SEASON_LABEL, type Season } from "@/models/season-climate";
import { grouped } from "@/models/intervention-cost";
import { cn } from "@/lib/utils";

/** What is around the place (one query per place, kept for the session). */
export function useSiteContext(lat: number, lng: number, pending = false) {
  return useQuery<SiteContext>({
    queryKey: ["site-context", lat.toFixed(4), lng.toFixed(4)],
    queryFn: () => loadSiteContext(lat, lng),
    enabled: !pending,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

const plural = (n: number, one: string, many: string) => `${grouped(n)} ${n === 1 ? one : many}`;

/**
 * "Persone nella piazza": how many people are probably in the place at the simulation's season and hour, the day
 * through the hours (the chosen one lit), what draws them, and how many of them the shade of the interventions covers.
 */
export function CrowdCard({ lat, lng, pending, m2, season, hour, shadePlaces }: { lat: number; lng: number; pending?: boolean; m2: number; season: Season; hour: number; shadePlaces: number }) {
  const ctx = useSiteContext(lat, lng, pending);
  const crowd = useMemo(() => (ctx.data ? crowdEstimate(ctx.data.draws, m2, season, hour) : null), [ctx.data, m2, season, hour]);
  const d = ctx.data?.draws;
  const parts = d ? [
    d.food && plural(d.food, "bar o ristorante", "bar e ristoranti"),
    d.shops && plural(d.shops, "negozio", "negozi"),
    d.schools && plural(d.schools, "scuola", "scuole"),
    d.worship && plural(d.worship, "chiesa", "chiese"),
    d.transport && plural(d.transport, "fermata", "fermate"),
    d.attractions && plural(d.attractions, "luogo da visitare", "luoghi da visitare"),
    d.hotels && plural(d.hotels, "alloggio", "alloggi"),
    d.markets && plural(d.markets, "mercato", "mercati"),
    d.buildings && plural(d.buildings, "edificio", "edifici"),
  ].filter(Boolean) as string[] : [];
  const covered = crowd && crowd.people > 0 ? Math.min(100, Math.round((shadePlaces / crowd.people) * 100)) : 0;
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4" aria-label="Persone nella piazza">
      <div className="flex items-center gap-2"><Users className="size-5 text-brand-turquoise" aria-hidden="true" /><p className="text-[15px] font-semibold">Persone nella piazza</p><span className="ml-auto rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">stima</span></div>
      {pending ? <p className="text-sm text-muted-foreground">Scegli prima il luogo sulla mappa.</p>
        : ctx.isPending ? <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Guardo cosa c’è intorno alla piazza…</p>
        : !crowd ? <p className="text-sm text-muted-foreground">Non riesco a leggere i dintorni ora: riprova più tardi.</p>
        : <>
          <p className="text-sm text-muted-foreground">{SEASON_LABEL[season]}, ore {String(Math.floor(hour)).padStart(2, "0")}:00</p>
          <p className="font-display text-3xl font-light tabular-nums">≈ {grouped(crowd.low)}–{grouped(crowd.high)} <span className="text-base text-muted-foreground">persone</span></p>
          <p className="text-xs text-muted-foreground">Circa {crowd.per100 < 1 ? crowd.per100.toFixed(1).replace(".", ",") : Math.round(crowd.per100)} ogni 100 m² · nel momento più affollato della giornata ≈ {grouped(crowd.peak)}{crowd.tourist ? " · zona turistica" : ""}{crowd.capped ? " · piazza piena" : ""}</p>
          {/* The day through the hours, the chosen one lit. */}
          <div className="flex h-14 items-end gap-[2px]" role="img" aria-label={`Persone durante la giornata: il massimo è circa ${crowd.peak}`}>
            {crowd.byHour.map((v, h) => (
              <div key={h} className={cn("min-h-[2px] flex-1 rounded-t-sm", h === Math.floor(hour) ? "bg-brand-turquoise" : "bg-foreground/20")} style={{ height: `${Math.max(3, (v / Math.max(1, crowd.peak)) * 100)}%` }} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
          {shadePlaces > 0 && <p className="text-sm">Con gli interventi c’è ombra per <b className="font-semibold tabular-nums">{grouped(shadePlaces)}</b> persone: {covered >= 100 ? "basta per tutti a quest’ora." : `circa il ${covered} % di chi c’è a quest’ora.`}</p>}
          {parts.length > 0 && <p className="text-xs text-muted-foreground">Nel raggio di 300 m: {parts.join(" · ")}.</p>}
          <p className="text-[11px] leading-snug text-muted-foreground">Stima indicativa, non un conteggio: dai luoghi che attirano persone intorno alla piazza (locali, negozi, scuole, fermate, case), dalla stagione e dall’ora. Un conteggio vero, a mano o con un sensore, la rende più precisa.</p>
        </>}
    </div>
  );
}

const LEVEL_TONE: Record<Constraint["level"], string> = { probabile: "bg-amber-400/15 text-amber-700 ring-amber-500/40 dark:text-amber-300", possibile: "bg-foreground/[0.06] text-muted-foreground ring-foreground/15" };

/** "Vincoli dell'area": the constraints the open map data point to, what they mean for the interventions, and where to check them. */
export function ConstraintsCard({ lat, lng, pending, placeName, kind }: { lat: number; lng: number; pending?: boolean; placeName: string; kind: "piazza" | "vigneto" }) {
  const ctx = useSiteContext(lat, lng, pending);
  const cs = useMemo(() => (ctx.data ? siteConstraints(ctx.data, placeName) : null), [ctx.data, placeName]);
  const [open, setOpen] = useState<string | null>(null);
  const probable = cs?.some((c) => c.level === "probabile");
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4" aria-label="Vincoli dell'area">
      <div className="flex items-center gap-2">{cs && cs.length ? <ShieldAlert className="size-5 text-amber-500" aria-hidden="true" /> : <ShieldCheck className="size-5 text-brand-turquoise" aria-hidden="true" />}<p className="text-[15px] font-semibold">Vincoli dell’area</p><span className="ml-auto rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">indicativo</span></div>
      {pending ? <p className="text-sm text-muted-foreground">Scegli prima il luogo sulla mappa.</p>
        : ctx.isPending ? <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Cerco beni tutelati e aree vincolate intorno…</p>
        : !cs ? <p className="text-sm text-muted-foreground">Non riesco a leggere i dintorni ora: riprova più tardi.</p>
        : <>
          <p className="text-sm">{cs.length === 0 ? "Nelle mappe non risultano beni tutelati né aree vincolate vicine." : probable ? `Probabile tutela: ${cs.length === 1 ? "un vincolo" : `${cs.length} vincoli`} da verificare prima degli interventi.` : `Possibili vincoli: ${cs.length === 1 ? "uno" : cs.length} da verificare.`}</p>
          {cs.length > 0 && <ul className="space-y-2">
            {cs.map((c) => (
              <li key={c.id} className="rounded-2xl bg-foreground/[0.04]">
                <button type="button" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
                  <Landmark className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{c.title}</span><span className="block text-[11px] text-muted-foreground">{c.law}</span></span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", LEVEL_TONE[c.level])}>{c.level}</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open === c.id && "rotate-180")} aria-hidden="true" />
                </button>
                {open === c.id && <div className="space-y-1.5 px-3 pb-3 text-sm"><p className="[overflow-wrap:anywhere]">{c.why}</p><p className="text-muted-foreground">{c.means}</p></div>}
              </li>
            ))}
          </ul>}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">Per gli interventi</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{interventionAdvice(cs, kind).map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="https://vincoliinrete.beniculturali.it/VincoliInRete/" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Beni vincolati (Ministero)<ExternalLink className="size-3.5" aria-hidden="true" /></a>
            <a href="http://sitap.beniculturali.it/" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Vincoli paesaggistici (Ministero)<ExternalLink className="size-3.5" aria-hidden="true" /></a>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">Indicazione dalle mappe aperte, non un parere: i decreti di notevole interesse pubblico (art. 136) e i piani paesaggistici regionali qui non si leggono. Il vincolo certo lo dicono l’Ufficio tecnico del Comune e la Soprintendenza.</p>
        </>}
    </div>
  );
}
