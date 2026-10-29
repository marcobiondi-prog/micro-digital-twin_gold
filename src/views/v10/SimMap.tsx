import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Hand, Lock, MapPin, PenLine, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import { useSignedIn } from "@/lib/use-signed-in";
import { openAccount } from "@/lib/camera-dock";
import { DEMO_LOGIN_AVAILABLE, setDemoSignedIn } from "@/lib/demo-login";
import { cn } from "@/lib/utils";
import { setUrban, setVineyard, useLab, vineMetrics } from "@/models/lab-store";
import { piazzaLayout, vineLayout, type LayoutEdits } from "@/models/area-layout";
import { vineMixOf, zoneMixOf } from "@/models/vine-interventions";
import { SIM_COLORS, thirstColor, type SimLayout } from "@/views/v10/map-area";
import type { MovedPart } from "@/views/v10/SatelliteMap2D";
import { drawnAreaFor, MAX_PINS, pinsM2, surfaceText } from "@/models/drawn-area";
import type { Ring } from "@/models/place-area";
import type { SimKind } from "@/views/v8/console";
import { PlaceSearch } from "@/views/SimulationGrid";

const OpenMap3D = lazy(() => import("@/views/v10/OpenMap3D").then((m) => ({ default: m.OpenMap3D })));
const SatelliteMap2D = lazy(() => import("@/views/v10/SatelliteMap2D").then((m) => ({ default: m.SatelliteMap2D })));
const LocationMap3D = lazy(() => import("@/views/LocationMap3D").then((m) => ({ default: m.LocationMap3D })));

/**
 * The "Mappa" tab of a simulator (beside Simula): the place of this simulation on a big interactive map,
 * with the search to change it and the 2D / 3D switch.
 */
export function SimMap({ kind }: { kind: SimKind }) {
  const lab = useLab();
  const loc = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const [name, ...rest] = loc.label.split(" · ");
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const zoom = kind === "urban" ? 17 : 14;
  // The 2D map is open satellite imagery that needs no key (so it never shows an error when the key does not allow this
  // address), moved with one finger: the embedded map it replaces asked for two fingers on phones and could not be told otherwise.
  // 2D is the default; 3D (photorealistic, needs the browser key) opens only for signed-in users:
  // guests see the switch with a lock, and touching it offers the sign-in.
  const { signedIn } = useSignedIn();
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [hint, setHint] = useState(false);
  useEffect(() => { if (!signedIn) setView("2d"); else setHint(false); }, [signedIn]);
  // Always both: with the browser key 3D is the photorealistic view, without it an open map with the buildings raised.
  const show3d = view === "3d" && signedIn;
  const zoom3d = kind === "urban" ? 17 : 15;
  // The area drawn with pins for this place (kept with the simulation), and the pins being placed while drawing.
  const saved = drawnAreaFor(kind === "urban" ? lab.urban.area : lab.vineyard.area, loc);
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Ring>([]);
  useEffect(() => { setDrawing(false); }, [loc.lat, loc.lng]);
  const ring = drawing ? draft : saved?.ring ?? [];
  const save = (r: Ring | null) => {
    // A new outline lays the simulation out afresh (hand edits belonged to the old one).
    const area = r && r.length >= 3 ? { lat: loc.lat, lng: loc.lng, ring: r } : null;
    if (kind === "urban") setUrban({ area }); else setVineyard({ area });
  };
  const startDrawing = () => { setView("2d"); setDraft(saved?.ring ?? []); setDrawing(true); };
  const finish = () => {
    if (draft.length < 3) { toast("Servono almeno 3 pin per chiudere l'area"); return; }
    save(draft); setDrawing(false);
    toast.success("Area salvata", { description: `${surfaceText(pinsM2(draft))}: la usano i costi e i benefici.` });
  };
  const remove = () => { save(null); setDrawing(false); setDraft([]); toast("Area cancellata", { description: "Torna la superficie misurata o di riferimento." }); };
  // The simulation inside the saved area: automatic from the levers, plus what was moved by hand (kept with the area).
  const [arranging, setArranging] = useState(false);
  useEffect(() => { if (!saved) setArranging(false); }, [saved]);
  const sim = useMemo<SimLayout | null>(() => {
    if (!saved) return null;
    const edits = saved.edits ?? {};
    if (kind === "urban") {
      const data = piazzaLayout(saved.ring, lab.urban.trees, lab.urban.permeable, lab.urban.shade, edits);
      return data ? { kind: "piazza", data } : null;
    }
    const v = lab.vineyard, fallback = vineMixOf(v);
    const data = vineLayout(saved.ring, v.zones.map((z) => zoneMixOf(z, fallback)), edits);
    return data ? { kind: "vigneto", data, thirst: vineMetrics(v).results.map((r) => r.s) } : null;
  }, [saved, kind, lab.urban, lab.vineyard]);
  const setEdits = (edits: LayoutEdits) => {
    if (!saved) return;
    const area = { ...saved, edits };
    if (kind === "urban") setUrban({ area }); else setVineyard({ area });
  };
  const moved = (m: MovedPart) => {
    const e = saved?.edits ?? {};
    if (m.part === "tree") { const trees = [...(e.trees ?? [])]; trees[m.index] = m.at; setEdits({ ...e, trees }); }
    else setEdits({ ...e, [m.part === "lawn" ? "lawnAt" : m.part === "shade" ? "shadeAt" : "windAt"]: m.at });
  };
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name}</p>
            {rest.length > 0 && <p className="truncate text-sm text-muted-foreground">{rest.join(" · ")}</p>}
          </div>
        </div>
        <div role="group" aria-label="Vista della mappa" className="flex shrink-0 rounded-full bg-foreground/[0.08] p-1">
          {(["2d", "3d"] as const).map((v) => {
            const locked = v === "3d" && !signedIn, on = view === v && !locked;
            return (
              <button key={v} type="button" aria-pressed={on} aria-label={locked ? "3D: accedi per usarla" : v === "2d" ? "2D" : "3D"}
                onClick={() => { if (locked) setHint(true); else { setHint(false); setView(v); } }}
                className={cn("inline-flex h-10 min-w-12 items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", on ? "bg-foreground text-background" : "text-foreground/80")}>
                {locked && <Lock className="size-3.5" aria-hidden="true" />}{v === "2d" ? "2D" : "3D"}
              </button>
            );
          })}
        </div>
      </div>
      {hint && !signedIn && (
        <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">La vista 3D è per chi ha fatto l'accesso.
          <button type="button" onClick={openAccount} className="font-semibold text-foreground underline underline-offset-4">Accedi</button>
          {/* Previews only: unlock the 3D view on this device without an account. */}
          {DEMO_LOGIN_AVAILABLE && <button type="button" onClick={() => { setDemoSignedIn(true); setView("3d"); }} className="font-semibold text-foreground underline underline-offset-4">Simula l'accesso</button>}
        </p>
      )}
      {/* The place is chosen here: search it or use the device position; the map follows. */}
      <PlaceSearch kind={kind} />
      <div className="-mx-4 h-[52vh] min-h-72 overflow-hidden bg-card sm:mx-0 sm:rounded-3xl">
        {show3d
          ? <Suspense fallback={<div className="h-full w-full bg-card" />}>{key
            ? <LocationMap3D key={`${loc.lat},${loc.lng}`} lat={loc.lat} lng={loc.lng} label={name ?? ""} apiKey={key} area={ring} sim={sim}
              fallback={<OpenMap3D lat={loc.lat} lng={loc.lng} label={name ?? ""} zoom={zoom3d} area={ring} sim={sim} />} />
            : <OpenMap3D key={`${loc.lat},${loc.lng}`} lat={loc.lat} lng={loc.lng} label={name ?? ""} zoom={zoom3d} area={ring} sim={sim} />}</Suspense>
          : <Suspense fallback={<div className="h-full w-full bg-card" />}><SatelliteMap2D key={`${loc.lat},${loc.lng}`} lat={loc.lat} lng={loc.lng} label={name ?? ""} zoom={zoom} area={ring} drawing={drawing} onAreaChange={setDraft} sim={sim} arranging={arranging} onMove={moved} /></Suspense>}
      </div>
      <AreaBar drawing={drawing} pins={ring.length} m2={ring.length >= 3 ? pinsM2(ring) : null} saved={!!saved} vineyard={kind === "vineyard"}
        onStart={() => { setArranging(false); startDrawing(); }} onUndo={() => setDraft((d) => d.slice(0, -1))} onCancel={() => setDrawing(false)} onFinish={finish} onRemove={remove} />
      {sim && !drawing && <SimBar sim={sim} arranging={arranging} edited={!!saved?.edits && Object.keys(saved.edits).length > 0}
        onArrange={() => { setView("2d"); setArranging((a) => !a); }} onAuto={() => { setEdits({}); toast("Disposizione automatica ripristinata"); }} />}
    </div>
  );
}

const barBtn = "inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

/**
 * Under the map: the drawn area and what to do with it. Not drawing: "Disegna l'area", or the saved area's surface with
 * Modifica / Cancella. Drawing (on the 2D map): how many pins and the surface so far, Annulla ultimo pin, Esci, Fine.
 */
function AreaBar({ drawing, pins, m2, saved, vineyard, onStart, onUndo, onCancel, onFinish, onRemove }: {
  drawing: boolean; pins: number; m2: number | null; saved: boolean; vineyard: boolean;
  onStart: () => void; onUndo: () => void; onCancel: () => void; onFinish: () => void; onRemove: () => void;
}) {
  if (drawing) {
    return (
      <div role="group" aria-label="Disegna l'area" className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4">
        <p className="text-[15px] font-semibold">Tocca la mappa sugli angoli dell'area</p>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {pins === 0 ? `Metti un pin su ogni angolo del${vineyard ? " vigneto" : "la piazza"}; trascinali per correggerli.` : `${pins} pin${m2 !== null ? ` · ${surfaceText(m2)}` : " · ne servono almeno 3"}${pins >= MAX_PINS ? " · massimo raggiunto" : ""}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onUndo} disabled={pins === 0} className={cn(barBtn, "bg-foreground/[0.08]")}><Undo2 className="size-4" aria-hidden="true" />Ultimo pin</button>
          <button type="button" onClick={onCancel} className={cn(barBtn, "bg-foreground/[0.08]")}><X className="size-4" aria-hidden="true" />Esci</button>
          <button type="button" onClick={onFinish} disabled={pins < 3} className={cn(barBtn, "ml-auto bg-foreground text-background")}><Check className="size-4" aria-hidden="true" />Fine</button>
        </div>
      </div>
    );
  }
  if (saved && m2 !== null) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-foreground/[0.05] p-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Area disegnata · {surfaceText(m2)}</span>
          <span className="block text-sm text-muted-foreground">La usano i costi e i benefici al posto della superficie misurata.</span>
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onStart} className={cn(barBtn, "bg-foreground/[0.08]")}><PenLine className="size-4" aria-hidden="true" />Modifica</button>
          <button type="button" onClick={onRemove} aria-label="Cancella l'area disegnata" className={cn(barBtn, "bg-foreground/[0.08] px-3")}><Trash2 className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onStart} className="flex w-full items-center gap-3 rounded-3xl bg-foreground/[0.05] p-4 text-left outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background"><PenLine className="size-5" aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">Disegna l'area</span>
        <span className="block text-sm text-muted-foreground">Metti i pin sugli angoli del{vineyard ? " vigneto" : "la piazza"}: la superficie si userà nei costi.</span>
      </span>
    </button>
  );
}

const dot = (color: string, round = true) => <span className={cn("inline-block size-3 shrink-0", round ? "rounded-full" : "rounded-[3px]")} style={{ background: color }} aria-hidden="true" />;

/**
 * Under the area: what the map shows inside it (a small legend that follows the levers) and the hand mode: "Sposta
 * elementi" makes each tree and the Prato / Ombra (or Frangivento) labels draggable; "Disposizione automatica" undoes the moves.
 */
function SimBar({ sim, arranging, edited, onArrange, onAuto }: { sim: SimLayout; arranging: boolean; edited: boolean; onArrange: () => void; onAuto: () => void }) {
  const legend = sim.kind === "piazza"
    ? [[dot(SIM_COLORS.tree), `Alberi ${sim.data.trees.length}`], [dot(SIM_COLORS.lawn, false), "Prato"], [dot(SIM_COLORS.shade, false), "Pergolati (ombra)"]] as const
    : [[dot(thirstColor(10), false), "Zone (colore = sete)"], [dot(SIM_COLORS.drip, false), "Irrigazione"], [dot(SIM_COLORS.cloth, false), "Teli d'ombra"], [dot(SIM_COLORS.wind, false), "Frangivento"]] as const;
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4">
      <p className="text-[15px] font-semibold">{sim.kind === "piazza" ? "La piazza nell'area" : "Il vigneto nell'area"}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground" aria-label="Legenda">
        {legend.map(([icon, text]) => <li key={text} className="inline-flex items-center gap-1.5">{icon}{text}</li>)}
      </ul>
      <p className="text-sm text-muted-foreground">{arranging
        ? sim.kind === "piazza" ? "Trascina gli alberi, o le etichette Prato e Ombra per spostare quelle zone." : "Trascina l'etichetta Frangivento verso il lato dove lo vuoi."
        : "Segue le leve della simulazione: cambia gli alberi o le percentuali e la mappa si aggiorna."}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onArrange} aria-pressed={arranging} className={cn(barBtn, arranging ? "bg-foreground text-background" : "bg-foreground/[0.08]")}>
          {arranging ? <><Check className="size-4" aria-hidden="true" />Fatto</> : <><Hand className="size-4" aria-hidden="true" />Sposta elementi</>}
        </button>
        {edited && <button type="button" onClick={onAuto} className={cn(barBtn, "bg-foreground/[0.08]")}><RotateCcw className="size-4" aria-hidden="true" />Disposizione automatica</button>}
      </div>
    </div>
  );
}
