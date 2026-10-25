import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Camera, ChevronRight, CloudRain, Droplets, Leaf, Lock, MapPin, NotebookPen, Radar, Satellite, ScanLine, ShieldCheck, Sparkles, Sun, TreePine, Umbrella, Wind, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLab, vineMetrics } from "@/models/lab-store";
import { comparison, piazzaEstimate } from "@/models/scenarios";
import { REFERENCE_M2, UNIT_COST, euroRange, grouped, interventionCost } from "@/models/intervention-cost";
import { NO_MIX, VINE_LEVELS, VINE_REFERENCE_M2, VINE_UNIT_COST, vineCost, vineMixOf, zoneMixOf, type VineMix } from "@/models/vine-interventions";
import { SEASONS, SEASON_LABEL, coolingShare, estimatedTemp, type Season } from "@/models/season-climate";
import { ensureMedia, useLabMedia, type MediaKind } from "@/models/lab-media-store";
import { useArScans } from "@/models/ar-scan-log";
import { ndviLabel } from "@/models/copernicus";
import { getPlaceArea } from "@/controllers/osm-geo.functions";
import { getSeasonalClimate } from "@/controllers/climate.functions";
import { loadCopernicus, type CopernicusResult } from "@/views/copernicus-client";
import { GAIN_BG, GAIN_TEXT } from "@/views/v7/studio-ui";
import { openSimTab, showSimMedia, type SimKind } from "@/views/v8/console";
import { splitLocation } from "@/views/SimulationGrid";
import { useSignedIn } from "@/lib/use-signed-in";
import { DEMO_LOGIN_AVAILABLE, setDemoSignedIn } from "@/lib/demo-login";
import { openAccount } from "@/lib/camera-dock";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const fmt1 = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const avg = (n: number[]) => n.reduce((a, b) => a + b, 0) / Math.max(1, n.length);
const heatStep = (t: number) => (t >= 39 ? 0 : t >= 36 ? 1 : t >= 30 ? 2 : t >= 26 ? 3 : 4);
const heatWords = (t: number) => (t >= 39 ? "Troppo caldo" : t >= 36 ? "Molto caldo" : t >= 30 ? "Caldo" : t >= 18 ? "Si sta bene" : t >= 10 ? "Fresco" : "Freddo");
const thirstStep = (s: number) => (s >= 80 ? 0 : s >= 65 ? 1 : s >= 45 ? 2 : s >= 25 ? 3 : 4);
const thirstWords = (s: number) => (s >= 65 ? "Sete forte" : s >= 35 ? "Da tenere d'occhio" : "Le viti stanno bene");
const levelName = (id: string | null) => (id ? comparison.find((c) => c.id === id)?.s ?? null : null);
const useReducedMotion = () => {
  const [reduce, setReduce] = useState(true);
  useEffect(() => { setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return reduce;
};

/** A section of the dashboard: a bold title, an optional hint on the right, then its content. */
export function DashSection({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** A plain rounded card, as on the account and info pages. */
export function DashCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 rounded-3xl bg-foreground/[0.05] p-4 sm:p-5", className)}>{children}</div>;
}

/**
 * The result of the project, read-only: the same half ring as the simulation, the faint ring where it starts, the white
 * dot where the interventions bring it, and inside the reading, its words and the level.
 */
function ResultArc({ before, after, min, max, unit, value, words, step, level, cost }: { before: number; after: number; min: number; max: number; unit: string; value: string; words: string; step: number; level: string | null; cost: string }) {
  const R = 88, C = Math.PI * R;
  const share = (t: number) => Math.max(0, Math.min(1, (t - min) / (max - min)));
  const at = (t: number) => { const a = Math.PI * (1 - share(t)); return { x: 100 + Math.cos(a) * R, y: 100 - Math.sin(a) * R }; };
  const b = at(before), a = at(after);
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <svg viewBox="0 0 200 112" className="w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="dash-scale" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--radar-cool)" /><stop offset="0.3" stopColor="var(--radar-mild)" /><stop offset="0.55" stopColor="var(--radar-warm)" /><stop offset="0.78" stopColor="var(--radar-hot)" /><stop offset="1" stopColor="var(--radar-extreme)" />
          </linearGradient>
        </defs>
        <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="14" strokeLinecap="round" />
        <path d="M12 100 A88 88 0 0 1 188 100" fill="none" stroke="url(#dash-scale)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * share(after)} ${C}`} />
        <circle cx={b.x} cy={b.y} r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
        <circle cx={a.x} cy={a.y} r="10" fill="#fff" stroke="#0d1016" strokeWidth="2.5" />
        <text x="12" y="111" fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.55">{Math.round(min)}{unit}</text>
        <text x="188" y="111" fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.55">{Math.round(max)}{unit}</text>
      </svg>
      <div className="absolute inset-x-0 bottom-1 flex flex-col items-center text-center">
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold text-white", GAIN_BG[step])}>{words}</span>
        <span className="mt-1 font-display text-5xl font-extralight leading-none tabular-nums">{value}</span>
        <span className="mt-1 text-xs text-muted-foreground">{level ?? "Nessun intervento"} · {cost}</span>
      </div>
    </div>
  );
}

/** The project's place, its result and the way back to the simulation. */
function ResultCard({ kind, place, when, children }: { kind: SimKind; place: string; when: ReactNode; children: ReactNode }) {
  return (
    <div className="fuse-canvas space-y-4 rounded-3xl px-4 pb-5 pt-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{place}</span></span>
        <Link to={kind === "urban" ? "/urbano" : "/vigneto"} onClick={() => openSimTab(kind, "simula")}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Modifica<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {children}
      <div className="flex justify-center">{when}</div>
    </div>
  );
}

/** Three big numbers in a row. */
function Facts({ items }: { items: Array<{ icon: LucideIcon; value: string; label: string }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((f) => (
        <DashCard key={f.label} className="flex flex-col items-center gap-1 px-2 py-4 text-center sm:px-3">
          <f.icon className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="font-display text-xl font-light tabular-nums sm:text-2xl">{f.value}</span>
          <span className="text-[11px] leading-tight text-muted-foreground sm:text-xs">{f.label}</span>
        </DashCard>
      ))}
    </div>
  );
}

/** What was put in place, one row each, with its indicative cost. */
function MixRows({ rows, total, note }: { rows: Array<{ icon: LucideIcon; label: string; value: string; cost: string }>; total: string; note: string }) {
  return (
    <DashCard className="p-0 sm:p-0">
      <ul className="divide-y divide-foreground/10">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <r.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{r.label}</span><span className="block text-xs text-muted-foreground">{r.cost}</span></span>
            <span className="font-mono text-base font-semibold tabular-nums">{r.value}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"><span className="text-sm font-semibold">Totale indicativo</span><span className="text-right text-sm font-semibold">{total}</span></li>
      </ul>
      <p className="px-4 pb-4 text-[11px] text-muted-foreground sm:px-5">{note}</p>
    </DashCard>
  );
}

/** Season pills (one row). */
function SeasonPills({ value, onChange }: { value: Season; onChange: (s: Season) => void }) {
  return (
    <div className="grid w-full max-w-sm grid-cols-4 gap-1 rounded-full bg-foreground/[0.05] p-1" role="radiogroup" aria-label="Stagione">
      {SEASONS.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => { hapticTick(); onChange(s); }}
          className={cn("h-9 min-w-0 truncate rounded-full px-1 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", value === s ? "bg-secondary text-secondary-foreground" : "text-foreground/75")}>{SEASON_LABEL[s]}</button>
      ))}
    </div>
  );
}

/** The photos and videos of the project (on this device, or the account's archive). */
function MediaStrip({ kind }: { kind: MediaKind }) {
  const items = useLabMedia(kind);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => ensureMedia(kind, data.session?.user.id ?? null)).catch(() => undefined);
  }, [kind]);
  const sim: SimKind = kind;
  const open = () => showSimMedia(sim);
  return (
    <DashCard>
      {items.length ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {items.slice(0, 12).map((m) => (
            <li key={m.id} className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-foreground/10 sm:size-24">
              {m.kind === "video" ? <video src={m.url} muted playsInline preload="metadata" className="size-full object-cover" aria-label={m.name} /> : <img src={m.url} alt={m.name} loading="lazy" className="size-full object-cover" />}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nessuna foto o video per ora. Scattali dalla simulazione: finiscono qui e nel report.</p>}
      <Link to={kind === "urban" ? "/urbano" : "/vigneto"} onClick={open} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Camera className="size-4" aria-hidden="true" />{items.length ? `Tutti (${items.length})` : "Apri foto e video"}
      </Link>
    </DashCard>
  );
}

/** The AI camera's scans of this project, newest first. */
function ScanList({ kind }: { kind: MediaKind }) {
  const scans = useArScans(kind);
  const time = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <DashCard className="p-0 sm:p-0">
      {scans.length ? (
        <ul className="divide-y divide-foreground/10">
          {[...scans].reverse().slice(0, 6).map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <ScanLine className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.species?.commonName ?? s.soil?.label ?? s.target}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.target} · {time(s.at)}{s.count > 1 ? ` · ${s.count} esemplari` : ""}</span>
              </span>
              {s.totalCooling != null && <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-ok">−{fmt1(s.totalCooling)}°</span>}
            </li>
          ))}
        </ul>
      ) : <p className="p-4 text-sm text-muted-foreground sm:p-5">Nessuna scansione in questa sessione. Inquadra una pianta o il terreno con la Fotocamera AI: il risultato compare qui e nel report.</p>}
    </DashCard>
  );
}

/** Greenery and ground temperature from the satellite, read on demand (signed-in accounts only). */
function SatelliteCard({ lat, lng }: { lat: number; lng: number }) {
  const [state, setState] = useState<{ busy: boolean; data: CopernicusResult | null; failed: boolean }>({ busy: false, data: null, failed: false });
  const read = () => {
    setState({ busy: true, data: null, failed: false });
    loadCopernicus(lat, lng).then((data) => setState({ busy: false, data, failed: !data.configured }), () => setState({ busy: false, data: null, failed: true }));
  };
  const day = (d: string) => new Date(d).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  const { data } = state;
  return (
    <DashCard>
      {data && !state.failed ? (
        <div className="grid grid-cols-2 gap-3">
          <div><div className="text-xs text-muted-foreground">Verde</div>
            {data.ndvi ? <><div className="font-display text-2xl font-light">{data.ndvi.value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div><div className="text-xs">{ndviLabel(data.ndvi.value)}</div><div className="text-[11px] text-muted-foreground">{day(data.ndvi.date)}</div></> : <div className="text-sm text-muted-foreground">Nessuna immagine senza nuvole</div>}
          </div>
          <div><div className="text-xs text-muted-foreground">Suolo</div>
            {data.surfaceTemp ? <><div className="font-display text-2xl font-light">{fmt1(data.surfaceTemp.value)}°</div><div className="text-xs">temperatura in superficie</div><div className="text-[11px] text-muted-foreground">{day(data.surfaceTemp.date)}</div></> : <div className="text-sm text-muted-foreground">Nessuna lettura recente</div>}
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">{state.failed ? "Lettura non riuscita: serve un account con l'accesso fatto davvero. Riprova più tardi." : "Quanto verde c'è e quanto scalda il suolo, visti dal satellite. Un riferimento: non cambia la simulazione."}</p>}
      <button type="button" onClick={read} disabled={state.busy} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
        <Satellite className="size-4" aria-hidden="true" />{state.busy ? "Lettura…" : data ? "Aggiorna" : "Leggi dal satellite"}
      </button>
    </DashCard>
  );
}

/** A row that opens a tool of the simulation. */
function ToolRow({ icon: Icon, title, line, onClick, to }: { icon: LucideIcon; title: string; line: string; onClick: () => void; to: "/urbano" | "/vigneto" }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-3 rounded-3xl bg-foreground/[0.05] px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{line}</span></span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

export type Locked = { icon: LucideIcon; title: string; line: string };

/**
 * The Premium part of the dashboard. Signed in (or simulated on previews) it shows its tools; otherwise each one stays
 * visible with a lock, so it is clear what the sign-in adds, with one Accedi (and "Simula l'accesso" on previews).
 */
function PremiumPart({ locked, children }: { locked: Locked[]; children: ReactNode }) {
  const { signedIn } = useSignedIn();
  return (
    <section className="space-y-3" aria-label="Premium">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-lg font-semibold tracking-tight">Premium</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", signedIn ? "bg-ok/15 text-ok" : "bg-foreground/[0.08] text-muted-foreground")}>{signedIn ? "attivo" : "con l'accesso"}</span>
      </div>
      {signedIn ? children : (
        <div className="space-y-3">
          <ul className="overflow-hidden rounded-3xl bg-foreground/[0.05]">
            {locked.map((l) => (
              <li key={l.title} className="border-b border-foreground/10 last:border-b-0">
                <button type="button" onClick={openAccount} className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
                  <l.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{l.title}</span><span className="block text-xs text-muted-foreground">{l.line}</span></span>
                  <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Bloccato" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <button type="button" onClick={openAccount} className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background outline-none focus-visible:ring-2 focus-visible:ring-ring">Accedi per sbloccare</button>
            {DEMO_LOGIN_AVAILABLE && <button type="button" onClick={() => setDemoSignedIn(true)} className="inline-flex h-11 items-center rounded-full bg-foreground/[0.08] px-5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">Simula l'accesso</button>}
            <span className="text-xs text-muted-foreground">Premium è gratis con la registrazione.</span>
          </div>
        </div>
      )}
    </section>
  );
}

/** The season profile of the place (shared with the simulations' cache). */
function useSeasonProfile(lat: number, lng: number) {
  const fetchSeasons = useServerFn(getSeasonalClimate);
  return useQuery({ queryKey: ["season-climate", lat, lng], queryFn: () => fetchSeasons({ data: { lat, lng } }), staleTime: Infinity, retry: 1 });
}

const URBAN_LOCKED: Locked[] = [
  { icon: ScanLine, title: "Scansioni della Fotocamera AI", line: "Piante e terreno riconosciuti, con il fresco che portano" },
  { icon: Satellite, title: "Dati da satellite", line: "Quanto verde c'è e quanto scalda il suolo" },
  { icon: Radar, title: "Dove mettere i sensori", line: "I punti giusti, suggeriti dall'AI" },
  { icon: ShieldCheck, title: "Approvazioni degli enti", line: "Richieste via email e stato dell'iter, salvati nell'account" },
  { icon: NotebookPen, title: "Registro interventi e piano AI", line: "Le decisioni prese e quelle suggerite, salvate nell'account" },
];

/** Piazza: the summary of the project, then its Premium tools (records: approvals, log and AI plan). */
export function PiazzaDashboard({ records }: { records: ReactNode }) {
  const urban = useLab().urban;
  const reduce = useReducedMotion();
  const { lat, lng } = urban.location;
  const [season, setSeason] = useState<Season>("estate");
  const profile = useSeasonProfile(lat, lng);
  const real = profile.data?.profile[season] ?? null;
  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  // A whole day of the chosen season: the place's real perceived heat (else an estimate) and the same with the interventions.
  const day = Array.from({ length: 24 }, (_, h) => {
    const before = real?.[h] ?? estimatedTemp(season, h, urban.realTemp ?? 40);
    return { h: `${h}`, prima: +before.toFixed(1), dopo: +(before - est.dT * coolingShare(before)).toFixed(1) };
  });
  const estimated = !real || real.every((v) => v === null);
  // The result is read in the hottest hour of that day: where the interventions matter most.
  const hot = day.reduce((a, b) => (b.prima > a.prima ? b : a), day[0]!);
  const before = hot.prima, after = hot.dopo;
  const fetchArea = useServerFn(getPlaceArea);
  const area = useQuery({ queryKey: ["place-area", lat, lng], queryFn: () => fetchArea({ data: { lat, lng } }), staleTime: Infinity, retry: 1 });
  const m2 = area.data?.m2 ?? REFERENCE_M2;
  const cost = interventionCost(m2, urban.trees, urban.permeable, urban.shade);
  const empty = urban.trees + urban.permeable + urban.shade === 0;
  const presets = { zero: [3, 10, 10], mvp: [6, 20, 15], roadmap: [12, 40, 30] } as const;
  const preset = (Object.keys(presets) as Array<keyof typeof presets>).find((k) => presets[k][0] === urban.trees && presets[k][1] === urban.permeable && presets[k][2] === urban.shade) ?? null;
  const place = splitLocation(urban.location.label);
  const co2 = Math.round(urban.trees * 22), water = Math.round(m2 * (urban.permeable / 100) * 0.7 * 0.6), shadeM2 = Math.round(m2 * (urban.shade / 100) + urban.trees * 30);
  const lawnM2 = Math.round((m2 * urban.permeable) / 100), shadeArea = Math.round((m2 * urban.shade) / 100);
  return (
    <div className="space-y-8" data-testid="dashboard-urbana">
      <ResultCard kind="urban" place={place.name}
        when={<SeasonPills value={season} onChange={setSeason} />}>
        <p className="text-center text-sm text-muted-foreground">Nell'ora più calda · {SEASON_LABEL[season].toLowerCase()}, ore {hot.h}</p>
        <ResultArc before={before} after={after} min={Math.floor(Math.min(after, before) - 3)} max={Math.ceil(before + 2)} unit="°"
          value={`${fmt1(after)}°`} words={heatWords(after)} step={heatStep(after)} level={empty ? null : levelName(preset) ?? "Su misura"} cost={empty ? "0 €" : euroRange(cost.total)} />
        <p className="text-center text-sm">
          {before - after >= 0.05 ? <>Da <b>{fmt1(before)}°</b> a <b className={GAIN_TEXT[heatStep(after)]}>{fmt1(after)}°</b> percepiti: <b>−{fmt1(before - after)}°</b></> : empty ? "Nessun intervento: apri la simulazione per provarne uno." : "In questa stagione gli interventi non cambiano il calore."}
        </p>
      </ResultCard>

      <DashSection title="La giornata" hint={estimated ? "stima indicativa" : "anno reale del luogo"}>
        <DashCard>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-[var(--radar-hot)]" />Senza interventi</span>
            <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-ok" />Con gli interventi</span>
          </div>
          <div className="h-48 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={day} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
                <defs>
                  <linearGradient id="dash-before" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--radar-hot)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--radar-hot)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="h" tickLine={false} axisLine={false} interval={5} tickFormatter={(h) => `${h}:00`} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v) => `${Math.round(v)}°`} />
                <Tooltip formatter={(v: number, n: string) => [`${fmt1(v)}°`, n === "prima" ? "Senza interventi" : "Con gli interventi"]} labelFormatter={(h) => `Ore ${h}:00`} contentStyle={{ borderRadius: 16, border: "none" }} />
                <Area type="monotone" dataKey="prima" stroke="var(--radar-hot)" strokeWidth={2} fill="url(#dash-before)" isAnimationActive={!reduce} />
                <Area type="monotone" dataKey="dopo" stroke="var(--ok)" strokeWidth={2.5} fill="none" isAnimationActive={!reduce} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashCard>
      </DashSection>

      <DashSection title="Cosa ottieni" hint="stima annua">
        <Facts items={[
          { icon: Leaf, value: `${co2} kg`, label: "CO₂ l'anno" },
          { icon: CloudRain, value: `${grouped(water)} m³`, label: "Pioggia tenuta" },
          { icon: Sun, value: `${grouped(shadeM2)} m²`, label: "All'ombra" },
        ]} />
      </DashSection>

      <DashSection title="Cosa hai messo" hint={`${grouped(m2)} m² ${area.data?.m2 ? "della piazza" : "di riferimento"}`}>
        <MixRows total={empty ? "Nessun intervento" : euroRange(cost.total)}
          note="Costi indicativi IVA esclusa, da verificare con un preventivo."
          rows={[
            { icon: TreePine, label: "Alberi", value: `${urban.trees}`, cost: `${euroRange(UNIT_COST.tree)} l'uno` },
            { icon: Sun, label: "Prato", value: `${urban.permeable}%`, cost: `${grouped(lawnM2)} m² · ${euroRange(UNIT_COST.lawnM2)} al m²` },
            { icon: Umbrella, label: "Ombra", value: `${urban.shade}%`, cost: `${grouped(shadeArea)} m² · ${euroRange(UNIT_COST.shadeM2)} al m²` },
          ]} />
      </DashSection>

      <DashSection title="Foto e video"><MediaStrip kind="urban" /></DashSection>

      <PremiumPart locked={URBAN_LOCKED}>
        <div className="space-y-8">
          <DashSection title="Scansioni AI"><ScanList kind="urban" /></DashSection>
          <DashSection title="Dal satellite"><SatelliteCard lat={lat} lng={lng} /></DashSection>
          <ToolRow to="/urbano" onClick={() => openSimTab("urban", "sensori")} icon={Radar} title="Dove mettere i sensori" line="Apri i punti suggeriti dall'AI intorno alla piazza" />
          {records}
        </div>
      </PremiumPart>
    </div>
  );
}

const VINE_LOCKED: Locked[] = [
  { icon: ScanLine, title: "Scansioni della Fotocamera AI", line: "Viti e terreno riconosciuti durante i sopralluoghi" },
  { icon: Satellite, title: "Dati da satellite", line: "Vigore delle viti e temperatura del suolo" },
  { icon: Radar, title: "Dove mettere i sensori", line: "Le sonde nei punti giusti, suggerite dall'AI" },
  { icon: Sparkles, title: "Quaderno di campagna e piano AI", line: "Le operazioni fatte e quelle suggerite dall'AI" },
];

/** Vigneto: the summary of the project, then its Premium tools (records: field notebook and AI plan). */
export function VineDashboard({ records }: { records: ReactNode }) {
  const vine = useLab().vineyard;
  const { lat, lng } = vine.location;
  const legacy = vineMixOf(vine);
  const mixes = vine.zones.map((z) => zoneMixOf(z, legacy));
  const after = vineMetrics({ ...vine, zones: vine.zones.map((z, i) => ({ ...z, ...mixes[i] })) }).results.map((r) => r.s);
  const plain = vineMetrics({ ...vine, zones: vine.zones.map((z) => ({ ...z, ...NO_MIX })) }).results.map((r) => r.s);
  const thirst = avg(after), before = avg(plain);
  const mix: VineMix = { irrigation: avg(mixes.map((m) => m.irrigation)), shade: avg(mixes.map((m) => m.shade)), windbreak: avg(mixes.map((m) => m.windbreak)) };
  const fetchArea = useServerFn(getPlaceArea);
  const area = useQuery({ queryKey: ["vine-area", lat, lng], queryFn: () => fetchArea({ data: { lat, lng, kind: "vigneto" } }), staleTime: Infinity, retry: 1 });
  const m2 = area.data?.m2 ?? VINE_REFERENCE_M2;
  const total = mixes.reduce((t, m) => { const c = vineCost(m2 / Math.max(1, mixes.length), m).total; return { lo: t.lo + c.lo, hi: t.hi + c.hi }; }, { lo: 0, hi: 0 });
  const empty = mixes.every((m) => m.irrigation + m.shade + m.windbreak === 0);
  const same = mixes.every((m) => m.irrigation === mixes[0]!.irrigation && m.shade === mixes[0]!.shade && m.windbreak === mixes[0]!.windbreak);
  const preset = same ? VINE_LEVELS.find((p) => p.irrigation === mixes[0]!.irrigation && p.shade === mixes[0]!.shade && p.windbreak === mixes[0]!.windbreak)?.id ?? null : null;
  const safe = after.filter((s) => s < 35).length;
  const place = splitLocation(vine.location.label);
  const ha = (r: { lo: number; hi: number }) => `${euroRange(r)} l'ettaro`;
  return (
    <div className="space-y-8" data-testid="dashboard-vitivinicola">
      <ResultCard kind="vineyard" place={place.name} when={<span className="text-xs text-muted-foreground">Media delle tre zone, come le hai lasciate nella simulazione</span>}>
        <p className="text-center text-sm text-muted-foreground">Sete delle viti</p>
        <ResultArc before={before} after={thirst} min={Math.max(0, Math.floor(Math.min(thirst, before) - 8))} max={Math.min(100, Math.ceil(before + 6))} unit=""
          value={`${Math.round(thirst)}`} words={thirstWords(thirst)} step={thirstStep(thirst)} level={empty ? null : levelName(preset) ?? "Su misura"} cost={empty ? "0 €" : euroRange(total)} />
        <p className="text-center text-sm">
          {before - thirst >= 0.5 ? <>Da <b>{Math.round(before)}</b> a <b className={GAIN_TEXT[thirstStep(thirst)]}>{Math.round(thirst)}</b> su 100: <b>−{Math.round(before - thirst)}</b></> : empty ? "Nessun intervento: apri la simulazione per provarne uno." : "Gli interventi qui cambiano poco."}
        </p>
      </ResultCard>

      <DashSection title="Le tre zone" hint="sete su 100">
        <div className="grid grid-cols-3 gap-2">
          {vine.zones.map((z, i) => (
            <DashCard key={i} className="space-y-1 px-3 py-4 text-center">
              <div className="text-xs font-semibold text-muted-foreground">Zona {i + 1}</div>
              <div className={cn("font-display text-3xl font-light tabular-nums", GAIN_TEXT[thirstStep(after[i] ?? 0)])}>{Math.round(after[i] ?? 0)}</div>
              <div className="text-[11px] text-muted-foreground">senza: {Math.round(plain[i] ?? 0)}</div>
              <div className="text-[11px] text-muted-foreground">{Math.round(z.temperature)}° · {Math.round(z.moisture)}% acqua</div>
            </DashCard>
          ))}
        </div>
      </DashSection>

      <DashSection title="Cosa ottieni">
        <Facts items={[
          { icon: ShieldCheck, value: `${safe} di ${after.length}`, label: "Zone al sicuro" },
          { icon: Leaf, value: mix.shade ? `−${fmt1((mix.shade / 100) * 3)}°` : "0°", label: "Sulle foglie" },
          { icon: Wind, value: mix.windbreak ? `−${Math.round((mix.windbreak / 100) * 60)}%` : "0%", label: "Vento" },
        ]} />
      </DashSection>

      <DashSection title="Cosa hai messo" hint={area.data?.m2 ? `${grouped(m2)} m² del vigneto` : "1 ettaro di riferimento"}>
        <MixRows total={empty ? "Nessun intervento" : euroRange(total)}
          note={same ? "Costi indicativi IVA esclusa, da verificare con un preventivo." : "Media delle tre zone (ognuna ha il suo intervento). Costi indicativi IVA esclusa."}
          rows={[
            { icon: Droplets, label: "Irrigazione", value: `+${Math.round(mix.irrigation)}%`, cost: ha(VINE_UNIT_COST.irrigation) },
            { icon: Umbrella, label: "Teli d'ombra", value: `${Math.round(mix.shade)}%`, cost: ha(VINE_UNIT_COST.shade) },
            { icon: Wind, label: "Frangivento", value: `${Math.round(mix.windbreak)}%`, cost: ha(VINE_UNIT_COST.windbreak) },
          ]} />
      </DashSection>

      <DashSection title="Foto e video"><MediaStrip kind="vineyard" /></DashSection>

      <PremiumPart locked={VINE_LOCKED}>
        <div className="space-y-8">
          <DashSection title="Scansioni AI"><ScanList kind="vineyard" /></DashSection>
          <DashSection title="Dal satellite"><SatelliteCard lat={lat} lng={lng} /></DashSection>
          <ToolRow to="/vigneto" onClick={() => openSimTab("vineyard", "sensori")} icon={Radar} title="Dove mettere i sensori" line="Apri le sonde suggerite dall'AI nel vigneto" />
          {records}
        </div>
      </PremiumPart>
    </div>
  );
}

