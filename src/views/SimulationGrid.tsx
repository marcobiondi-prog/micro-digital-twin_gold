import { FormEvent, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CloudSun, Droplets, Grape, LoaderCircle, LocateFixed, Lock, MapPin, Search, Sprout, Thermometer, TreePine, TrendingDown, Umbrella } from "lucide-react";
import { Card, StatusBadge } from "@/views/health";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CRITICAL_TEMPERATURE, hapticPattern, temperatureHapticIntensity } from "@/lib/haptics";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { vineyardControlValue, updateVineyardControl, type VineyardControl } from "@/models/vineyard-controls";
import { setUrban, setVineyard, useLab } from "@/models/lab-store";
import { getGooglePlace, reverseGoogleLocation, searchGoogleLocation, suggestGoogleLocations, type LocationSuggestion, type SearchedLocation } from "@/controllers/geo.functions";
import { searchOsmLocation, reverseOsmLocation, suggestOsmLocations } from "@/controllers/osm-geo.functions";
import { photonSuggestions, photonUrl, type OsmSuggestion } from "@/models/osm-suggest";
import { supabase } from "@/integrations/supabase/client";
import { phenoPhases, vineModel, type Pheno } from "@/models/data";
import { levelTone, piazzaEstimate, prototypeLevel, vineZones, type AreaKind, type PrototypeId } from "@/models/scenarios";

import { ResetScenarioButton } from "@/views/ResetScenarioButton";
import { useSignedIn as useSignedInState } from "@/lib/use-signed-in";

export const COLS = 9;
export const ROWS = 6;
const CELLS = Array.from({ length: COLS * ROWS }, (_, index) => index);
export const TREE_POSITIONS = [10, 16, 21, 31, 38, 44, 5, 25, 49, 2, 19, 35, 52, 12, 28, 42, 7, 47, 18, 34, 51, 14, 30, 40, 4, 23, 37, 50, 0, 53];
export const PERMEABLE_POSITIONS = [20, 21, 29, 30, 38, 39, 45, 46, 47, 37, 28, 36, 48, 19, 27, 49, 11, 18, 40, 50, 10, 22, 31, 41, 51, 9, 23, 32, 42, 52, 1, 12, 24, 33, 43, 53, 0, 13, 25, 34, 44, 2, 14, 26, 35, 3, 15, 4, 16, 5, 17, 6, 7, 8];
export const SHADE_POSITIONS = [10, 11, 12, 18, 19, 20, 26, 27, 28, 9, 17, 21, 29, 35, 36, 37, 38, 44, 45, 46, 47, 53, 8, 16, 22, 30, 34, 39, 43, 48, 52, 7, 15, 23, 31, 33, 40, 42, 49, 51, 6, 14, 24, 32, 41, 50, 5, 13, 25, 4, 3, 2, 1, 0];
const INTERVENTIONS: Array<{ kind: Exclude<AreaKind, "parcella">; label: string; Icon: typeof TreePine }> = [
  { kind: "albero", label: "Alberi", Icon: TreePine },
  { kind: "permeabile", label: "Suolo permeabile", Icon: Sprout },
  { kind: "ombra", label: "Ombra", Icon: Umbrella },
];
const TEMPERATURE_CLASSES = ["bg-radar-cool", "bg-radar-mild", "bg-radar-warm", "bg-radar-hot", "bg-radar-extreme"];
const TEMPERATURE_NAMES = ["fredda (blu)", "fresca (turchese)", "moderata (verde)", "calda (arancio)", "molto calda (corallo)"];

function temperatureLevel(value: number, min: number, max: number) {
  const progress = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return Math.min(4, Math.floor(progress * 5));
}

function thermalValue(temperature: number, min: number, max: number, column: number, row: number, influence: number) {
  const span = max - min;
  const x = column / (COLS - 1);
  const y = row / (ROWS - 1);
  const gradient = (x - 0.5) * span * 0.72;
  const wave = Math.sin(x * Math.PI * 1.7 + y * 2.2) * span * 0.1;
  const island = Math.max(0, 1 - Math.hypot(x - 0.68, y - 0.46) * 2.1) * span * 0.2;
  const breeze = (x - 0.5) * influence * span * 0.08;
  return Math.max(min, Math.min(max, temperature - span * 0.16 + gradient + wave + island + breeze));
}

function ThermalLegend({ min, max, id }: { min: number; max: number; id: string }) {
  const temperatures = Array.from({ length: 5 }, (_, index) => min + ((max - min) * index) / 4);
  return <div role="group" aria-labelledby={`${id}-legend-title`} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <div id={`${id}-legend-title`} className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Legenda temperature</div>
    <ul className="grid grid-cols-5 gap-1 sm:flex sm:flex-wrap sm:gap-2" aria-label="Scala dei colori della griglia termica">{temperatures.map((temperature, index) => <li key={temperature} aria-label={`${temperature.toFixed(1)} gradi, ${TEMPERATURE_NAMES[index]}`} className="flex min-w-0 flex-col items-center gap-1 text-[9px] font-semibold text-muted-foreground sm:inline-flex sm:flex-row sm:gap-1.5 sm:text-[11px]"><span className={cn("h-2.5 w-full rounded-sm sm:size-3 sm:shrink-0", TEMPERATURE_CLASSES[index])} aria-hidden="true" /><span className="truncate" aria-hidden="true">{temperature.toFixed(1)}°</span></li>)}</ul>
  </div>;
}

type SharedGridProps = { onReset: () => void; activeLevel: PrototypeId; onLocationChange?: (location: SearchedLocation) => void; onImportWeather?: (() => Promise<void>) | undefined };
const PHASE_HINTS: Record<Pheno, string> = {
  Germogliamento: "Germogli giovani: la vite consuma poca acqua, lo stress pesa meno (×0,7).",
  Fioritura: "Fase delicata: caldo e siccità riducono l’allegagione, stress amplificato (×1,15).",
  Invaiatura: "Gli acini cambiano colore: massima sensibilità a caldo e sete (×1,2).",
  Maturazione: "Acini quasi pronti: sensibilità media, pesa sulla qualità finale (×1,0).",
};
export function splitLocation(label: string) { const parts = label.includes(" · ") ? label.split(" · ") : label.split(", "); const clean = parts.map((part) => part.trim()).filter(Boolean); return { name: clean[0] ?? label, sub: clean.slice(1).join(" · ") }; }
type UrbanGridProps = SharedGridProps & { mode: "urban"; trees: number; permeable: number; shade: number; onTreesChange: (value: number) => void; onPermeableChange: (value: number) => void; onShadeChange: (value: number) => void };
type VineyardGridProps = SharedGridProps & { mode: "vineyard"; onZonesEdit?: () => void };

const GOOGLE_RETRY_MS = 5 * 60_000;
let googleRetryAt = 0;
const osmCache = new Map<string, OsmSuggestion[]>();

function LocationSearch({ initial, onSelect, bare = false }: { initial: SearchedLocation; onSelect: (location: SearchedLocation) => void; bare?: boolean }) {
  const searchLocation = useServerFn(searchGoogleLocation);
  const [query, setQuery] = useState("");
  const reverseGoogle = useServerFn(reverseGoogleLocation);
  const searchOsm = useServerFn(searchOsmLocation);
  const suggestOsm = useServerFn(suggestOsmLocations);
  const [osmPlaces, setOsmPlaces] = useState<Record<string, SearchedLocation>>({});
  const reverseOsm = useServerFn(reverseOsmLocation);
  const suggest = useServerFn(suggestGoogleLocations);
  const placeDetails = useServerFn(getGooglePlace);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [noSuggestions, setNoSuggestions] = useState(false);
  const [token, setToken] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())));
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) { setSuggestions([]); setNoSuggestions(false); return; }
    let stale = false;
    const timer = window.setTimeout(async () => {
      const show = (items: OsmSuggestion[]) => {
        setOsmPlaces((places) => ({ ...places, ...Object.fromEntries(items.map((s) => [s.placeId, { label: s.label, lat: s.lat, lng: s.lng }])) }));
        setSuggestions(items.map(({ placeId, text }) => ({ placeId, text })));
        setNoSuggestions(!items.length);
      };
      const cached = osmCache.get(text);
      // Google Places and Photon from the device start together, so a refused Google key costs no extra wait.
      // Hosting IPs are often refused by Photon, so its server function is only the last resort.
      const device = cached ? Promise.resolve(cached) : fetch(photonUrl(text), { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)).then((body) => photonSuggestions(body, text)).catch(() => [] as OsmSuggestion[]);
      if (Date.now() >= googleRetryAt) {
        const google = await suggest({ data: { query: text, sessionToken: token } }).catch(() => null);
        if (stale) return;
        if (google?.suggestions.length) { setSuggestions(google.suggestions); setNoSuggestions(false); return; }
        // A refused key (error) keeps failing: skip Google for a few minutes instead of waiting on it each keystroke.
        if (!google || google.error) googleRetryAt = Date.now() + GOOGLE_RETRY_MS;
      }
      let osm = await device;
      if (!osm.length && !stale) osm = (await suggestOsm({ data: { query: text } }).catch(() => null))?.suggestions ?? [];
      if (stale) return;
      if (osm.length) osmCache.set(text, osm);
      show(osm);
    }, 200);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [query, token, suggest, suggestOsm]);
  const pick = async (item: LocationSuggestion) => {
    setSuggestions([]);
    const osm = osmPlaces[item.placeId];
    if (osm) { onSelect(osm); setQuery(""); return; }
    setLoading(true); setError(null);
    try { const result = await placeDetails({ data: { placeId: item.placeId, sessionToken: token } }); if (result.location) { onSelect(result.location); setQuery(""); } else setError(result.error ?? "Zona non trovata."); }
    catch { setError("Dettagli della zona non disponibili."); } finally { setLoading(false); setToken(String(Date.now()) + Math.random().toString(36).slice(2)); }
  };
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!("geolocation" in navigator)) { setError("Il dispositivo non supporta la geolocalizzazione."); return; }
    setLocating(true); setError(null);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const fallback = { label: `La mia posizione (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`, lat: coords.latitude, lng: coords.longitude };
      try { const result = await reverseGoogle({ data: { lat: coords.latitude, lng: coords.longitude } }); onSelect(result.location ?? fallback); }
      catch { onSelect(fallback); } finally { setLocating(false); }
    }, (geoError) => { setLocating(false); setError(geoError.code === 1 ? "Permesso di posizione negato. Abilitalo nelle impostazioni del browser." : "Posizione non disponibile. Riprova all'aperto."); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim().length < 3 || loading) return;
    setLoading(true); setError(null);
    try {
      const result = await searchLocation({ data: { query } }).catch(() => ({ location: undefined, error: undefined }));
      // When Google refuses or fails, OpenStreetMap still finds the place; Google's reason stays visible only if OSM fails too.
      const found = result.location ? result : await searchOsm({ data: { query } }).catch(() => ({ location: undefined, error: undefined }));
      if (found.location) { onSelect(found.location); setQuery(""); } else setError(result.error ?? found.error ?? "Zona non trovata.");
    } catch (searchError) { console.error(searchError); setError("Ricerca della zona non disponibile. Riprova tra poco."); } finally { setLoading(false); }
  };
  return <div className="location-search min-w-0 md:col-span-full"><form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2" role="search"><div className="relative min-w-0"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca una località" aria-label="Cerca una località" className="h-11 rounded-lg bg-lab-surface pl-9 pr-3 font-mono" autoComplete="off" aria-autocomplete="list" aria-controls="location-suggestions" />{suggestions.length > 0 && <ul id="location-suggestions" role="listbox" className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg">{suggestions.map((item) => <li key={item.placeId} role="option" aria-selected={false}><Button variant="ghost" type="button" onClick={() => pick(item)} className="flex h-auto min-h-11 w-full items-center justify-start gap-2 rounded-none px-3 py-2 text-left text-sm"><MapPin className="size-4 shrink-0 text-primary" /><span className="min-w-0 whitespace-normal break-words">{item.text}</span></Button></li>)}</ul>}</div><Button type="submit" size="icon" disabled={loading || query.trim().length < 3} aria-label="Cerca zona" className="size-11 shrink-0 rounded-lg">{loading ? <LoaderCircle className="animate-spin" /> : <Search />}</Button><Button type="button" variant="secondary" onClick={locate} disabled={locating} aria-label="Usa la mia posizione" className="h-11 shrink-0 rounded-lg px-3">{locating ? <LoaderCircle className="animate-spin" /> : <LocateFixed />}<span className="hidden sm:inline">La mia posizione</span></Button></form>{!bare && <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)] sm:items-center md:grid-cols-1 md:items-start lg:grid-cols-[minmax(7rem,12rem)_minmax(0,1fr)] lg:items-center"><div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" /><div className="min-w-0"><span className="block break-words font-medium text-foreground">{splitLocation(initial.label).name}</span>{splitLocation(initial.label).sub && <span className="block break-words">{splitLocation(initial.label).sub}</span>}<span className="mt-1 block font-mono text-[11px]">{initial.lat.toFixed(4)}, {initial.lng.toFixed(4)}</span></div></div><LocationMapPreview location={initial} /></div>}{noSuggestions && !error && query.trim().length >= 2 && <p role="status" className="mt-2 text-xs text-muted-foreground">Nessun suggerimento: premi Cerca per trovare la zona.</p>}{error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}</div>;
}

const MAP_RESIZE_MS = 300;
const LocationMap3D = lazy(() => import("@/views/LocationMap3D").then((m) => ({ default: m.LocationMap3D })));

/** Premium = signed in (registration required), as for the AI camera. */
function useSignedIn() {
  return useSignedInState().signedIn;
}

function LocationMapPreview({ location }: { location: SearchedLocation }) {
  // With a browser key (Maps Embed API, referrer-restricted) use the official embed;
  // otherwise Google's keyless classic embed, so the preview is always Google Maps.
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  // The photorealistic 3D view is Premium: everyone sees the 2D/3D switch, only signed-in users open 3D.
  const premium = useSignedIn();
  const has3d = Boolean(key) && premium;
  const [lockedHint, setLockedHint] = useState(false);
  const [view, setView] = useState<"2d" | "3d">("2d");
  // 3D grows the panel for a better view; 2D shrinks it back first, then swaps to the embed.
  const [expanded, setExpanded] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const collapseTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(collapseTimer.current), []);
  // Signing out while in 3D goes back to the 2D map.
  useEffect(() => { if (!has3d) { setView("2d"); setExpanded(false); } }, [has3d]);
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const choose = (next: "2d" | "3d") => {
    window.clearTimeout(collapseTimer.current);
    if (next === "3d") {
      setView("3d");
      requestAnimationFrame(() => setExpanded(true));
      window.setTimeout(() => panel.current?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }), reducedMotion() ? 0 : MAP_RESIZE_MS);
    } else {
      setExpanded(false);
      collapseTimer.current = window.setTimeout(() => setView("2d"), reducedMotion() ? 0 : MAP_RESIZE_MS);
    }
  };
  const coordinates = `${location.lat},${location.lng}`;
  // The 2D preview is the keyless embed, so it never shows an error when the key does not allow this address.
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(coordinates)}&z=16&hl=it&output=embed`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`;
  // The photorealistic 3D view needs the browser key (Maps JavaScript API + Map Tiles API): without it only 2D is offered.
  const toggle = key && <div className="flex gap-1 rounded-full border-[1.5px] border-solid border-foreground/25 bg-muted p-1" role="group" aria-label="Vista della mappa">{(["2d", "3d"] as const).map((v) => {
    const locked = v === "3d" && !premium;
    return <Button key={v} type="button" size="sm" variant={view === v && !locked ? "default" : "ghost"} aria-pressed={view === v && !locked}
      aria-label={locked ? "3D, riservata agli utenti Premium: accedi per usarla" : undefined}
      onClick={() => { if (locked) setLockedHint(true); else { setLockedHint(false); choose(v); } }}
      className="h-8 min-w-11 gap-1 rounded-full px-3.5 text-xs font-semibold">{locked && <Lock className="size-3" aria-hidden="true" />}{v === "2d" ? "2D" : "3D"}</Button>;
  })}</div>;
  const hint = lockedHint && !premium && <p role="status" className="border-t border-border/60 bg-background/95 px-2 py-1.5 text-xs text-muted-foreground">La vista 3D è riservata agli utenti Premium: accedi o registrati dal menu account.</p>;
  const footer = <span className="flex items-center justify-between gap-2 border-t border-border/60 bg-background/95 px-2 py-1.5 text-xs font-medium text-foreground">{toggle || <span />}<a href={mapsUrl} target="_blank" rel="noreferrer" aria-label={`Apri ${location.label} sulla mappa`} className="inline-flex items-center gap-1">Apri la mappa<MapPin className="size-3 shrink-0 text-primary" aria-hidden="true" /></a></span>;
  if (view === "3d" && has3d && key) return <div ref={panel} className="flex min-w-0 flex-col overflow-hidden rounded-md border bg-lab-surface">
    <div className={cn("w-full transition-[height] duration-300 ease-out motion-reduce:transition-none", expanded ? "h-72 sm:h-80 lg:h-96" : "h-36 sm:h-40")}>
      <Suspense fallback={<div className="h-full w-full bg-lab-surface" />}><LocationMap3D lat={location.lat} lng={location.lng} label={splitLocation(location.label).name} apiKey={key} /></Suspense>
    </div>
    {footer}
  </div>;
  return <div className="flex min-w-0 flex-col overflow-hidden rounded-md border bg-lab-surface">
    <a href={mapsUrl} target="_blank" rel="noreferrer" aria-label={`Apri ${location.label} sulla mappa`} tabIndex={-1} className="block">
      <iframe key={coordinates} title={`Mappa di ${location.label}`} src={src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="pointer-events-none block h-36 w-full border-0 sm:h-40" />
    </a>
    {footer}
    {hint}
  </div>;
}

/** Vibration grows gradually toward the critical vine temperature and adds a warning pulse past it. */
const temperatureHaptic = (t: number) => hapticPattern(temperatureHapticIntensity(t), t >= CRITICAL_TEMPERATURE);

/** Urban sliders have no temperature threshold: vibration grows with the intervention's progress and warns at its maximum. */
const progressHaptic = (max: number) => (value: number) => hapticPattern(Math.max(0, Math.min(1, value / max)), value >= max);

function ControlSlider({ label, value, max, step = 1, unit = "", onChange, hapticFor }: { label: string; value: number; max: number; step?: number; unit?: string; onChange: (value: number) => void; hapticFor?: (value: number) => number[] }) {
  return <div className="simulation-control-slider grid grid-cols-[6.25rem_minmax(0,1fr)_2.75rem] items-center gap-x-2 sm:block sm:space-y-3"><div className="contents sm:flex sm:items-baseline sm:justify-between sm:gap-3"><span className="truncate text-[11px] font-bold uppercase leading-tight text-muted-foreground sm:text-[12px]">{label}</span><strong className="order-last text-right font-mono text-sm sm:order-none sm:text-2xl">{value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}{unit}</strong></div><Slider value={[value]} max={max} step={step} hapticFor={hapticFor} onValueChange={(next) => onChange(next[0] ?? 0)} aria-label={label} /></div>;
}

function PhaseSlider({ value, onChange }: { value: Pheno; onChange: (value: Pheno) => void }) {
  const current = Math.max(0, phenoPhases.indexOf(value));
  return <div className="simulation-phase-slider space-y-3"><div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3"><span className="truncate text-[12px] font-bold uppercase text-muted-foreground">Fase fenologica</span><strong className="truncate font-mono text-sm text-vine">{value}</strong></div><Slider value={[current]} max={phenoPhases.length - 1} step={1} onValueChange={(next) => { const phase = phenoPhases[next[0] ?? 0]; if (phase) onChange(phase); }} aria-label={`Fase fenologica: ${value}`} /><div className="flex justify-between gap-2 text-[9px] text-muted-foreground"><span>{phenoPhases[0]}</span><span>{phenoPhases[phenoPhases.length - 1]}</span></div><p className="text-[11px] leading-snug text-muted-foreground">{PHASE_HINTS[value]}</p></div>;
}

function GridFrame({ children, label, overlay }: { children: ReactNode; label: string; overlay?: ReactNode }) {
  return <div className="thermal-grid-frame mx-auto w-full overflow-hidden rounded-lg border bg-lab-surface p-1.5 sm:overflow-x-auto sm:p-2 xl:max-w-[41rem]"><div className="thermal-grid relative mx-auto grid w-full grid-cols-9 gap-1 rounded-grid sm:w-max sm:p-1" role="grid" aria-label={label}>{children}{overlay}</div></div>;
}

/** Signed-in only: imports current Open-Meteo values as the shared baseline of all three scenarios. */
export function ImportWeatherButton({ onImport }: { onImport?: (() => Promise<void>) | undefined }) {
  const signedIn = useSignedIn();
  const [busy, setBusy] = useState(false);
  if (!onImport || !signedIn) return null;
  return <Button type="button" size="sm" variant="secondary" disabled={busy} className="w-full rounded-full" onClick={async () => { setBusy(true); try { await onImport(); } finally { setBusy(false); } }}>{busy ? <LoaderCircle className="animate-spin" /> : <CloudSun />}{busy ? "Importazione…" : "Importa dal meteo reale"}</Button>;
}

export function SimulationGrid(props: UrbanGridProps | VineyardGridProps) { return props.mode === "urban" ? <UrbanSimulation {...props} /> : <VineyardSimulation {...props} />; }

/** Luogo scelto: nome e riferimento, mostrati sopra la stima nel pannello di controllo. */
function LocationHeading({ location, variant, className }: { location: SearchedLocation; variant: "urban" | "vineyard"; className?: string }) {
  const { name, sub } = splitLocation(location.label);
  return <div className={cn("min-w-0", className)}><div className={cn("break-words font-mono text-[11px] font-bold uppercase", variant === "urban" ? "text-primary" : "text-vine")}>{variant === "urban" ? "·" : "02 · Vigneto ·"} {name}{variant === "urban" ? " -" : ""}</div><div className="mt-0.5 break-words text-xs font-semibold sm:text-sm">{sub || (variant === "urban" ? "Area di intervento" : "Monitoraggio delle sotto-parcelle")}</div></div>;
}

/** I valori della scheda “Confronta” oggi in evidenza, ripetuti in evidenza nel pannello di controllo. */
function LevelSummary({ level, title, compact = false }: { level: PrototypeId; title: string; compact?: boolean }) {
  const info = prototypeLevel(level);
  const tone = levelTone[level];
  return (
    <div className={cn("simulation-level-summary mt-2 min-w-0 rounded-lg border p-2.5 sm:mt-3 sm:p-3", compact && "sm:mt-2 sm:p-2.5", tone.border, tone.sel)}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="min-w-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className={cn("flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide", tone.value)}>
          <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} aria-hidden="true" />
          <span>{info.s}</span>
        </span>
      </div>
      <dl className={cn("mt-2 grid grid-cols-3 gap-x-2 sm:block sm:space-y-1", compact && "sm:mt-1.5 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-4 sm:gap-y-1 sm:space-y-0")}>
        {([["Costo", info.cost], ["Precisione", info.prec], ["Tempi", info.time]] as const).map(([k, v]) => (
          <div key={k} className={cn("flex min-w-0 flex-col gap-0.5 border-b border-current/10 pb-1 last:border-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2", compact && "sm:justify-start sm:gap-1.5 sm:border-0 sm:pb-0")}>
            <dt className={cn("shrink-0 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]", compact && "sm:leading-4")}>{k}</dt>
            <dd className={cn("min-w-0 break-words font-mono text-[12px] font-bold sm:text-right sm:text-xs", compact && "sm:leading-4", tone.value)}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className={cn("mt-1.5 break-words text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:mt-2", compact && "sm:mt-1.5 sm:truncate")}>{info.dt}</p>
    </div>
  );
}

/** Indice di stress del vigneto: sotto i cursori su telefono e desktop, in una fascia piena sotto la griglia su tablet. */
function StressIndex({ result, activeLevel, className, wide = false, heading }: { result: { s: number; priority: string }; activeLevel: PrototypeId; className?: string; wide?: boolean; heading?: ReactNode }) {
  const grape = <Grape className="size-5 shrink-0 text-vine" />;
  const head = <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase text-muted-foreground">Indice di stress</span>{wide ? null : grape}</div>;
  const value = <div className={cn("mt-2 flex items-end gap-2", wide && "mt-1.5")}><strong className="font-mono text-3xl text-vine sm:text-4xl xl:text-5xl">{result.s}</strong><span className="pb-1 text-sm text-muted-foreground">/100</span></div>;
  const bar = <div className={cn("mt-2 h-2 overflow-hidden rounded-full bg-muted", wide ? "mt-1.5" : "sm:mt-3")}><div className={cn("h-full rounded-full transition-[width]", result.s < 35 ? "bg-ok" : result.s < 65 ? "bg-warn" : "bg-danger")} style={{ width: `${result.s}%` }} /></div>;
  const note = <p className={cn("mt-2 text-xs text-muted-foreground", wide ? "mt-1.5" : "sm:mt-3")}>{result.priority}</p>;
  const summary = <LevelSummary level={activeLevel} title="Scenario in evidenza" compact={wide} />;
  if (wide) return <div className={className}><div className="grid min-w-0 items-start gap-x-5 gap-y-2 md:grid-cols-[minmax(0,1fr)_20rem]"><div className="min-w-0">{heading}{head}{value}{bar}{note}</div><div className="flex min-w-0 items-start justify-end gap-2.5"><span>{grape}</span><div className="min-w-0 flex-1 [&_.simulation-level-summary]:mt-0">{summary}</div></div></div></div>;
  return <div className={cn("simulation-stress-index", className)}>{head}{value}{bar}{note}{summary}</div>;
}

function UrbanSimulation({ trees, permeable, shade, onTreesChange, onPermeableChange, onShadeChange, activeLevel, onLocationChange, onReset, onImportWeather }: Omit<UrbanGridProps, "mode">) {
  const [tool, setTool] = useState<Exclude<AreaKind, "parcella">>("albero");
  const [selected, setSelected] = useState<number | null>(null);
  const stored = useLab().urban;
  const pick = (cells: number[] | null, positions: readonly number[], n: number) => new Set(cells && cells.length === n ? cells : positions.slice(0, n));
  const permeableCells = pick(stored.permeableCells, PERMEABLE_POSITIONS, Math.round((permeable / 100) * CELLS.length));
  const shadeCells = pick(stored.shadeCells, SHADE_POSITIONS, Math.round((shade / 100) * CELLS.length));
  const treeCells = pick(stored.treeCells, TREE_POSITIONS, trees);
  const [showBands, setShowBands] = useState(true);
  const location: SearchedLocation = stored.location; const setLocation = (next: SearchedLocation) => setUrban({ location: next });
  const estimate = piazzaEstimate(trees, permeable, shade);
  const siteOffset = Math.max(-3, Math.min(3, (41.56 - location.lat) * 0.6)); const realTemp = stored.realTemp ?? null; const minTemperature = realTemp != null ? Math.round(realTemp) - 8 : 30, maxTemperature = realTemp != null ? Math.round(realTemp) + 2 : 40, centerTemperature = Math.min(maxTemperature, Math.max(minTemperature, (realTemp ?? 40 + siteOffset) - estimate.dT)), influence = (trees + permeable + shade) / 180;
  const changeSurface = (index: number, kind: "permeabile" | "ombra") => { const next = new Set(kind === "permeabile" ? permeableCells : shadeCells); next.has(index) ? next.delete(index) : next.add(index); if (kind === "permeabile") setUrban({ permeableCells: [...next], permeable: Math.round((next.size / CELLS.length) * 100) }); else setUrban({ shadeCells: [...next], shade: Math.round((next.size / CELLS.length) * 100) }); };
  const activateCell = (index: number) => { setSelected(index); if (tool === "albero") { const next = new Set(treeCells); next.has(index) ? next.delete(index) : next.add(index); setUrban({ treeCells: [...next], trees: next.size }); } else changeSurface(index, tool); };
  return <Card className="simulation-card relative z-0 overflow-hidden border p-3 sm:p-5"><div className="simulation-panels grid min-w-0 gap-4 sm:gap-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,17rem)] xl:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)]"><LocationSearch initial={location} onSelect={(next) => { setLocation(next); onLocationChange?.(next); }} />
    <section className="order-2 min-w-0 space-y-4 md:order-1" aria-label="Griglia urbana">
      <div className="simulation-selector-capsule no-scrollbar flex snap-x snap-mandatory flex-nowrap gap-1 overflow-x-auto rounded-full p-1.5 touch-pan-x" role="tablist" aria-label="Intervento da inserire">{INTERVENTIONS.map(({ kind, label, Icon }) => { const value = kind === "albero" ? trees : kind === "permeabile" ? permeable : shade; return <Button key={kind} type="button" size="sm" role="tab" variant={tool === kind ? "default" : "ghost"} onClick={() => setTool(kind)} className="min-h-11 shrink-0 snap-start rounded-full px-3" aria-selected={tool === kind} aria-controls="urban-intervention-grid"><Icon /><span>{label}</span><span className={cn("font-mono text-[11px]", tool === kind ? "text-primary-foreground/80" : "text-muted-foreground")}>{value}{kind === "albero" ? "" : "%"}</span></Button>; })}</div>
      <p className="sr-only" aria-live="polite">Strumento selezionato: {INTERVENTIONS.find((item) => item.kind === tool)?.label}. Tocca una cella per aggiungere o rimuovere l’intervento.</p>
      <div id="urban-intervention-grid"><GridFrame label={`Griglia termica urbana interattiva, strumento ${INTERVENTIONS.find((item) => item.kind === tool)?.label}`}>{CELLS.map((index) => { const x = index % COLS, y = Math.floor(index / COLS), hasTree = treeCells.has(index), isPermeable = permeableCells.has(index), isShade = shadeCells.has(index); const localCooling = (hasTree ? 0.8 : 0) + (isPermeable ? 1.1 : 0) + (isShade ? 1.5 : 0); const temperature = Math.max(minTemperature, thermalValue(centerTemperature, minTemperature, maxTemperature, x, y, influence) - localCooling); const level = temperatureLevel(temperature, minTemperature, maxTemperature); return <Button key={index} type="button" variant="ghost" onClick={() => activateCell(index)} aria-label={`Cella ${index + 1}, ${temperature.toFixed(1)} gradi${hasTree ? ", con albero" : ""}`} aria-pressed={selected === index} className={cn("thermal-grid-cell thermal-cell-interactive relative min-h-0 overflow-visible rounded-grid border border-card/70 dark:border-foreground/15 p-0 shadow-none", showBands ? TEMPERATURE_CLASSES[level] : "bg-card", (tool === "albero" ? hasTree : tool === "permeabile" ? isPermeable : isShade) ? "ring-2 ring-primary/70" : "opacity-70 dark:opacity-90 dark:saturate-125", selected === index && "thermal-cell-selected z-30")} style={{ animationDelay: `${x * 70 + y * 18}ms` }}>{isPermeable && <span className="simulation-permeable-cell pointer-events-none absolute inset-0 rounded-grid" />}{isShade && <span className="simulation-shade pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow-sm" />}{hasTree && <span className="simulation-tree pointer-events-none absolute left-1/2 top-1/2 z-20 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-leaf shadow-lg"><TreePine className="simulation-tree-icon text-primary-foreground" strokeWidth={2.5} /><span className="simulation-tree-foot absolute rounded-full border-2 border-lab-grid bg-card" /><span className="simulation-tree-foot absolute rounded-full border-2 border-lab-grid bg-card" /></span>}</Button>; })}</GridFrame></div><ThermalLegend min={minTemperature} max={maxTemperature} id="urban-grid" /></section>
    <aside className="order-1 min-w-0 space-y-3 sm:space-y-5 md:order-2" aria-label="Scenario B e controlli"><div className="space-y-2.5 rounded-lg border bg-lab-panel p-2.5 sm:space-y-4 sm:p-6 md:space-y-4 xl:space-y-5 xl:p-5"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 sm:pb-3"><strong className="min-w-0 flex-1 truncate font-mono text-[14px] uppercase text-primary">SIMULAZIONE <span className="font-sans text-[12px] font-medium normal-case text-muted-foreground">· simula qui</span></strong><span className="hidden shrink-0 text-[11px] uppercase text-muted-foreground xl:inline">{"\n"}</span><ResetScenarioButton onReset={onReset} className="inline-flex" /></div><LocationHeading location={location} variant="urban" /><LevelSummary level={activeLevel} title="Stima" /></div><div role="group" aria-label="Cursori di intervento, temperatura percepita e intervallo stimato" className="space-y-1.5 rounded-lg border bg-lab-panel px-2.5 py-1.5 sm:space-y-5 sm:p-6 md:space-y-4 md:p-4 xl:space-y-5 xl:p-5"><ControlSlider label="Alberi" value={trees} max={30} onChange={onTreesChange} hapticFor={progressHaptic(30)} /><ControlSlider label="Suolo permeabile" value={permeable} max={100} unit="%" onChange={onPermeableChange} hapticFor={progressHaptic(100)} /><ControlSlider label="Pergole / ombra" value={shade} max={100} unit="%" onChange={onShadeChange} hapticFor={progressHaptic(100)} /><div className="flex items-center justify-between gap-2 rounded-lg bg-warn/15 px-2 py-2 sm:block sm:p-3"><div className="flex items-start justify-between"><div><div className="text-[11px] font-bold uppercase text-muted-foreground">Temperatura percepita</div><div className="mt-0.5 text-[11px] text-primary sm:mt-1 sm:text-xs">Ore 14–17</div></div><TrendingDown className="hidden size-5 text-primary sm:block" /></div><div className="font-mono text-lg font-bold text-primary sm:mt-3 sm:text-3xl xl:text-4xl">−{estimate.lo.toFixed(1)} / −{estimate.hi.toFixed(1)}°C</div></div><div className="flex items-center justify-between gap-2 border-t pt-2 sm:pt-4 md:pt-4"><span className="min-w-0 truncate text-[11px] font-bold uppercase text-muted-foreground sm:text-[12px]">Vista griglia</span><span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground"><Switch id="urban-colors" checked={showBands} onCheckedChange={setShowBands} /><label htmlFor="urban-colors">Termica</label><span>/</span><span>Visiva</span></span></div><div className="rounded-lg border bg-lab-surface/60 px-2.5 py-1.5 sm:p-3" aria-label="Intervallo stimato"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/60 transition-[margin,width] duration-500" style={{ marginLeft: `${Math.min(100, (estimate.lo / 5.5) * 100)}%`, width: `${Math.max(4, ((estimate.hi - estimate.lo) / 5.5) * 100)}%` }} /></div><div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground sm:mt-2"><span>−1°C</span><strong className="truncate">Intervallo stimato</strong><span>−5°C</span></div></div></div></aside>
  </div></Card>;
}

function VineyardSimulation({ activeLevel, onLocationChange, onReset, onImportWeather, onZonesEdit }: VineyardGridProps) {
  const vine = useLab().vineyard;
  const selected = vine.selected;
  const allZones = vine.allZones;
  const setSelected = (value: number) => setVineyard({ selected: value, allZones: false });
  const [showBands, setShowBands] = useState(true);
  const location: SearchedLocation = vine.location; const setLocation = (next: SearchedLocation) => setVineyard({ location: next });
  const selectedZone = vineZones[selected] ?? vineZones[0];
  const zones = vine.zones, phase = vine.phase, setPhase = (value: Pheno) => setVineyard({ phase: value });
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const selectedState = zones[selected];
  const current = allZones ? {
    temperature: vineyardControlValue(zones, null, "temperature"),
    moisture: vineyardControlValue(zones, null, "moisture"),
    wind: vineyardControlValue(zones, null, "wind"),
    rain: zones.every((zone) => zone.rain),
  } : selectedState;
  if (!selectedZone || !current) return null;
  const { temperature, moisture, wind, rain } = current;
  const updateValue = (key: VineyardControl, value: number) => { onZonesEdit?.(); setVineyard((v) => ({
    zones: updateVineyardControl(v.zones, v.allZones ? null : v.selected, key, value),
  })); };
  const setTemperature = (value: number) => updateValue("temperature", value), setMoisture = (value: number) => updateValue("moisture", value), setWind = (value: number) => updateValue("wind", value);
  const setRain = (value: boolean) => { onZonesEdit?.(); setVineyard((v) => ({ zones: v.zones.map((zone, index) => v.allZones || index === v.selected ? { ...zone, rain: value } : zone) })); };
  const siteOffset = Math.max(-3, Math.min(3, (41.83 - location.lat) * 0.6));
  const zoneResults = zones.map((zone) => vineModel({ moisture: zone.moisture, temp: zone.temperature + siteOffset, wind: zone.wind, phase, rain: zone.rain }));
  const selectedResult = zoneResults[selected] ?? vineModel({ moisture, temp: temperature, wind, phase, rain });
  const averageStress = Math.round(average(zoneResults.map((zone) => zone.s)));
  const result = allZones ? {
    ...selectedResult,
    s: averageStress,
    risk: averageStress < 35 ? "basso" as const : averageStress < 65 ? "medio" as const : "elevato" as const,
    priority: "Valore medio proporzionato sulle tre zone",
  } : selectedResult;
  const effectiveTemp = (zone: (typeof zones)[number]) => zone.temperature + siteOffset - (zone.rain ? 3 : 0) - zone.wind * 0.08 + (25 - zone.moisture) * 0.06;
  const perceived = allZones ? zones.reduce((sum, zone) => sum + effectiveTemp(zone), 0) / zones.length : effectiveTemp(zones[selected] ?? zones[0] ?? { temperature, moisture, wind, rain: false });
  const selectZone = (index: number) => { if (vineZones[index]) setSelected(index); };
  return <Card className="simulation-card relative z-0 overflow-hidden border p-3 sm:p-5"><div className="simulation-panels grid min-w-0 gap-4 sm:gap-5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,17rem)] xl:grid-cols-[minmax(0,1fr)_minmax(16rem,19rem)]"><LocationSearch initial={location} onSelect={(next) => { setLocation(next); onLocationChange?.(next); }} />
    <section className="order-2 min-w-0 space-y-4 md:order-1" aria-label="Griglia vitivinicola">
      <GridFrame label="Griglia termica del vigneto">{CELLS.map((index) => { const x = index % COLS, y = Math.floor(index / COLS), zoneIndex = x < 3 ? 0 : x < 6 ? 1 : 2, zone = vineZones[zoneIndex]; if (!zone) return null; const state = zones[zoneIndex]; if (!state) return null; const zoneTemperature = effectiveTemp(state); const value = Math.max(15, Math.min(44, thermalValue(zoneTemperature, 15, 44, x, y, (zoneTemperature - 34) / 10))), wet = state.rain || (x * 7 + y * 3) % 60 < state.moisture, level = temperatureLevel(value, 15, 44), zoneActive = allZones || selected === zoneIndex; return <Button key={index} type="button" variant="ghost" onClick={() => selectZone(zoneIndex)} aria-label={`${zone.z}, ${value.toFixed(1)} gradi, stress ${zoneResults[zoneIndex]?.s ?? 0}`} aria-pressed={zoneActive} className={cn("thermal-grid-cell thermal-cell-interactive relative min-h-0 rounded-grid border border-card/70 dark:border-foreground/15 p-0 shadow-none", showBands ? TEMPERATURE_CLASSES[level] : "bg-card", zoneActive ? "thermal-cell-selected thermal-zone-active z-30" : "thermal-zone-dimmed")} style={{ animationDelay: `${x * 70 + y * 18}ms` }}>{(x + y) % 3 === 0 && <Grape className="size-[42%] text-primary-foreground drop-shadow-sm" />}{wet && (x + y) % 3 !== 0 && <Droplets className="size-[34%] text-primary-foreground/80" />}{y === ROWS - 1 && (x === 1 || x === 4 || x === 7) && <span className="zone-tag absolute bottom-0.5 text-[8px] font-bold text-foreground sm:bottom-1 sm:text-[9px]">Z{zoneIndex + 1}</span>}</Button>; })}</GridFrame><ThermalLegend min={15} max={44} id="vineyard-grid" /><div className="grid grid-cols-3 gap-2">{vineZones.map((zone, index) => <Button key={zone.z} type="button" variant={allZones || selected === index ? "default" : "secondary"} onClick={() => selectZone(index)} aria-pressed={allZones || selected === index} className="h-auto min-w-0 flex-col rounded-md px-1.5 py-2"><span>{zone.z}</span><span className="text-xs opacity-80">{zones[index]?.temperature.toLocaleString("it-IT", { maximumFractionDigits: 1 })}°C · {zoneResults[index]?.s}/100</span></Button>)}</div></section>
    <aside className="order-1 min-w-0 space-y-1.5 sm:space-y-5 md:order-2 md:space-y-4 xl:space-y-5" aria-label="Controlli vitivinicoli"><div className="space-y-2 rounded-lg border bg-lab-panel px-2.5 py-1.5 sm:space-y-4 sm:p-6 md:space-y-4 md:p-4 xl:space-y-5 xl:p-5"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b pb-2 sm:pb-3"><strong className="min-w-0 flex-1 truncate font-mono text-xs uppercase text-vine">{allZones ? "Tutte le zone" : selectedZone.z} · Controlli <span className="font-sans text-[12px] font-medium normal-case text-muted-foreground">· simula qui</span></strong><StatusBadge level={result.risk}>{result.risk === "elevato" ? "Attenzione" : result.risk}</StatusBadge><ResetScenarioButton onReset={onReset} className="hidden xl:inline-flex" /></div><LocationHeading location={location} variant="vineyard" className="md:hidden xl:block" /><StressIndex result={result} activeLevel={activeLevel} className="md:hidden xl:block" /></div><div role="group" aria-label="Cursori, temperatura percepita, vista griglia e fase fenologica" className="space-y-1.5 rounded-lg border bg-lab-panel px-2.5 py-1.5 sm:space-y-5 sm:p-6 md:space-y-4 md:p-4 xl:space-y-5 xl:p-5"><ControlSlider label={allZones ? "Temperatura media" : "Temperatura"} value={temperature} max={45} step={0.1} unit="°C" onChange={setTemperature} hapticFor={temperatureHaptic} /><ControlSlider label={allZones ? "Umidità media suolo" : "Umidità suolo"} value={moisture} max={60} step={0.1} unit="%" onChange={setMoisture} /><ControlSlider label={allZones ? "Vento medio" : "Vento"} value={wind} max={30} step={0.1} unit=" km/h" onChange={setWind} /><div className="flex items-center justify-between gap-2 rounded-lg bg-warn/15 px-2 py-2 sm:block sm:p-3"><div className="flex items-start justify-between"><div><div className="text-[11px] font-bold uppercase text-muted-foreground">Temperatura percepita</div><div className="mt-0.5 text-[11px] text-vine sm:mt-1 sm:text-xs">{allZones ? "Media · 3 zone" : selectedZone.z}</div></div><Thermometer className="hidden size-5 text-vine sm:block" /></div><div className="font-mono text-lg font-bold text-vine sm:mt-3 sm:text-3xl xl:text-4xl">{perceived.toFixed(1)}°C</div></div><div className="flex items-center justify-between gap-2 border-t pt-2 sm:pt-4 md:pt-4"><span className="min-w-0 truncate text-[11px] font-bold uppercase text-muted-foreground sm:text-[12px]">Vista griglia</span><span className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground"><Switch id="vineyard-colors" checked={showBands} onCheckedChange={setShowBands} /><label htmlFor="vineyard-colors">Termica</label><span>/</span><span>Visiva</span></span></div><div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end"><PhaseSlider value={phase} onChange={setPhase} /><div className="flex h-9 items-center gap-2 xl:h-8 xl:shrink-0"><Switch id="vine-rain" checked={rain} onCheckedChange={setRain} /><label htmlFor="vine-rain" className="text-xs font-semibold">{allZones ? "Pioggia · 3 zone" : "Pioggia"}</label><ResetScenarioButton onReset={onReset} className="ml-auto h-6 md:h-7 xl:hidden" /></div></div></div></aside><div className="hidden min-w-0 md:order-3 md:col-span-2 md:block md:rounded-lg md:border md:bg-lab-panel md:px-4 md:py-3 xl:hidden"><StressIndex wide result={result} activeLevel={activeLevel} className="min-w-0" heading={<LocationHeading location={location} variant="vineyard" />} /></div>
  </div></Card>;
}
/** Ricerca località e mappa in una scheda propria, per le simulazioni che non usano la griglia classica. */
/** Just the search (field, search, my position) for a flow's place: the Mappa page shows the place itself. */
export function PlaceSearch({ kind }: { kind: "urban" | "vineyard" }) {
  const lab = useLab();
  const location: SearchedLocation = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  return <LocationSearch bare initial={location} onSelect={(next) => (kind === "urban" ? setUrban({ location: next }) : setVineyard({ location: next }))} />;
}

export function LocationCard({ kind }: { kind: "urban" | "vineyard" }) {
  const lab = useLab();
  const location: SearchedLocation = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  return <Card className="p-3 sm:p-5"><LocationSearch initial={location} onSelect={(next) => (kind === "urban" ? setUrban({ location: next }) : setVineyard({ location: next }))} /></Card>;
}
