import { useRef, useState, type ReactNode } from "react";
import { ArrowRight, Building2, FlaskConical, Grape, Send, CloudSun } from "lucide-react";
import { toast } from "sonner";
import { Card, SectionTitle, StatusBadge } from "@/views/health";
import { LabSyncIndicator } from "@/views/LabSyncIndicator";
import { CompareButton } from "@/views/CompareButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SensorAdvisor } from "@/views/SensorAdvisor";
import { CopernicusPanel } from "@/views/CopernicusPanel";
import { RealClimatePanel } from "@/views/RealClimatePanel";
import { LabMedia } from "@/views/LabMedia";
import { LocationCard, splitLocation, ImportWeatherButton } from "@/views/SimulationGrid";
import { UrbanScene } from "@/views/v2/UrbanScene";
import { VineScene } from "@/views/v2/VineScene";
import { comparison, levelTone, nextPhase, piazzaEstimate, prototypeChoice, type PrototypeId } from "@/models/scenarios";
import { applyVineyardScenario, closestVineyardScenario, vineyardControlValue, vineyardScenarioSteps } from "@/models/vineyard-controls";
import { resetUrban, resetVineyard, setUrban, setVineyard, useLab, vineMetrics, vineyardSituation, type LabState } from "@/models/lab-store";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getRealClimate } from "@/controllers/climate.functions";

type UrbanScenario = {
  name: string;
  dt: string;
  trees: number;
  permeable: number;
  shade: number;
  emphasis: string;
};


function urbanPrototypeLevel(trees: number, permeable: number, shade: number): PrototypeId {
  const intensity = (trees / 30 + permeable / 100 + shade / 100) / 3;
  return intensity < 0.2 ? "zero" : intensity < 0.65 ? "mvp" : "roadmap";
}


function ComparisonTable({ place, trees, permeable, shade, activeLevel, onApply, realTemp }: { realTemp?: number | null | undefined; place: { name: string; sub: string }; trees: number; permeable: number; shade: number; activeLevel: PrototypeId; onApply: (id: PrototypeId, trees: number, permeable: number, shade: number) => void }) {
  const scenarios: UrbanScenario[] = [
    {
      name: "Zero Budget",
      dt: "Wizard of Oz",
      trees: Math.max(2, Math.round(trees * 0.6)),
      permeable: Math.max(10, Math.round(permeable * 0.6)),
      shade: Math.max(10, Math.round(shade * 0.6)),
      emphasis: "Osservazioni e dati aperti sulle aree più esposte: validiamo il bisogno",
    },
    {
      name: "Sostenibile",
      dt: "MVP · da prototipare",
      trees,
      permeable,
      shade,
      emphasis: "Interventi impostati nella griglia, misurati con pochi sensori mirati",
    },
    {
      name: "Budget Sostenuto",
      dt: "Roadmap 4.0",
      trees: Math.min(30, Math.max(trees + 6, Math.round(trees * 1.5))),
      permeable: Math.min(100, Math.max(permeable + 15, Math.round(permeable * 1.35))),
      shade: Math.min(100, Math.max(shade + 15, Math.round(shade * 1.35))),
      emphasis: "Rinverdimento esteso a regime, dopo la validazione dell’MVP",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="min-w-0 rounded-lg border bg-muted/45 p-3">
        <p className="truncate font-semibold">{place.name}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{place.sub || "Zona urbana selezionata"}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {scenarios.map((scenario) => {
          const estimate = piazzaEstimate(scenario.trees, scenario.permeable, scenario.shade);
          const scenarioId: PrototypeId = scenario.name === "Zero Budget" ? "zero" : scenario.name === "Sostenibile" ? "mvp" : "roadmap";
          const selected = scenarioId === activeLevel;
          const tone = levelTone[scenarioId];
          return (
            <button
              key={scenario.name}
              type="button"
              onClick={() => onApply(scenarioId, scenario.trees, scenario.permeable, scenario.shade)}
              aria-pressed={selected}
              aria-label={`Applica lo scenario ${scenario.name} alla griglia`}
              className={`min-w-0 cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone.border} ${selected ? tone.sel : "bg-card"}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <h3 className="flex min-w-0 items-center gap-2 break-words text-sm font-semibold"><span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />{scenario.name}</h3>
                {selected && <StatusBadge level="basso">In evidenza</StatusBadge>}
              </div>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">{scenario.dt}</p>
              <p className="mt-1 min-h-8 text-xs text-muted-foreground">{scenario.emphasis}</p>
              <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Alberi</dt><dd className="font-mono text-sm font-semibold">{scenario.trees}</dd></div>
                <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Suolo</dt><dd className="font-mono text-sm font-semibold">{scenario.permeable}%</dd></div>
                <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Ombra</dt><dd className="font-mono text-sm font-semibold">{scenario.shade}%</dd></div>
              </dl>
              <div className="mt-3 border-t pt-3">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Riduzione stimata</span>
                <p className={`mt-1 font-mono text-lg font-bold ${tone.value}`}>−{estimate.lo.toFixed(1)} / −{estimate.hi.toFixed(1)}°C</p>
                {realTemp != null && <p className="mt-1 text-xs">Meteo reale <span className="font-mono font-semibold">{realTemp.toLocaleString("it-IT")}°C</span> → percepita <span className="font-mono font-semibold">{(realTemp - (estimate.lo + estimate.hi) / 2).toFixed(1)}°C</span></p>}
              </div>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{selected ? "Scenario applicato" : "Tocca per applicare"}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PrototypeMatrix({ kind, activeLevel }: { kind: "urban" | "vineyard"; activeLevel: PrototypeId }) {
  return (
    <section aria-labelledby={`proto-${kind}`} className="space-y-3">
      <div className="flex items-center gap-2"><FlaskConical className="size-5 shrink-0 text-primary" /><h3 id={`proto-${kind}`} className="font-semibold">Matrice di prototipazione · Design Thinking</h3></div>
      <div className="grid gap-3 md:grid-cols-3">
        {comparison.map((l) => {
          const selected = l.id === activeLevel;
          const tone = levelTone[l.id];
          return (
          <div key={l.id} className={`min-w-0 rounded-lg border p-3 ${tone.border} ${selected ? tone.sel : "bg-card"}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <h4 className="flex min-w-0 items-center gap-2 break-words text-sm font-semibold"><span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />{l.s}</h4>
              {selected && <StatusBadge level="basso">In evidenza</StatusBadge>}
            </div>
            <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.value}`}>{l.dt}</p>
            <p className="mt-2 text-xs text-muted-foreground">{l.def}</p>
            <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Costo</dt><dd className="font-mono text-xs font-semibold">{l.cost}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Precisione</dt><dd className="break-words font-mono text-xs font-semibold">{l.prec}</dd></div>
              <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Tempi</dt><dd className="break-words font-mono text-xs font-semibold">{l.time}</dd></div>
            </dl>
            <div className="mt-3 border-t pt-3">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Obiettivo di test</span>
              <p className="mt-1 text-sm">{l.test[kind]}</p>
            </div>
          </div>
        );})}
      </div>
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm"><span className="font-semibold">Perché l’MVP sostenibile: </span>{prototypeChoice}</div>
      <p className="flex items-start gap-2 text-sm font-medium"><ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" />{nextPhase}</p>
    </section>
  );
}

function VineComparison({ v, base, activeLevel, onApply }: { v: LabState["vineyard"]; base: LabState["vineyard"]["zones"]; activeLevel: PrototypeId; onApply: (id: PrototypeId, boost: number, cool: number, zoneIndex: number | null) => void }) {
  // Zone picker is synced with the shared store: the same selection drives the zone tabs and the thermal grid.
  const zoneIndex: number | null = v.allZones ? null : v.selected;
  const pickZone = (index: number | null) => index === null ? setVineyard({ allZones: true }) : setVineyard({ selected: index, allZones: false });
  const zoneLabel = zoneIndex === null ? "Tutte le zone" : `Zona ${zoneIndex + 1}`;
  const applyTo = (zones: LabState["vineyard"]["zones"], boost: number, cool: number) =>
    applyVineyardScenario(zones, boost, cool, zoneIndex);
  // Same value the control slider shows after applying: the selected zone, or the rounded mean of all zones.
  const sliderValue = (sc: { boost: number; cool: number }, key: "temperature" | "moisture") => {
    const zones = applyTo(base, sc.boost, sc.cool);
    const raw = vineyardControlValue(zones, zoneIndex, key);
    return (Math.round(raw * 10) / 10).toLocaleString("it-IT", { maximumFractionDigits: 1 });
  };
  const copy = {
    zero: { name: "Zero Budget", dt: "Wizard of Oz", emphasis: "Stato attuale delle zone, osservato a mano e con dati aperti" },
    mvp: { name: "Sostenibile", dt: "MVP · da prototipare", emphasis: "Irrigazione mirata guidata dai sensori sulle zone più asciutte" },
    roadmap: { name: "Budget Sostenuto", dt: "Roadmap 4.0", emphasis: "Telemetria continua e irrigazione di precisione a regime" },
  } as const;
  const scen = vineyardScenarioSteps.map((step) => ({ ...step, ...copy[step.id] }));
  return (
    <div className="space-y-4">
      <div className="min-w-0 rounded-lg border bg-muted/45 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Dove applicare lo scenario</p>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Scegli la zona del vigneto">
          <button
            type="button"
            onClick={() => pickZone(null)}
            aria-pressed={zoneIndex === null}
            className={`min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${zoneIndex === null ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted/60"}`}
          >
            Tutte le zone
          </button>
          {v.zones.map((z, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickZone(i)}
              aria-pressed={zoneIndex === i}
              className={`min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${zoneIndex === i ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted/60"}`}
            >
              Zona {i + 1} · {Math.round(z.temperature)}°C · {Math.round(z.moisture)}%
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {scen.map((sc) => {
          // Scenarios act on the live zone values: irrigation raises moisture, canopy management lowers leaf temperature.
          const m = vineMetrics({ ...v, zones: applyTo(base, sc.boost, sc.cool) });
          const attn = m.results.filter((r) => r.s >= 60).length;
          const tone = levelTone[sc.id];
          const selected = sc.id === activeLevel;
          return (
            <div key={sc.name} className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => onApply(sc.id, sc.boost, sc.cool, zoneIndex)}
              aria-pressed={selected}
              aria-label={`Applica lo scenario ${sc.name} a ${zoneLabel}`}
              className={`min-w-0 cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone.border} ${selected ? tone.sel : "bg-card"}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2"><h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold"><span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />{sc.name}</h3>{selected && <StatusBadge level="basso">In evidenza</StatusBadge>}</div>
              <p className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.value}`}>{sc.dt}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-vine">Agisce su: {zoneLabel}</p>
              <p className="mt-1 min-h-8 text-xs text-muted-foreground">{sc.emphasis}</p>
              <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Temperatura</dt><dd className="font-mono text-sm font-semibold">{sliderValue(sc, "temperature")}°C</dd></div>
                <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Umidità suolo</dt><dd className="font-mono text-sm font-semibold">{sliderValue(sc, "moisture")}%</dd></div>
                <div className="rounded-md bg-muted p-2"><dt className="text-[10px] text-muted-foreground">Intervento</dt><dd className="font-mono text-xs font-semibold">{sc.boost || sc.cool ? `−${sc.cool}°C / +${sc.boost}%` : "Nessuno"}</dd></div>
              </dl>
              <p className="mt-3 border-t pt-3 text-xs">Stress idrico <span className="font-semibold">{m.waterStress}</span> · termico <span className="font-semibold">{m.heatStress}</span> · <span className="font-semibold">{attn}</span> {attn === 1 ? "zona" : "zone"} su {v.zones.length} in attenzione · fase {v.phase}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{selected ? "Scenario applicato" : "Tocca per applicare"}</p>
            </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonDialog({ children, matrix, onImportWeather }: { children: ReactNode; matrix: ReactNode; onImportWeather?: () => Promise<void> }) {
  const [tab, setTab] = useState<"scenarios" | "matrix">("scenarios");
  return (
    <DialogContent className="grid h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-lg p-0 sm:block sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:overflow-y-auto sm:overscroll-contain">
      <div className="relative z-10 bg-background">
        <DialogHeader className="border-b px-4 pb-3 pr-16 pt-5 sm:px-6 sm:pr-16">
          <DialogTitle>Confronto scenari</DialogTitle>
        </DialogHeader>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 pb-2 pt-2 text-xs text-muted-foreground sm:px-6">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" aria-hidden="true" />Costo zero</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand-turquoise" aria-hidden="true" />Costo medio</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warn" aria-hidden="true" />Budget sostenuto</span>
        </p>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 sm:overflow-visible sm:px-6 sm:pb-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "scenarios" | "matrix")} className="min-w-0 pt-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-lg bg-nav-accent/[0.06] p-1">
            {([["scenarios", "Confronto scenari", "aggiornato in tempo reale"], ["matrix", "Matrice di prototipazione", "Design Thinking"]] as const).map(([value, title, sub]) => (
              <TabsTrigger key={value} value={value} onClick={() => setTab(value)} className="group flex min-h-10 min-w-0 flex-col items-center justify-center gap-0.5 whitespace-normal rounded-md px-2 py-1.5 text-center leading-tight text-nav-accent-ink/80 data-[state=active]:bg-nav-accent/85 data-[state=active]:text-nav-accent-foreground data-[state=active]:shadow-none">
                <span className="text-xs font-medium sm:text-sm">{title}</span>
                <span className="hidden text-[10px] font-normal opacity-70 min-[380px]:block sm:text-xs">{sub}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="scenarios" className="mt-4 space-y-4"><ImportWeatherButton onImport={onImportWeather} />{children}</TabsContent>
          <TabsContent value="matrix" className="mt-4">{matrix}</TabsContent>
        </Tabs>
      </div>
    </DialogContent>
  );
}

/** Simulazione urbana completa: riepilogo con Confronta, dati reali, media, griglia. */
export function UrbanFlow() {
  const [compareOpen, setCompareOpen] = useState(false);
  const [pinned, setPinned] = useState<PrototypeId | null>(null);
  const [baseline, setBaseline] = useState<LabState["urban"] | null>(null);
  const [appliedUrban, setAppliedUrban] = useState<LabState["urban"] | null>(null);
  const suggested = useRef<{ id: PrototypeId; base: LabState["urban"]; values: LabState["urban"] } | null>(null);
  const showComparison = () => setCompareOpen(true);
  const urban = useLab().urban;
  const { trees, permeable, shade, location } = urban;
  // Manual slider, cell or location edits establish a fresh comparison baseline.
  const edited = appliedUrban && (
    trees !== appliedUrban.trees || permeable !== appliedUrban.permeable || shade !== appliedUrban.shade ||
    urban.treeCells !== appliedUrban.treeCells || urban.permeableCells !== appliedUrban.permeableCells ||
    urban.shadeCells !== appliedUrban.shadeCells || location !== appliedUrban.location
  );
  if (edited) { setAppliedUrban(null); setBaseline(null); setPinned(null); }
  const base = edited ? urban : baseline ?? urban;
  const setTrees = (v: number) => { setPinned(null); setUrban({ trees: v }); }, setPermeable = (v: number) => { setPinned(null); setUrban({ permeable: v }); }, setShade = (v: number) => { setPinned(null); setUrban({ shade: v }); };
  const place = splitLocation(location.label);
  const activeLevel = pinned ?? urbanPrototypeLevel(trees, permeable, shade);
  const applyScenario = (id: PrototypeId, t: number, p: number, s: number) => {
    const next = { ...urban, trees: t, permeable: p, shade: s, treeCells: null, permeableCells: null, shadeCells: null };
    suggested.current = { id, base, values: next };
    setBaseline(base); setAppliedUrban(next); setPinned(id); setUrban(next);
  };

  const fetchClimate = useServerFn(getRealClimate);
  const importRealWeather = async () => {
    const r = await fetchClimate({ data: { lat: location.lat, lng: location.lng } }).catch(() => null);
    const t = r?.openMeteo?.temp;
    if (t == null) { toast.error("Meteo reale non disponibile, riprova tra poco"); return; }
    setUrban({ realTemp: Math.round(t * 10) / 10 });
    toast.success(`Importati ${t.toLocaleString("it-IT")}°C da Open-Meteo su tutte le schede`);
  };
  const restoreScenario = () => {
    const target = suggested.current;
    if (!target) { resetUrban(); return; }
    const next = { ...target.values, location: urban.location };
    setBaseline({ ...target.base, location: urban.location }); setAppliedUrban(next); setPinned(target.id); setUrban(next);
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-[var(--nav-h)] z-[999999998] isolate -mx-4 transition-[top] duration-300">
        <div className="border-b bg-background px-4 py-2"><LabSyncIndicator className="max-w-full" /></div>
        <Card className="lab-summary flex items-center justify-between gap-2 rounded-none border-x-0 border-t-0 bg-card px-3 py-2 shadow-sm sm:gap-4 sm:px-6 sm:py-2 xl:py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 font-semibold sm:gap-x-3"><Building2 className="size-5 shrink-0 text-urban" /><span className="min-w-0 break-words text-[1.0625rem] leading-6">{place.name}</span><p className="hidden min-w-0 basis-48 flex-1 truncate text-sm font-normal text-muted-foreground sm:block">{place.sub}</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <CompareButton level={activeLevel} onClick={showComparison} />
          </div>
        </Card>
      </div>

      <UrbanScene onReset={restoreScenario} />
      <RealClimatePanel kind="urban" />
      <CopernicusPanel kind="urban" />
      <SensorAdvisor kind="urban" />
      <LabMedia kind="urban" context={`Scenario: ${comparison.find((l) => l.id === activeLevel)?.s ?? "attuale"}`} />
      <LocationCard kind="urban" />
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <ComparisonDialog onImportWeather={importRealWeather} matrix={<PrototypeMatrix kind="urban" activeLevel={activeLevel} />}><ComparisonTable realTemp={urban.realTemp} place={place} trees={base.trees} permeable={base.permeable} shade={base.shade} activeLevel={activeLevel} onApply={applyScenario} /></ComparisonDialog>
      </Dialog>
    </div>
  );
}

/** Simulazione del vigneto completa: riepilogo con Confronta e invio, dati reali, media, griglia. */
export function VineyardFlow() {
  const [send, setSend] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [pinned, setPinned] = useState<PrototypeId | null>(null);
  // Baseline = zones before any scenario was applied; scenarios are applied on it (never stacked).
  const [baseline, setBaseline] = useState<LabState["vineyard"]["zones"] | null>(null);
  const [appliedZones, setAppliedZones] = useState<LabState["vineyard"]["zones"] | null>(null);
  const suggested = useRef<{ id: PrototypeId; base: LabState["vineyard"]["zones"]; values: LabState["vineyard"] } | null>(null);
  const showComparison = () => setCompareOpen(true);
  const vineyard = useLab().vineyard;
  const fetchClimate = useServerFn(getRealClimate);
  // Signed-in only: real Open-Meteo values become the new Zero Budget baseline; zones keep their relative differences.
  const importRealWeather = async () => {
    const { lat, lng } = vineyard.location;
    const r = await fetchClimate({ data: { lat, lng } }).catch(() => null);
    const om = r?.openMeteo;
    if (!om || om.temp == null) { toast.error("Meteo reale non disponibile, riprova tra poco"); return; }
    const soil = om.soilMoisture != null ? om.soilMoisture * 100 : null;
    // Real values land on every zone, so all three scenario cards start from the same real baseline.
    const zones = vineyard.zones.map((z) => ({
      ...z,
      temperature: Math.max(0, Math.min(45, Math.round(om.temp!))),
      moisture: soil == null ? z.moisture : Math.max(0, Math.min(60, Math.round(soil))),
      wind: om.wind != null ? Math.max(0, Math.min(30, Math.round(om.wind))) : z.wind,
    }));
    suggested.current = null; setBaseline(null); setAppliedZones(null); setPinned("zero"); setVineyard({ zones });
    toast.success(`Importati ${om.temp.toLocaleString("it-IT")}°C${soil != null ? ` e umidità suolo ${Math.round(soil)}%` : ""} da Open-Meteo`);
  };
  const base = baseline ?? vineyard.zones;
  // Slider edits keep the cards anchored on the baseline, so the highlight can follow the sliders.
  const onZonesEdit = () => { if (!baseline) setBaseline(vineyard.zones); setAppliedZones(null); setPinned(null); };
  const place = splitLocation(vineyard.location.label).name;
  // Highlighted scenario = the Confronta card whose values the sliders currently match most closely.
  const activeLevel: PrototypeId = pinned ?? closestVineyardScenario(vineyard.zones, base, vineyard.allZones ? null : vineyard.selected);
  const situation = vineyardSituation(vineyard);
  const applyScenario = (id: PrototypeId, boost: number, cool: number, zoneIndex: number | null) => {
    const zones = applyVineyardScenario(base, boost, cool, zoneIndex);
    suggested.current = { id, base, values: { ...vineyard, zones } };
    setBaseline(base); setAppliedZones(zones); setPinned(id); setVineyard({ zones });
  };
  const restoreScenario = () => {
    const target = suggested.current;
    if (!target) { setBaseline(null); setAppliedZones(null); setPinned(null); resetVineyard(); return; }
    setBaseline(target.base); setAppliedZones(target.values.zones); setPinned(target.id);
    setVineyard({ ...target.values, location: vineyard.location });
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-[var(--nav-h)] z-[999999998] isolate -mx-4 transition-[top] duration-300">
        <div className="border-b bg-background px-4 py-2"><LabSyncIndicator className="max-w-full" /></div>
        <Card className="lab-summary flex items-center justify-between gap-2 rounded-none border-x-0 border-t-0 bg-card px-3 py-2 shadow-sm sm:gap-4 sm:px-6 sm:py-2 xl:py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-x-3"><Grape className="size-5 shrink-0 text-vine" /><h3 className="min-w-0 break-words font-semibold">Vigneto · {place}</h3><span className="hidden lg:inline-flex"><span aria-live="polite" title={`Indice massimo ${situation.peak}/100`}><StatusBadge level={situation.level}>{situation.label} · {situation.peak}</StatusBadge></span></span></div>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 min-[380px]:gap-2 sm:gap-2">
            <p className="hidden min-w-0 max-w-72 flex-1 truncate text-sm text-muted-foreground lg:block">{situation.caption}</p>
            <CompareButton level={activeLevel} onClick={showComparison} className="sm:mr-1" /><Button size="sm" onClick={() => setSend(true)} aria-label="Invia i dati all’agronomo" className="rounded-full bg-vine px-2.5 hover:bg-vine/90 min-[380px]:px-3 sm:h-10 sm:px-4"><Send /><span className="hidden min-[380px]:inline sm:hidden">Invia</span><span className="hidden sm:inline">Invia i dati all’agronomo</span></Button>
          </div>
        </Card>
      </div>

      <VineScene onReset={restoreScenario} onZonesEdit={onZonesEdit} />
      <RealClimatePanel kind="vineyard" />
      <CopernicusPanel kind="vineyard" />
      <SensorAdvisor kind="vineyard" />
      <LabMedia kind="vineyard" context={`${vineyard.allZones ? "Tutte le zone" : `Zona ${vineyard.selected + 1}`} · ${vineyard.phase}`} />
      <LocationCard kind="vineyard" />
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <ComparisonDialog onImportWeather={importRealWeather} matrix={<PrototypeMatrix kind="vineyard" activeLevel={activeLevel} />}><VineComparison v={vineyard} base={base} activeLevel={activeLevel} onApply={applyScenario} /></ComparisonDialog>
      </Dialog>
      <Dialog open={send} onOpenChange={setSend}>
        <DialogContent><DialogHeader><DialogTitle>Inviare i dati all’agronomo?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Verranno condivisi i dati delle tre zone, con la Zona 3 segnalata a livello di attenzione. L’invio è dimostrativo.</p><DialogFooter><Button variant="secondary" onClick={() => setSend(false)}>Annulla</Button><Button className="bg-vine hover:bg-vine/90" onClick={() => { setSend(false); toast.success("Dati inviati all’agronomo"); }}>Invia</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
