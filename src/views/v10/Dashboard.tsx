import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, CloudRain, Droplets, Leaf, Lock, Mail, MapPin, ShieldCheck, Sparkles, Sun, TreePine, Umbrella, Wind, type LucideIcon } from "lucide-react";
import { useLab } from "@/models/lab-store";
import { heatStep, heatWords, piazzaMix, piazzaSummary, thirstStep, thirstWords, vineMixRows, vineSummary } from "@/models/project-summary";
import { euroRange, grouped } from "@/models/intervention-cost";
import { SEASONS, SEASON_LABEL, type Season } from "@/models/season-climate";
import { getPlaceArea } from "@/controllers/osm-geo.functions";
import { getSeasonalClimate } from "@/controllers/climate.functions";
import { GAIN_BG, GAIN_TEXT } from "@/views/v7/studio-ui";
import { openSimTab, type SimKind } from "@/views/v8/console";
import { splitLocation } from "@/views/SimulationGrid";
import { useSignedIn } from "@/lib/use-signed-in";
import { DEMO_LOGIN_AVAILABLE, setDemoSignedIn } from "@/lib/demo-login";
import { openAccount } from "@/lib/camera-dock";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const fmt1 = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const avg = (n: number[]) => n.reduce((a, b) => a + b, 0) / Math.max(1, n.length);
const useReducedMotion = () => {
  const [reduce, setReduce] = useState(true);
  useEffect(() => { setReduce(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return reduce;
};

// The season the piazza is read in (summer by default): shared with the PDF report, so it prints what is on screen.
let dashSeason: Season = "estate";
const seasonSubs = new Set<() => void>();
export const getDashSeason = () => dashSeason;
const setDashSeason = (s: Season) => { dashSeason = s; seasonSubs.forEach((f) => f()); };
const useDashSeason = () => useSyncExternalStore((f) => { seasonSubs.add(f); return () => { seasonSubs.delete(f); }; }, () => dashSeason, () => dashSeason);

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

export type Locked = { icon: LucideIcon; title: string; line: string };

/**
 * The Premium part of the dashboard. Signed in (or simulated on previews) it shows its tools; otherwise each one stays
 * visible with a lock, so it is clear what the sign-in adds, with one Accedi (and "Simula l'accesso" on previews).
 */
export function PremiumPart({ locked, children }: { locked: Locked[]; children: ReactNode }) {
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

export const URBAN_LOCKED: Locked[] = [
  { icon: Mail, title: "Email agli enti per l'approvazione", line: "Comune, Soprintendenza e Ufficio tecnico: richiesta via email e risposta con un link" },
  { icon: ShieldCheck, title: "Iter di approvazione salvato", line: "Lo stato di ogni ente e del progetto, nel tuo account" },
  { icon: Sparkles, title: "Piano suggerito dall'AI", line: "Descrivi cosa vedi: l'AI propone gli interventi in ordine di priorità" },
];

/** Piazza: the summary of the project, then its records (the free log, then the Premium approvals and AI plan). */
export function PiazzaDashboard({ records }: { records: ReactNode }) {
  const urban = useLab().urban;
  const reduce = useReducedMotion();
  const { lat, lng } = urban.location;
  const season = useDashSeason();
  const profile = useSeasonProfile(lat, lng);
  const fetchArea = useServerFn(getPlaceArea);
  const area = useQuery({ queryKey: ["place-area", lat, lng], queryFn: () => fetchArea({ data: { lat, lng } }), staleTime: Infinity, retry: 1 });
  // The same summary the PDF report reads: a whole day of the season, read at its hottest hour.
  const sum = piazzaSummary(urban, season, profile.data?.profile[season] ?? null, area.data?.m2 ?? null);
  const { day, estimated, before, after, empty, m2 } = sum;
  const place = splitLocation(urban.location.label);
  return (
    <div className="space-y-8" data-testid="dashboard-urbana">
      <ResultCard kind="urban" place={place.name}
        when={<SeasonPills value={season} onChange={setDashSeason} />}>
        <p className="text-center text-sm text-muted-foreground">Nell'ora più calda · {SEASON_LABEL[season].toLowerCase()}, ore {sum.hour}</p>
        <ResultArc before={before} after={after} min={Math.floor(Math.min(after, before) - 3)} max={Math.ceil(before + 2)} unit="°"
          value={`${fmt1(after)}°`} words={heatWords(after)} step={heatStep(after)} level={sum.level} cost={empty ? "0 €" : euroRange(sum.cost)} />
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
                <XAxis dataKey="h" type="category" tickLine={false} axisLine={false} interval={5} tickFormatter={(h) => `${h}:00`} fontSize={11} />
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
          { icon: Leaf, value: `${sum.co2} kg`, label: "CO₂ l'anno" },
          { icon: CloudRain, value: `${grouped(sum.water)} m³`, label: "Pioggia tenuta" },
          { icon: Sun, value: `${grouped(sum.shadeM2)} m²`, label: "All'ombra" },
        ]} />
      </DashSection>

      <DashSection title="Cosa hai messo" hint={`${grouped(m2)} m² ${area.data?.m2 ? "della piazza" : "di riferimento"}`}>
        <MixRows total={empty ? "Nessun intervento" : euroRange(sum.cost)}
          note="Costi indicativi IVA esclusa, da verificare con un preventivo."
          rows={piazzaMix(urban, sum).map((r, i) => ({ ...r, icon: [TreePine, Sun, Umbrella][i]! }))} />
      </DashSection>

      {records}
    </div>
  );
}

export const VINE_LOCKED: Locked[] = [
  { icon: Sparkles, title: "Piano suggerito dall'AI", line: "Descrivi cosa vedi nel vigneto: l'AI propone gli interventi in ordine di priorità" },
];

/** Vigneto: the summary of the project, then its records (the free field notebook, then the Premium AI plan). */
export function VineDashboard({ records }: { records: ReactNode }) {
  const vine = useLab().vineyard;
  const { lat, lng } = vine.location;
  const fetchArea = useServerFn(getPlaceArea);
  const area = useQuery({ queryKey: ["vine-area", lat, lng], queryFn: () => fetchArea({ data: { lat, lng, kind: "vigneto" } }), staleTime: Infinity, retry: 1 });
  // The same summary the PDF report reads.
  const sum = vineSummary(vine, area.data?.m2 ?? null);
  const { before, after: thirst, mix, empty, same, safe, m2 } = sum;
  const place = splitLocation(vine.location.label);
  return (
    <div className="space-y-8" data-testid="dashboard-vitivinicola">
      <ResultCard kind="vineyard" place={place.name} when={<span className="text-xs text-muted-foreground">Media delle tre zone, come le hai lasciate nella simulazione</span>}>
        <p className="text-center text-sm text-muted-foreground">Sete delle viti</p>
        <ResultArc before={before} after={thirst} min={Math.max(0, Math.floor(Math.min(thirst, before) - 8))} max={Math.min(100, Math.ceil(before + 6))} unit=""
          value={`${Math.round(thirst)}`} words={thirstWords(thirst)} step={thirstStep(thirst)} level={sum.level} cost={empty ? "0 €" : euroRange(sum.cost)} />
        <p className="text-center text-sm">
          {before - thirst >= 0.5 ? <>Da <b>{Math.round(before)}</b> a <b className={GAIN_TEXT[thirstStep(thirst)]}>{Math.round(thirst)}</b> su 100: <b>−{Math.round(before - thirst)}</b></> : empty ? "Nessun intervento: apri la simulazione per provarne uno." : "Gli interventi qui cambiano poco."}
        </p>
      </ResultCard>

      <DashSection title="Le tre zone" hint="sete su 100">
        <div className="grid grid-cols-3 gap-2">
          {vine.zones.map((z, i) => (
            <DashCard key={i} className="space-y-1 px-3 py-4 text-center">
              <div className="text-xs font-semibold text-muted-foreground">Zona {i + 1}</div>
              <div className={cn("font-display text-3xl font-light tabular-nums", GAIN_TEXT[thirstStep(sum.zones[i]?.after ?? 0)])}>{Math.round(sum.zones[i]?.after ?? 0)}</div>
              <div className="text-[11px] text-muted-foreground">senza: {Math.round(sum.zones[i]?.plain ?? 0)}</div>
              <div className="text-[11px] text-muted-foreground">{Math.round(z.temperature)}° · {Math.round(z.moisture)}% acqua</div>
            </DashCard>
          ))}
        </div>
      </DashSection>

      <DashSection title="Cosa ottieni">
        <Facts items={[
          { icon: ShieldCheck, value: `${safe} di ${sum.zones.length}`, label: "Zone al sicuro" },
          { icon: Leaf, value: mix.shade ? `−${fmt1((mix.shade / 100) * 3)}°` : "0°", label: "Sulle foglie" },
          { icon: Wind, value: mix.windbreak ? `−${Math.round((mix.windbreak / 100) * 60)}%` : "0%", label: "Vento" },
        ]} />
      </DashSection>

      <DashSection title="Cosa hai messo" hint={area.data?.m2 ? `${grouped(m2)} m² del vigneto` : "1 ettaro di riferimento"}>
        <MixRows total={empty ? "Nessun intervento" : euroRange(sum.cost)}
          note={same ? "Costi indicativi IVA esclusa, da verificare con un preventivo." : "Media delle tre zone (ognuna ha il suo intervento). Costi indicativi IVA esclusa."}
          rows={vineMixRows(sum).map((r, i) => ({ ...r, icon: [Droplets, Umbrella, Wind][i]! }))} />
      </DashSection>

      {records}
    </div>
  );
}

