import { useEffect, useMemo, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Landmark, LoaderCircle, ShieldAlert, ShieldCheck, Users } from "lucide-react";
import { loadSiteContext } from "@/lib/site-context-client";
import { ringCentroid, type Ring } from "@/models/place-area";
import { crowdEstimate, feasibleInterventions, interventionAdvice, siteConstraints, siteKey, type Constraint, type Feasible, type PiazzaSuggestion, type SiteContext, type VineSuggestion } from "@/models/site-context";
import { SEASON_LABEL, type Season } from "@/models/season-climate";
import { grouped } from "@/models/intervention-cost";
import { cn } from "@/lib/utils";
import { openSimTab } from "@/views/v8/console";

/** Before an area is circled on the map nothing is searched: the search starts from the area. */
function DrawFirst({ sim }: { sim: "urban" | "vineyard" }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Circoscrivi l’area sulla mappa: la ricerca parte da lì.</p>
      <button type="button" onClick={() => openSimTab(sim, "mappa")} className="inline-flex h-9 items-center rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Disegna l’area</button>
    </div>
  );
}

/** The query of a place's surroundings (shared by the cards and by the map's prefetch, so both hit the same cache). */
export function siteQuery(lat: number, lng: number, ring?: Ring | null) {
  return {
    queryKey: siteKey(lat, lng, ring),
    // Never longer than 75 s (three rounds of the phone and the app's server), whatever the servers or the phone do: the card then says why, with Riprova.
    queryFn: () => Promise.race([loadSiteContext(lat, lng, ring), new Promise<never>((_, no) => setTimeout(() => no(new Error("i server delle mappe non rispondono")), 75_000))]),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 0,
    // Asked even when the phone believes it is offline (a paused query kept the spinner turning for ever).
    networkMode: "always" as const,
  };
}

/** What is around the place (one query per place and outline, kept for the session). */
export function useSiteContext(lat: number, lng: number, pending = false, ring?: Ring | null) {
  return useQuery<SiteContext>({ ...siteQuery(lat, lng, ring), enabled: !pending });
}

/** Starts reading the surroundings as soon as an area is drawn on the map, so Simula finds them ready. */
export function prefetchSite(qc: QueryClient, ring: Ring) {
  const [lat, lng] = ringCentroid(ring).map((v) => Math.round(v * 1e4) / 1e4) as [number, number];
  void qc.prefetchQuery(siteQuery(lat, lng, ring));
}

/** After 12 s of searching, a line saying the map servers are slow and the search goes on (never "tempo scaduto" at once). */
function useSlow(on: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { if (!on) { setSlow(false); return; } const t = setTimeout(() => setSlow(true), 12_000); return () => clearTimeout(t); }, [on]);
  return slow;
}
function Searching({ text, on }: { text: string; on: boolean }) {
  const slow = useSlow(on);
  return (
    <div className="space-y-1">
      <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{text}</p>
      {slow ? <p className="text-xs text-muted-foreground">I server delle mappe sono lenti in questo momento: continuo a cercare da solo.</p> : null}
    </div>
  );
}

/** The surroundings could not be read: why, and a button to ask again. */
function Unreadable({ reason, retry, busy }: { reason?: string | undefined; retry: () => void; busy: boolean }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Non riesco a leggere i dintorni ora{reason ? ` (${reason})` : ""}.</p>
      <button type="button" onClick={retry} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
        {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : null}{busy ? "Riprovo…" : "Riprova"}
      </button>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${grouped(n)} ${n === 1 ? one : many}`;

/**
 * "Persone nella piazza": how many people are probably in the place at the simulation's season and hour, the day
 * through the hours (the chosen one lit), what draws them, and how many of them the shade of the interventions covers.
 */
export function CrowdCard({ lat, lng, pending, ring, m2, season, hour, shadePlaces }: { lat: number; lng: number; pending?: boolean; ring?: Ring | null | undefined; m2: number; season: Season; hour: number; shadePlaces: number }) {
  const ctx = useSiteContext(lat, lng, pending, ring);
  const crowd = useMemo(() => (ctx.data && ctx.data.drawsOk !== false ? crowdEstimate(ctx.data.draws, m2, season, hour) : null), [ctx.data, m2, season, hour]);
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
    d.offices && plural(d.offices, "ufficio", "uffici"),
    d.leisure && plural(d.leisure, "parco o campo", "parchi e campi"),
    d.buildings && plural(d.buildings, "edificio", "edifici"),
  ].filter(Boolean) as string[] : [];
  const covered = crowd && crowd.people > 0 ? Math.min(100, Math.round((shadePlaces / crowd.people) * 100)) : 0;
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4" aria-label="Persone nella piazza">
      <div className="flex items-center gap-2"><Users className="size-5 text-brand-turquoise" aria-hidden="true" /><p className="text-[15px] font-semibold">Persone nella piazza</p><span className="ml-auto rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">stima</span></div>
      {pending ? <DrawFirst sim="urban" />
        : ctx.isPending ? <Searching on text="Guardo cosa c’è intorno alla piazza…" />
        : !crowd ? <Unreadable reason={ctx.error?.message ?? ctx.data?.why} retry={() => void ctx.refetch()} busy={ctx.isFetching} />
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
          <p className="text-[11px] leading-snug text-muted-foreground">Stima indicativa, non un conteggio: dai luoghi che attirano persone intorno alla piazza (locali, negozi, scuole, uffici, parchi, fermate, case), dalla grandezza dell’area, dalla stagione e dall’ora. Un conteggio vero, a mano o con un sensore, la rende più precisa.</p>
        </>}
    </div>
  );
}

const LEVEL_TONE: Record<Constraint["level"], string> = { probabile: "bg-amber-400/15 text-amber-700 ring-amber-500/40 dark:text-amber-300", possibile: "bg-foreground/[0.06] text-muted-foreground ring-foreground/15" };

/** "Vincoli dell'area": the constraints the open map data point to, what they mean for the interventions, and where to check them. */
export function ConstraintsCard({ lat, lng, pending, ring, placeName, kind }: { lat: number; lng: number; pending?: boolean; ring?: Ring | null | undefined; placeName: string; kind: "piazza" | "vigneto" }) {
  const ctx = useSiteContext(lat, lng, pending, ring);
  const cs = useMemo(() => (ctx.data && ctx.data.constraintsOk !== false ? siteConstraints(ctx.data, placeName) : null), [ctx.data, placeName]);
  const [open, setOpen] = useState<string | null>(null);
  const probable = cs?.some((c) => c.level === "probabile");
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4" aria-label="Vincoli dell'area">
      <div className="flex items-center gap-2">{cs && cs.length ? <ShieldAlert className="size-5 text-amber-500" aria-hidden="true" /> : <ShieldCheck className="size-5 text-brand-turquoise" aria-hidden="true" />}<p className="text-[15px] font-semibold">Vincoli dell’area</p><span className="ml-auto rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">indicativo</span></div>
      {pending ? <DrawFirst sim={kind === "piazza" ? "urban" : "vineyard"} />
        : ctx.isPending ? <Searching on text="Cerco beni tutelati e aree vincolate intorno…" />
        : !cs ? <Unreadable reason={ctx.error?.message ?? ctx.data?.why} retry={() => void ctx.refetch()} busy={ctx.isFetching} />
        : <>
          {cs.length > 0 && <p className="text-sm">{probable ? `Probabile tutela: ${cs.length === 1 ? "un vincolo" : `${cs.length} vincoli`} da verificare prima degli interventi.` : `Possibili vincoli: ${cs.length === 1 ? "uno" : cs.length} da verificare.`}</p>}
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
          {cs.length > 0 && <div className="space-y-1.5">
            <p className="text-xs font-semibold">Per gli interventi</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{interventionAdvice(cs, kind).map((t) => <li key={t}>{t}</li>)}</ul>
          </div>}
          <div className="flex flex-wrap gap-2">
            <a href="https://vincoliinrete.beniculturali.it/VincoliInRete/" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Beni vincolati (Ministero)<ExternalLink className="size-3.5" aria-hidden="true" /></a>
            <a href="http://sitap.beniculturali.it/" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-3.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Vincoli paesaggistici (Ministero)<ExternalLink className="size-3.5" aria-hidden="true" /></a>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">Indicazione dalle mappe aperte, non un parere: i decreti di notevole interesse pubblico (art. 136) e i piani paesaggistici regionali qui non si leggono. Il vincolo certo lo dicono l’Ufficio tecnico del Comune e la Soprintendenza.</p>
        </>}
    </div>
  );
}

/**
 * At the top of Simula, before the levers: the area's feasibility in one line (the constraints found, or none), with a
 * tap down to the "Vincoli dell'area" card. Nothing while no place is chosen or the surroundings are being read.
 */
export function FeasibilityStrip({ lat, lng, pending, ring, placeName, sim }: { lat: number; lng: number; pending?: boolean; ring?: Ring | null | undefined; placeName: string; sim: "urban" | "vineyard" }) {
  const ctx = useSiteContext(lat, lng, pending, ring);
  const cs = useMemo(() => (ctx.data && ctx.data.constraintsOk !== false ? siteConstraints(ctx.data, placeName) : null), [ctx.data, placeName]);
  if (pending) return (
    <button type="button" onClick={() => openSimTab(sim, "mappa")} className="flex w-full items-center gap-2.5 rounded-2xl bg-foreground/[0.05] px-3.5 py-2.5 text-left ring-1 ring-foreground/10 outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ShieldCheck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Fattibilità dell’area</span><span className="block text-xs text-muted-foreground">Circoscrivi l’area sulla mappa: la ricerca di vincoli e persone parte da lì.</span></span>
      <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground" aria-hidden="true" />
    </button>
  );
  // Nothing found: no line at all (the card at the bottom keeps the links to check).
  if (pending || !cs || cs.length === 0) return null;
  const probable = cs.some((c) => c.level === "probabile");
  const go = () => document.querySelector('[aria-label="Vincoli dell\'area"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <button type="button" onClick={go} className={cn("flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left ring-1 outline-none focus-visible:ring-2 focus-visible:ring-ring",
      cs.length ? "bg-amber-400/10 ring-amber-500/30" : "bg-brand-turquoise/10 ring-brand-turquoise/30")}>
      {cs.length ? <ShieldAlert className="size-5 shrink-0 text-amber-500" aria-hidden="true" /> : <ShieldCheck className="size-5 shrink-0 text-brand-turquoise" aria-hidden="true" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Fattibilità dell’area</span>
        <span className="block text-xs text-muted-foreground">{cs.length ? `${probable ? "Probabile tutela" : "Possibili vincoli"}: ${cs.map((c) => c.title.toLowerCase()).join(", ")}. Guarda prima cosa si può fare.` : "Nelle mappe non risultano vincoli vicini (da confermare con il Comune)."}</span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

const FEASIBLE_UI: Record<Feasible, { text: string; dot: string; chip: string }> = {
  libero: { text: "Si può fare", dot: "bg-emerald-400", chip: "bg-emerald-400/15 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300" },
  autorizzazione: { text: "Con autorizzazione", dot: "bg-amber-400", chip: "bg-amber-400/15 text-amber-700 ring-amber-500/40 dark:text-amber-300" },
  sconsigliato: { text: "Sconsigliato", dot: "bg-red-400", chip: "bg-red-400/15 text-red-700 ring-red-500/40 dark:text-red-300" },
};

/** The proposal in words: "10 alberi · aiuole 30 % · 4 innaffiatoi". */
export function suggestionText(sug: { piazza?: PiazzaSuggestion | undefined; vine?: VineSuggestion | undefined } | null): string {
  if (sug?.piazza) { const p = sug.piazza; return [p.trees && `${p.trees} alberi`, p.permeable && `aiuole ${p.permeable} %`, p.shade && `vele ${p.shade} %`, p.misters && `${p.misters} nebulizzatori`, p.sprinklers && `${p.sprinklers} innaffiatoi`].filter(Boolean).join(" · "); }
  if (sug?.vine) { const v = sug.vine; return [`irrigazione +${v.irrigation} %`, v.shade && `teli ${v.shade} %`, v.windbreak && `frangivento ${v.windbreak} %`].filter(Boolean).join(" · "); }
  return "";
}

/** The interventions the constraints found around a drawn area allow, sized to it (null while reading or unreadable). */
export function useSuggestion(ring: Ring | null | undefined, placeName: string, kind: "piazza" | "vigneto", m2: number) {
  const [lat, lng] = ring && ring.length >= 3 ? ringCentroid(ring).map((v) => Math.round(v * 1e4) / 1e4) as [number, number] : [0, 0];
  const ctx = useSiteContext(lat, lng, !ring || ring.length < 3, ring);
  return useMemo(() => {
    if (!ctx.data || ctx.data.constraintsOk === false) return null;
    const cs = siteConstraints(ctx.data, placeName);
    return { cs, ...feasibleInterventions(cs, kind, m2) };
  }, [ctx.data, placeName, kind, m2]);
}

/**
 * On the Mappa tab, once the area's surroundings are read: which interventions the constraints found allow (each with
 * its state and why) and a starting mix sized to the area — what is sconsigliato left out, what needs an authorisation
 * kept light — put in with one tap and then drawn on the map.
 */
export function SuggestedInterventions({ lat, lng, ring, placeName, kind, m2, onApply }: {
  lat: number; lng: number; ring: Ring; placeName: string; kind: "piazza" | "vigneto"; m2: number;
  onApply: (s: { piazza?: PiazzaSuggestion | undefined; vine?: VineSuggestion | undefined }) => void;
}) {
  const ctx = useSiteContext(lat, lng, false, ring);
  const cs = useMemo(() => (ctx.data && ctx.data.constraintsOk !== false ? siteConstraints(ctx.data, placeName) : null), [ctx.data, placeName]);
  const sug = useMemo(() => (cs ? feasibleInterventions(cs, kind, m2) : null), [cs, kind, m2]);
  const [open, setOpen] = useState<string | null>(null);
  const mix = suggestionText(sug);
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4" aria-label="Interventi possibili">
      <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-turquoise" aria-hidden="true" /><p className="text-[15px] font-semibold">Interventi possibili</p><span className="ml-auto rounded-full bg-foreground/[0.08] px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">dai vincoli</span></div>
      {ctx.isPending ? <Searching on text="Guardo i vincoli attorno all’area…" />
        : !sug ? <Unreadable reason={ctx.error?.message ?? ctx.data?.why} retry={() => void ctx.refetch()} busy={ctx.isFetching} />
        : <>
          <p className="text-sm text-muted-foreground">{cs && cs.length ? `Con ${cs.length === 1 ? "il vincolo trovato" : `i ${cs.length} vincoli trovati`} attorno all’area:` : "Nessun vincolo trovato attorno all’area: bastano i permessi ordinari del Comune."}</p>
          <ul className="space-y-1.5">
            {sug.hints.map((h) => (
              <li key={h.id} className="rounded-2xl bg-foreground/[0.04]">
                <button type="button" aria-expanded={open === h.id} onClick={() => setOpen(open === h.id ? null : h.id)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
                  <span className={cn("size-2.5 shrink-0 rounded-full", FEASIBLE_UI[h.status].dot)} aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-sm font-medium">{h.label}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", FEASIBLE_UI[h.status].chip)}>{FEASIBLE_UI[h.status].text}</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open === h.id && "rotate-180")} aria-hidden="true" />
                </button>
                {open === h.id ? <p className="px-3 pb-3 text-xs text-muted-foreground">{h.why}</p> : null}
              </li>
            ))}
          </ul>
          {mix ? <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Proposta per {grouped(Math.round(m2))} m²: <span className="font-semibold text-foreground">{mix}</span>.</p>
            <button type="button" onClick={() => onApply({ piazza: sug.piazza, vine: sug.vine })} className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring">Metti gli interventi consigliati</button>
          </div> : null}
          <p className="text-[11px] text-muted-foreground">Indicativo: lo confermano l’Ufficio tecnico del Comune e la Soprintendenza.</p>
        </>}
    </div>
  );
}
