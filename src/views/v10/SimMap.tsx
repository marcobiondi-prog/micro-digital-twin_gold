import { VineZonePicker } from "@/views/v10/VineThirst";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { setPinFix, usePinFix } from "@/models/pin-fix";
import { ringCentroid } from "@/models/place-area";
import { loadPlaceArea } from "@/lib/place-area-client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlaceArea } from "@/controllers/osm-geo.functions";
import { toast } from "sonner";
import { Check, Hand, Lock, Map as MapIcon, MapPin, Moon, Navigation, PenLine, RotateCcw, Sun, Sunrise, Sunset, Trash2, Undo2, X } from "lucide-react";
import { useSignedIn } from "@/lib/use-signed-in";
import { openAccount } from "@/lib/camera-dock";
import { DEMO_LOGIN_AVAILABLE, setDemoSignedIn } from "@/lib/demo-login";
import { cn } from "@/lib/utils";
import { setUrban, setVineyard, useLab, vineMetrics } from "@/models/lab-store";
import { piazzaLayout, piazzaShadows, TREE_SHADE_M2, vineLayout, type LayoutEdits, type PiazzaLayout } from "@/models/area-layout";
import { dayLight, solarHour, sunAt, sunHeightDeg } from "@/models/sun-shadow";
import { getSimWhen, useSimWhen } from "@/models/sim-when";
import { applyZoneMix, vineMixOf, zoneMixOf } from "@/models/vine-interventions";
import { usePiazzaReading } from "@/models/sim-reading";
import { Thermometer } from "lucide-react";
import { SIM_COLORS, thirstColor, ZONE_COLORS, type SimLayout } from "@/views/v10/map-area";
import type { MovedPart } from "@/views/v10/SatelliteMap2D";
import { drawnAreaFor, freeM2, leversForZones, vineLeversForZones, vineLeversOfZones, VINE_ZONE_KINDS, leversOfZones, lotsOf, MAX_PINS, moveZones, pinsM2, surfaceText, usableM2, ZONE_KINDS, ZONE_LABEL, zoneName, zonesOfArea, type DrawnArea, type SubArea, type ZoneKind } from "@/models/drawn-area";
import type { Ring } from "@/models/place-area";
import { openSimTab, type SimKind } from "@/views/v8/console";
import { PlaceSearch } from "@/views/SimulationGrid";
import { loadRealObjects } from "@/lib/real-objects-client";
import { realCountText, type RealObject } from "@/models/real-objects";
/** No objects found (a stable empty list, so the layout is not worked out again on every render). */
const NO_REAL: RealObject[] = [];

const OpenMap3D = lazy(() => import("@/views/v10/OpenMap3D").then((m) => ({ default: m.OpenMap3D })));
const SatelliteMap2D = lazy(() => import("@/views/v10/SatelliteMap2D").then((m) => ({ default: m.SatelliteMap2D })));
const LocationMap3D = lazy(() => import("@/views/LocationMap3D").then((m) => ({ default: m.LocationMap3D })));

/**
 * The "Mappa" tab of a simulator (beside Simula): the place of this simulation on a big interactive map,
 * with the search to change it and the 2D / 3D switch.
 */
const SEEDED_KEY = "mdt-zone-seeded-v1";
function seededZones(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEDED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function keepSeeded(seen: Set<string>) {
  try { localStorage.setItem(SEEDED_KEY, JSON.stringify([...seen].slice(-200))); } catch { /* kept for this session only */ }
}

/**
 * `preview`: a small still map above the simulation's arc (2D, a third of the screen): the area with what the levers
 * lay in it, updated live, the reading pill and day/night; no search, no drawing, no gestures — a tap opens Mappa.
 */
export function SimMap({ kind, preview = false }: { kind: SimKind; preview?: boolean }) {
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
  // The pin stands at the middle of the place's mapped shape (the square, the park, the vineyard plot that contains the
  // point), not on the address's point, which can fall a few metres aside; without a shape, on the point. Same query
  // (and cache) as the surface used by the simulation.
  const fetchArea = useServerFn(getPlaceArea);
  const placeShape = useQuery({
    queryKey: kind === "urban" ? ["place-area", loc.lat, loc.lng] : ["vine-area", loc.lat, loc.lng],
    queryFn: () => loadPlaceArea((d) => fetchArea({ data: d }), loc.lat, loc.lng, kind === "urban" ? "piazza" : "vigneto"),
    staleTime: Infinity, retry: 1,
  });
  const centre = placeShape.data?.centre;
  // A pin put in place by hand wins; then the middle of the area drawn on the map; then the mapped shape's centre.
  const pinFix = usePinFix(loc.lat, loc.lng);
  const drawnCentre = saved && saved.ring.length >= 3 ? ringCentroid(saved.ring) : null;
  const at = pinFix ?? drawnCentre ?? centre ?? null;
  const pin = at ? { lat: at[0], lng: at[1] } : { lat: loc.lat, lng: loc.lng };
  const movePin = (lat: number, lng: number) => { setPinFix(loc.lat, loc.lng, [lat, lng]); toast.success("Pin spostato", { description: "Resta qui per questo luogo, anche in 3D." }); };
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<Ring>([]);
  useEffect(() => { setDrawing(false); }, [loc.lat, loc.lng]);
  // Drawing a smaller zone inside the saved area: its kind and pins (the big outline stays shown, taps outside are refused).
  const [zoneKind, setZoneKind] = useState<ZoneKind | null>(null);
  const [zoneDraft, setZoneDraft] = useState<Ring>([]);
  // The zone being edited (its id), or null while a new one is drawn.
  const [editingZone, setEditingZone] = useState<string | null>(null);
  useEffect(() => { setZoneKind(null); }, [loc.lat, loc.lng]);
  const drawingZone = zoneKind !== null && !!saved;
  const ring = drawing ? draft : drawingZone ? zoneDraft : saved?.ring ?? [];
  const save = (r: Ring | null) => {
    // A new outline lays the simulation out afresh (hand edits belonged to the old one); the zones inside it stay.
    const area = r && r.length >= 3 ? { lat: loc.lat, lng: loc.lng, ring: r, ...(saved?.zones?.length ? { zones: saved.zones } : {}) } : null;
    if (kind === "urban") setUrban({ area }); else setVineyard({ area });
  };
  const startDrawing = () => { setView("2d"); setDraft(saved?.ring ?? []); setDrawing(true); };
  const finish = () => {
    if (draft.length < 3) { toast("Servono almeno 3 pin per chiudere l’area"); return; }
    save(draft); setDrawing(false);
    toast.success("Area salvata", { description: `${surfaceText(pinsM2(draft))}: la usano i benefici.` });
  };
  const remove = () => { save(null); setDrawing(false); setDraft([]); toast("Area cancellata", { description: "Torna la superficie misurata o di riferimento." }); };
  // The simulation inside the saved area: automatic from the levers, plus what was moved by hand (kept with the area).
  const [arranging, setArranging] = useState(false);
  useEffect(() => { if (!saved) setArranging(false); }, [saved]);
  const reading = usePiazzaReading(), rSeason = reading?.season, rHour = reading?.hour;
  // What already stands in the drawn area (existing trees, fountains, buildings, monuments): the piazza's interventions keep off it.
  const realKey = saved && kind === "urban" ? saved.ring.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join(";") : "";
  const realQ = useQuery({ queryKey: ["real-objects", realKey], queryFn: () => loadRealObjects(saved!.ring), enabled: !!realKey, staleTime: Infinity, retry: 1 });
  const real = (realKey && realQ.data) || NO_REAL;
  const sim = useMemo<SimLayout | null>(() => {
    if (!saved) return null;
    const edits = saved.edits ?? {}, inner = zonesOfArea(saved);
    if (kind === "urban") {
      const data = piazzaLayout(saved.ring, lab.urban.trees, lab.urban.permeable, lab.urban.shade, edits, inner, lab.urban.misters ?? 0, real.map((o) => o.ring));
      if (!data) return null;
      // The shadows with the sun of the simulation's season and hour (its "when" chip), on the area's place.
      const when = getSimWhen("urban"), season = rSeason ?? when?.season, hour = rHour ?? when?.hour;
      const sun = season !== undefined && hour !== undefined ? sunAt(saved.lat, saved.lng, season, hour, when?.minute ?? 0, when?.dst) : null;
      return { kind: "piazza", data, inner, shadows: piazzaShadows(data, sun), real };
    }
    const v = lab.vineyard, fallback = vineMixOf(v);
    const data = vineLayout(saved.ring, v.zones.map((z) => zoneMixOf(z, fallback)), edits, inner);
    return data ? { kind: "vigneto", data, thirst: vineMetrics(v).results.map((r) => r.s), inner } : null;
  }, [saved, kind, lab.urban, lab.vineyard, rSeason, rHour, real]);
  const setZones = (zones: SubArea[]) => {
    if (!saved) return;
    const area = { ...saved, zones };
    if (kind === "urban") setUrban({ area }); else setVineyard({ area });
  };
  const startZone = (k: ZoneKind) => { setArranging(false); setView("2d"); setEditingZone(null); setZoneDraft([]); setZoneKind(k); };
  // Editing a zone: its pins come back draggable (a tap adds one more) and its kind can change.
  const editZone = (z: SubArea) => { setArranging(false); setView("2d"); setEditingZone(z.id); setZoneDraft(z.ring); setZoneKind(z.kind); };
  const closeZone = () => { setZoneKind(null); setEditingZone(null); };
  const finishZone = () => {
    if (!saved || !zoneKind) return;
    if (zoneDraft.length < 3) { toast("Servono almeno 3 pin per chiudere la zona"); return; }
    const all = zonesOfArea(saved), old = all.find((z) => z.id === editingZone);
    if (old) {
      // A lot keeps its name; a zone turned into a lot gets the next free one.
      const name = zoneKind === "lotto" ? (old.kind === "lotto" ? old.name : zoneName({ ...saved, zones: all.filter((z) => z.id !== old.id) }, "lotto")) : ZONE_LABEL[zoneKind];
      setZones(all.map((z) => (z.id === old.id ? { ...z, kind: zoneKind, ring: zoneDraft, ...(name ? { name } : {}) } : z)));
      toast.success(`Zona «${name ?? ZONE_LABEL[zoneKind]}» aggiornata`, { description: surfaceText(pinsM2(zoneDraft)) });
    } else {
      const z: SubArea = { id: crypto.randomUUID?.() ?? String(Date.now()), kind: zoneKind, ring: zoneDraft, name: zoneName(saved, zoneKind) };
      setZones([...all, z]);
      toast.success(`${z.name} aggiunta`, { description: `${surfaceText(pinsM2(zoneDraft))}${zoneKind === "libera" ? ": tolti dalla superficie." : "."}` });
    }
    closeZone();
  };
  // A zone given an intervention (Alberi, Prato, Pergolato) holds it: when one appears (drawn now, or found on opening)
  // and its lever is too low to fill it, the lever is raised so its trees, lawn or pergola show on the 2D and 3D maps
  // (and count in the temperature and the costs). Each zone (id and kind) is seeded once per device, so a lever turned
  // down by hand later stays down.
  const zoneSig = saved ? zonesOfArea(saved).map((z) => `${z.id}:${z.kind}:${z.ring.length}`).join("|") : "";
  useEffect(() => {
    if (preview || !saved) return;
    // The vineyard: an Irrigazione, Teli d'ombra or Frangivento zone raises that lever on every vineyard zone (once per zone).
    if (kind === "vineyard") {
      // "Solo quello disegnato": the levers follow the zones exactly.
      if (saved.edits?.onlyDrawn) {
        const next = vineLeversOfZones(saved), v = lab.vineyard;
        if (v.zones.some((z) => z.irrigation !== next.irrigation || z.shade !== next.shade || z.windbreak !== next.windbreak)) setVineyard({ zones: v.zones.map((z) => ({ ...z, ...next })) });
        return;
      }
      const seen = seededZones(), fresh = new Set<string>();
      for (const z of zonesOfArea(saved)) if ((VINE_ZONE_KINDS as readonly string[]).includes(z.kind) && !seen.has(`${z.id}:${z.kind}`)) fresh.add(z.id);
      if (!fresh.size) return;
      for (const z of zonesOfArea(saved)) if (fresh.has(z.id)) seen.add(`${z.id}:${z.kind}`);
      keepSeeded(seen);
      const v = lab.vineyard, legacy = vineMixOf(v);
      let changed = false;
      const zones = v.zones.map((z) => {
        const now = zoneMixOf(z, legacy), next = vineLeversForZones(saved, now, fresh);
        if (!next) return z;
        changed = true;
        return { ...z, ...next };
      });
      if (!changed) return;
      setVineyard({ zones });
      const names = [...new Set(zonesOfArea(saved).filter((z) => fresh.has(z.id)).map((z) => ZONE_LABEL[z.kind]))].join(" · ");
      toast.success("Interventi messi nelle zone", { description: `${names}: li vedi sulla mappa 2D e 3D e contano nella simulazione.` });
      return;
    }
    if (kind !== "urban") return;
    // "Solo quello disegnato": the levers follow the zones exactly, whenever a zone is drawn, changed or removed.
    if (saved.edits?.onlyDrawn) {
      const u = lab.urban, next = leversOfZones(saved);
      if (next.trees !== u.trees || next.permeable !== u.permeable || next.shade !== u.shade || next.misters !== (u.misters ?? 0)) setUrban({ ...next, treeCells: null, permeableCells: null, shadeCells: null });
      return;
    }
    const seen = seededZones(), fresh = new Set<string>();
    for (const z of zonesOfArea(saved)) if (["alberi", "prato", "ombra", "nebulizzatori"].includes(z.kind) && !seen.has(`${z.id}:${z.kind}`)) fresh.add(z.id);
    if (!fresh.size) return;
    const u = lab.urban, next = leversForZones(saved, { trees: u.trees, permeable: u.permeable, shade: u.shade, misters: u.misters ?? 0 }, fresh);
    for (const z of zonesOfArea(saved)) if (fresh.has(z.id)) seen.add(`${z.id}:${z.kind}`);
    keepSeeded(seen);
    if (!next) return;
    setUrban(next);
    const said = [next.trees !== u.trees && `Alberi ${next.trees}`, next.permeable !== u.permeable && `Aiuole ${next.permeable} %`, next.shade !== u.shade && `Ombra ${next.shade} %`, next.misters !== (u.misters ?? 0) && `Nebulizzatori ${next.misters}`].filter(Boolean).join(" · ");
    toast.success("Interventi messi nelle zone", { description: `${said}: li vedi sulla mappa 2D e 3D.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, zoneSig, !!saved?.edits?.onlyDrawn]);
  const setEdits = (edits: LayoutEdits) => {
    if (!saved) return;
    const area = { ...saved, edits };
    if (kind === "urban") setUrban({ area }); else setVineyard({ area });
  };
  const moved = (m: MovedPart) => {
    const e = saved?.edits ?? {};
    if (m.part === "zones") {
      if (!saved) return;
      const next = moveZones(saved, m.ids, m.at[0] - m.from[0], m.at[1] - m.from[1]);
      // Refused past the outline: the area is set again as it was, so the handle goes back to its place.
      if (!next) toast.error("Le zone devono restare dentro l’area disegnata", { description: "Spostale un po' meno: sono tornate dov’erano." });
      else toast.success(m.ids.length > 1 ? `Spostate ${m.ids.length} zone con quello che contengono` : "Zona spostata con quello che contiene");
      if (kind === "urban") setUrban({ area: next ?? { ...saved } }); else setVineyard({ area: next ?? { ...saved } });
      return;
    }
    if (m.part === "tree") { const trees = [...(e.trees ?? [])]; trees[m.index] = m.at; setEdits({ ...e, trees }); }
    else setEdits({ ...e, [m.part === "lawn" ? "lawnAt" : m.part === "shade" ? "shadeAt" : "windAt"]: m.at });
  };
  // No place chosen yet: no map of a default place, only how to choose one (the GPS starts by itself on the Mappa tab).
  if (loc.pending) return preview ? (
    <button type="button" onClick={() => openSimTab(kind, "mappa")} className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-3xl bg-foreground/[0.06] px-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Navigation className="size-6 text-brand-turquoise" aria-hidden="true" />
      <span className="text-[15px] font-semibold">Nessun luogo ancora</span>
      <span className="text-sm text-muted-foreground">Apri la mappa: il GPS trova dove sei, oppure cerca un luogo.</span>
    </button>
  ) : (
    <div className="space-y-4">
      <PlaceSearch kind={kind} />
      <div role="status" className="flex h-[40vh] min-h-64 flex-col items-center justify-center gap-3 rounded-3xl bg-foreground/[0.06] px-6 text-center">
        <Navigation className="size-8 text-brand-turquoise" aria-hidden="true" />
        <p className="text-lg font-semibold">Nessun luogo ancora</p>
        <p className="max-w-xs text-sm text-muted-foreground">Tocca il GPS per usare la tua posizione, oppure cerca {kind === "urban" ? "la piazza" : "il vigneto"} qui sopra. La mappa si apre lì.</p>
      </div>
    </div>
  );
  if (preview) return (
    // The whole preview opens the Mappa tab; in the vineyard the zone pills over it choose the simulation's scope.
    <div data-sim-map-box="" onClick={() => openSimTab(kind, "mappa")}
      className="relative -mx-4 block h-[34vh] min-h-56 w-[calc(100%+2rem)] cursor-pointer overflow-hidden text-left sm:mx-0 sm:w-full sm:rounded-3xl">
      <MapReading kind={kind} lat={pin.lat} lng={pin.lng} />
      {/* The map (and its night veil) fades out at its foot by a mask, so the page itself — its ambient light, in light
          or dark — shows through: a gradient to a fixed colour left a band of another blue under the map. */}
      <div className="pointer-events-none absolute inset-0 [-webkit-mask-image:linear-gradient(to_bottom,#000_72%,transparent)] [mask-image:linear-gradient(to_bottom,#000_72%,transparent)]" aria-hidden="true">
        <DayNight kind={kind} lat={pin.lat} lng={pin.lng} />
        {/* Still: the map under the button takes no gesture; the page scrolls over it. */}
        <ParallaxLayer>
          <Suspense fallback={<div className="h-full w-full" />}><SatelliteMap2D key={`${loc.lat},${loc.lng}`} apiKey={key} lat={pin.lat} lng={pin.lng} label={name ?? ""} zoom={zoom} area={ring} sim={sim} still /></Suspense>
        </ParallaxLayer>
      </div>
      {kind === "vineyard" && <div className="absolute inset-x-0 top-12 z-[3] flex justify-center px-3"><VineZonePicker /></div>}
      <button type="button" onClick={(e) => { e.stopPropagation(); openSimTab(kind, "mappa"); }} aria-label="Apri la mappa: disegna l’area e sposta gli elementi"
        className="absolute bottom-3 right-3 z-[3] inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[13px] font-semibold text-white outline-none ring-1 ring-white/15 backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-white">
        <MapIcon className="size-4" aria-hidden="true" />Apri la mappa
      </button>
    </div>
  );

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
        <p role="status" className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">La vista 3D è per chi ha fatto l’accesso.
          <button type="button" onClick={openAccount} className="font-semibold text-foreground underline underline-offset-4">Accedi</button>
          {/* Previews only: unlock the 3D view on this device without an account. */}
          {DEMO_LOGIN_AVAILABLE && <button type="button" onClick={() => { setDemoSignedIn(true); setView("3d"); }} className="font-semibold text-foreground underline underline-offset-4">Simula l’accesso</button>}
        </p>
      )}
      {/* The place is chosen here: search it or use the device position; the map follows. */}
      <PlaceSearch kind={kind} />
      <div data-sim-map-box="" className="relative -mx-4 h-[52vh] min-h-72 overflow-hidden bg-card sm:mx-0 sm:rounded-3xl">
        {/* The temperature the interventions bring, on the map itself (2D and 3D), following the levers live. */}
        <MapReading kind={kind} lat={pin.lat} lng={pin.lng} />
        {/* How many misting poles the map shows, exactly: those in the zones drawn for them and those the app placed. */}
        {sim?.kind === "piazza" && sim.data.misters.length > 0 && !drawing && (
          <p role="status" className="pointer-events-none absolute left-1/2 top-12 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-[12px] font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm [text-shadow:0_1px_2px_rgb(0_0_0/.6)]">
            <span className="mr-1 inline-block size-2.5 rounded-full bg-sky-400 align-middle ring-2 ring-sky-100" aria-hidden="true" />
            Nebulizzatori {sim.data.misters.length}
            {sim.data.mistersInZones > 0 && <span className="font-normal text-white/80"> · {sim.data.mistersInZones} nelle tue zone{sim.data.misters.length > sim.data.mistersInZones ? ` · ${sim.data.misters.length - sim.data.mistersInZones} messi dall’app` : ""}</span>}
          </p>
        )}
        {/* Day and night at the simulation's season and hour, over the 2D and the 3D map alike. */}
        <DayNight kind={kind} lat={pin.lat} lng={pin.lng} />
        {show3d
          ? <Suspense fallback={<div className="h-full w-full bg-card" />}><MapLight kind={kind} lat={pin.lat} lng={pin.lng}>{key
            ? <LocationMap3D key={`${loc.lat},${loc.lng}`} lat={pin.lat} lng={pin.lng} label={name ?? ""} apiKey={key} area={ring} sim={sim}
              fallback={<OpenMap3D lat={pin.lat} lng={pin.lng} label={name ?? ""} zoom={zoom3d} area={ring} sim={sim} />} />
            : <OpenMap3D key={`${loc.lat},${loc.lng}`} lat={pin.lat} lng={pin.lng} label={name ?? ""} zoom={zoom3d} area={ring} sim={sim} />}</MapLight></Suspense>
          : <Suspense fallback={<div className="h-full w-full bg-card" />}><SatelliteMap2D key={`${loc.lat},${loc.lng}`} apiKey={key} lat={pin.lat} lng={pin.lng} label={name ?? ""} zoom={zoom} area={ring} drawing={drawing || drawingZone}
            onAreaChange={drawingZone ? setZoneDraft : setDraft} sim={editingZone && sim ? { ...sim, inner: (sim.inner ?? []).filter((z) => z.id !== editingZone) } : sim} arranging={arranging} onMove={moved}
            outline={drawingZone ? saved?.ring ?? null : null} onOutside={() => toast("La zona va dentro l’area disegnata")} onPinMove={arranging ? undefined : movePin} /></Suspense>}
      </div>
      {/* The pin can be put right by hand on the 2D map; a pin moved by hand can go back to the automatic one. */}
      {!drawing && !drawingZone && !arranging && (
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 text-center text-xs text-muted-foreground">
          {pinFix ? "Pin messo da te." : "Il pin non è al centro del luogo?"} {show3d ? "Spostalo sulla mappa 2D." : "Tienilo premuto e trascinalo."}
          {pinFix && <button type="button" onClick={() => { setPinFix(loc.lat, loc.lng, null); toast("Pin automatico di nuovo"); }} className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4">Rimetti automatico</button>}
        </p>
      )}
      {drawingZone ? (
        <ZoneDrawBar kind={zoneKind!} pins={zoneDraft.length} m2={zoneDraft.length >= 3 ? pinsM2(zoneDraft) : null} editing={editingZone !== null}
          kinds={ZONE_KINDS[kind === "urban" ? "piazza" : "vigneto"]} onKind={setZoneKind}
          onUndo={() => setZoneDraft((d) => d.slice(0, -1))} onCancel={closeZone} onFinish={finishZone} />
      ) : <>
      <AreaBar drawing={drawing} pins={ring.length} m2={ring.length >= 3 ? pinsM2(ring) : null} saved={!!saved} vineyard={kind === "vineyard"}
        onStart={() => { setArranging(false); startDrawing(); }} onUndo={() => setDraft((d) => d.slice(0, -1))} onCancel={() => setDrawing(false)} onFinish={finish} onRemove={remove} />
      {sim && !drawing && <SimBar sim={sim} when={reading?.when} arranging={arranging} edited={!!saved?.edits && Object.keys(saved.edits).length > 0} best={!!saved?.edits?.best}
        only={!!saved?.edits?.onlyDrawn} canOnly={!!saved && zonesOfArea(saved).some((z) => (kind === "urban" ? ["alberi", "prato", "ombra", "nebulizzatori"] : [...VINE_ZONE_KINDS] as string[]).includes(z.kind))}
        onOnly={() => {
          if (!saved) return;
          if (saved.edits?.onlyDrawn) { setEdits({}); toast("Torna la disposizione automatica", { description: kind === "urban" ? "Le leve tornano a mettere aiuole, pergolati e alberi anche fuori dalle zone." : "Le leve tornano a mettere irrigazione, teli e frangivento anche fuori dalle zone." }); return; }
          if (kind === "vineyard") {
            const next = vineLeversOfZones(saved);
            setVineyard((v) => ({ zones: v.zones.map((z) => ({ ...z, ...next })), area: { ...saved, edits: { onlyDrawn: true } } }));
            setArranging(false);
            toast.success("Solo quello disegnato da te", { description: `Irrigazione +${next.irrigation} % · Teli ${next.shade} % · Frangivento ${next.windbreak} %: il bisogno di intervento conta solo le tue zone.` });
            return;
          }
          const next = leversOfZones(saved);
          setUrban({ ...next, treeCells: null, permeableCells: null, shadeCells: null, area: { ...saved, edits: { onlyDrawn: true } } });
          setArranging(false);
          toast.success("Solo quello disegnato da te", { description: `Alberi ${next.trees} · Aiuole ${next.permeable} % · Ombra ${next.shade} % · Nebulizzatori ${next.misters}: la temperatura conta solo le tue zone.` });
        }}
        onArrange={() => { setView("2d"); setArranging((a) => !a); }} onAuto={() => { setEdits({}); toast("Disposizione automatica ripristinata"); }}
        onBest={() => {
          setEdits({ best: true });
          setArranging(false);
          toast.success("Elementi nella posizione migliore", { description: kind === "urban" ? "Pergolati, aiuole e alberi dove d’estate batte più sole (ore 10–18), contando palazzi di circa 12 m attorno all’area." : "I teli d’ombra sulle parti di ogni zona dove d’estate batte più sole (ore 10–18)." });
        }} />}
      {saved && !drawing && <ZonesBar area={saved} flow={kind === "urban" ? "piazza" : "vigneto"} onAdd={startZone} onEdit={editZone} onRemove={(id) => setZones(zonesOfArea(saved).filter((z) => z.id !== id))} />}
      </>}
    </div>
  );
}

/**
 * The preview's map with a parallax while the page scrolls: the layer is 50 % taller than its box and slides at 55 %
 * of the scroll's speed, the other way (at most its spare 25 % each side), so the map seems to lie deeper than the page.
 * Moved by transform once per frame, nothing re-rendered; still with reduced motion.
 */
/** Where the preview's fade begins (share of its height, the mask's 72 %). */
const FADE_AT = 0.72;
function ParallaxLayer({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current, box = el?.parentElement;
    if (!el || !box || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const r = box.getBoundingClientRect(), vh = window.innerHeight || 1, spare = r.height * 0.25;
      // The map slides while the preview goes up under the sticky tabs, and stops where its faded foot begins (FADE_AT
      // of its height) reaches them: from there only the fade is left in view and the map scrolls with the page.
      // Where the tabs end without their own shift (shown or sliding away): reading their shifted position made the map
      // jump each time they hid or came back.
      const tabs = document.querySelector<HTMLElement>("[data-sim-tabs]"), under = tabs ? tabs.getBoundingClientRect().bottom - new DOMMatrix(getComputedStyle(tabs).transform).m42 : 0;
      const top = Math.max(r.top, under - r.height * FADE_AT);
      const ty = Math.max(-spare, Math.min(spare, (vh / 2 - (top + r.height / 2)) * 0.55));
      el.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0)`;
    };
    const ask = () => { if (!frame) frame = requestAnimationFrame(place); };
    place();
    window.addEventListener("scroll", ask, { passive: true, capture: true });
    window.addEventListener("resize", ask);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", ask, { capture: true }); window.removeEventListener("resize", ask); };
  }, []);
  return <div ref={ref} className="pointer-events-none absolute inset-x-0 -top-[25%] h-[150%] will-change-transform" aria-hidden="true">{children}</div>;
}

/** Colour of a temperature on the five-step heat scale: red when too hot, down to turquoise and blue when cool. */
export const heatTone = (t: number) =>
  t >= 39 ? "#ef4444" : t >= 36 ? "#f97316" : t >= 30 ? "#f59e0b" : t >= 18 ? "#2dd4bf" : "#60a5fa";
const deg = (t: number) => `${t.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;

/**
 * A reading laid over the map, top centre (clear of the recenter button and of the 3D view's own controls): the piazza's
 * perceived heat as its simulation shows it now — without → with the interventions, the gain, season and hour —, or
 * the vineyard's temperature on the leaves, the shade cloth taking up to 3 °C off each zone.
 */
/** The light of the simulation's hour on the map (models/sun-shadow dayLight): its phase, or null before the clock starts. */
function useDayLight(kind: SimKind, lat: number, lng: number) {
  const when = useSimWhen(kind);
  if (!when) return null;
  const height = sunHeightDeg(lat, lng, when.season, when.hour, when.minute ?? 0, when.dst);
  return { ...dayLight(height, solarHour(when.hour + (when.minute ?? 0) / 60, lng, when.dst) < 12), height };
}

/**
 * The photographic 3D draws itself above any veil laid over it, so its light is changed on the map itself with a CSS
 * filter following the sun's height: none by day, warmer at dawn and dusk, darker and bluer at twilight and night.
 */
export function lightFilter(height: number | null | undefined): string {
  if (height == null || height >= 10) return "none";
  if (height >= 0) { const k = 1 - height / 10; return `sepia(${(0.35 * k).toFixed(2)}) saturate(${(1 + 0.2 * k).toFixed(2)}) brightness(${(1 - 0.12 * k).toFixed(2)})`; }
  if (height >= -6) { const k = -height / 6; return `brightness(${(0.88 - 0.38 * k).toFixed(2)}) saturate(${(1 - 0.3 * k).toFixed(2)}) hue-rotate(${Math.round(12 * k)}deg)`; }
  return "brightness(0.45) saturate(0.65) hue-rotate(15deg)";
}

/** Hands the 3D maps the light of the simulation's hour (--map-light-filter, applied to the photographic map's canvas). */
function MapLight({ kind, lat, lng, children }: { kind: SimKind; lat: number; lng: number; children: React.ReactNode }) {
  const light = useDayLight(kind, lat, lng);
  return <div className="h-full w-full" style={{ ["--map-light-filter" as string]: lightFilter(light?.height) }}>{children}</div>;
}

/** A see-through veil over the map: none by day, golden at dawn and dusk, blue twilight, dark blue at night. */
function DayNight({ kind, lat, lng }: { kind: SimKind; lat: number; lng: number }) {
  const light = useDayLight(kind, lat, lng);
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] transition-[background-color] duration-700 motion-reduce:transition-none" style={{ backgroundColor: light?.veil ?? "transparent" }} />;
}
const PHASE_ICON = { giorno: Sun, alba: Sunrise, tramonto: Sunset, notte: Moon } as const;
const PHASE_WORD = { giorno: "giorno", alba: "alba", tramonto: "tramonto", notte: "notte" } as const;

function MapReading({ kind, lat, lng }: { kind: SimKind; lat: number; lng: number }) {
  const light = useDayLight(kind, lat, lng);
  const PhaseIcon = light ? PHASE_ICON[light.phase] : null;
  const piazza = usePiazzaReading();
  const lab = useLab();
  const vine = lab.vineyard;
  let before: number, after: number, what: string;
  if (kind === "urban") {
    if (!piazza) return null;
    ({ before, after } = piazza);
    what = `Temperatura percepita · ${piazza.when}`;
  } else {
    const zones = vine.zones;
    if (!zones.length) return null;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    before = +avg(zones.map((z) => z.temperature)).toFixed(1);
    after = +avg(zones.map((z) => applyZoneMix(z, zoneMixOf(z, vineMixOf(vine))).temperature)).toFixed(1);
    what = "Temperatura sulle foglie · media delle zone";
  }
  const gain = +(before - after).toFixed(1);
  // Something is in place but takes nothing off now (no heat at this hour or season): said, so the pill is not mute.
  const placed = kind === "urban" ? lab.urban.trees + lab.urban.permeable + lab.urban.shade + (lab.urban.misters ?? 0) > 0 : true;
  return (
    <div key={after} role="status" aria-live="polite" className="map-reading pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/20 px-2.5 py-1 text-white ring-1 ring-white/20 backdrop-blur-[2px] [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]">
      <p className="flex items-center justify-center gap-1 whitespace-nowrap text-[13px] font-medium tabular-nums leading-tight">
        {PhaseIcon && <PhaseIcon className="size-3.5 shrink-0 text-amber-200" aria-label={PHASE_WORD[light!.phase]} />}
        <Thermometer className="size-3.5 shrink-0" style={{ color: heatTone(after) }} aria-hidden="true" />
        {gain > 0.05 ? <>
          <span className="text-white/60 line-through decoration-white/40">{deg(before)}</span>
          <span aria-hidden="true" className="text-white/50">→</span>
          <span style={{ color: heatTone(after) }}>{deg(after)}</span>
          <span className="ml-0.5 text-[11px] font-semibold text-emerald-300">−{gain.toLocaleString("it-IT")}°</span>
        </> : <><span style={{ color: heatTone(after) }}>{deg(after)}</span>{placed && kind === "urban" && <span className="ml-1 text-[11px] font-normal text-white/75">· A quest’ora non serve rinfrescare</span>}</>}
      </p>
      <span className="sr-only">{gain > 0.05 ? what : `${what} · senza interventi`}</span>
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
      <div role="group" aria-label="Disegna l’area" className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4">
        <p className="text-[15px] font-semibold">Tocca la mappa sugli angoli dell’area</p>
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
          <span className="block text-sm text-muted-foreground">La usano i benefici al posto della superficie misurata.</span>
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onStart} className={cn(barBtn, "bg-foreground/[0.08]")}><PenLine className="size-4" aria-hidden="true" />Modifica</button>
          <button type="button" onClick={onRemove} aria-label="Cancella l’area disegnata" className={cn(barBtn, "bg-foreground/[0.08] px-3")}><Trash2 className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onStart} className="flex w-full items-center gap-3 rounded-3xl bg-foreground/[0.05] p-4 text-left outline-none hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground text-background"><PenLine className="size-5" aria-hidden="true" /></span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">Disegna l’area</span>
        <span className="block text-sm text-muted-foreground">Metti i pin sugli angoli: useremo la superficie per i benefici.</span>
      </span>
    </button>
  );
}

const dot = (color: string, round = true) => <span className={cn("inline-block size-3 shrink-0", round ? "rounded-full" : "rounded-[3px]")} style={{ background: color }} aria-hidden="true" />;

/** What the shadows on the map are: the sun of the simulation's season and hour; none with the sun down. */
function shadowText(sim: Extract<SimLayout, { kind: "piazza" }>, when?: string) {
  const at = when ? ` (${when.toLowerCase()})` : "";
  if (!sim.data.trees.length && !sim.data.shadeM2) return "";
  return sim.shadows?.length ? `Le ombre seguono il sole della simulazione${at}: si allungano col sole basso e girano con le ore. ` : `A quest’ora${at} il sole è sotto l’orizzonte: niente ombre. `;
}
/** Says when the area has no room for all the m² the simulation counts. */
function roomText(l: PiazzaLayout) {
  const short = (got: number, want: number) => want > 0 && got < want * 0.95 - 10;
  const parts = [short(l.lawnM2, l.lawnTarget) && `aiuole ${l.lawnTarget.toLocaleString("it-IT")} m²`, short(l.shadeM2, l.shadeTarget) && `pergolati ${l.shadeTarget.toLocaleString("it-IT")} m²`].filter(Boolean);
  return parts.length ? `La simulazione conta ${parts.join(" e ")}: nell’area disegnata c’è posto per meno.` : "Aiuole e pergolati hanno sulla mappa gli stessi m² contati dalla simulazione.";
}

/**
 * Under the area: what the map shows inside it (a small legend that follows the levers) and the hand mode: "Sposta
 * elementi" makes each tree and the Prato / Ombra (or Frangivento) labels draggable; "Disposizione automatica" undoes the moves.
 */
function SimBar({ sim, when, arranging, edited, best, only, canOnly, onArrange, onAuto, onBest, onOnly }: { sim: SimLayout; when?: string | undefined; arranging: boolean; edited: boolean; best: boolean; only: boolean; canOnly: boolean; onArrange: () => void; onAuto: () => void; onBest: () => void; onOnly: () => void }) {
  const m2 = (v: number) => `${Math.round(v).toLocaleString("it-IT")} m²`;
  const legend = sim.kind === "piazza"
    ? [[dot(SIM_COLORS.tree), `Alberi ${sim.data.trees.length} · ${m2(sim.data.trees.length * TREE_SHADE_M2)} di chioma`], [dot(SIM_COLORS.lawn, false), `Aiuole e ciottoli ${m2(sim.data.lawnM2)}`], [dot(SIM_COLORS.shade, false), `Pergolati ${m2(sim.data.shadeM2)}`], [dot("#0b0f15", false), "Ombre"], ...(sim.data.misters.length ? [[dot("#7dd3fc"), `Nebulizzatori ${sim.data.misters.length}${sim.data.mistersInZones ? ` (${sim.data.mistersInZones} nelle tue zone)` : ""}`] as const] : [])] as const
    : [[dot(thirstColor(10), false), "Zone (colore = bisogno di intervento)"], [dot(SIM_COLORS.drip, false), "Irrigazione · tubo e ali gocciolanti"], [dot(SIM_COLORS.cloth, false), "Teli d’ombra"], [dot(SIM_COLORS.wind, false), "Frangivento"]] as const;
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4">
      <p className="text-[15px] font-semibold">{sim.kind === "piazza" ? "La piazza nell’area" : "Il vigneto nell’area"}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground" aria-label="Legenda">
        {legend.map(([icon, text]) => <li key={text} className="inline-flex items-center gap-1.5">{icon}{text}</li>)}
      </ul>
      {sim.kind === "piazza" && <p className="text-sm text-muted-foreground">{shadowText(sim, when)}{roomText(sim.data)}</p>}
      {sim.kind === "piazza" && (sim.real?.length ?? 0) > 0 && <p className="text-sm text-muted-foreground">Già nell’area: {realCountText(sim.real ?? [])}. Gli interventi non ci vanno sopra (contorni tratteggiati sulla mappa 2D).</p>}
      <p className="text-sm text-muted-foreground">{arranging
        ? sim.kind === "piazza" ? `Trascina gli alberi, o le etichette Aiuole e Ombra.${(sim.inner ?? []).length ? " Le etichette con ✥ spostano le tue zone con tutto quello che contengono; \"✥ Tutte le zone\" le sposta insieme." : ""}` : `Trascina l’etichetta Frangivento verso il lato dove lo vuoi.${(sim.inner ?? []).length ? " Le etichette con ✥ spostano le tue zone; \"✥ Tutte le zone\" le sposta insieme." : ""}`
        : only
          ? sim.kind === "piazza" ? "Solo quello disegnato da te: aiuole e pergolati sono le tue zone, gli alberi stanno nelle zone Alberi. Le leve della simulazione seguono le zone; se ne cambi una torna la disposizione automatica." : "Solo quello disegnato da te: irrigazione, teli e frangivento stanno nelle tue zone. Le leve della simulazione seguono le zone; se ne cambi una torna la disposizione automatica."
        : best
          ? sim.kind === "piazza" ? `Posizione migliore: pergolati, aiuole e alberi dove d’estate batte più sole (ore 10–18), contando palazzi di circa 12 m attorno.${sim.data.sunny !== undefined ? ` Al sole per gran parte del giorno: ${Math.round(sim.data.sunny * 100)} % dell’area.` : ""}` : "Posizione migliore: i teli d’ombra sulle parti di ogni zona dove d’estate batte più sole (ore 10–18)."
          : "Segue le leve della simulazione: cambia gli alberi o le percentuali e la mappa si aggiorna."}</p>
      {!canOnly && !only && !arranging && <p className="text-xs text-muted-foreground">Per vedere solo quello che disegni, aggiungi una zona {sim.kind === "piazza" ? "Alberi, Aiuole o Pergolato" : "Irrigazione, Teli d’ombra o Frangivento"}.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onArrange} aria-pressed={arranging} className={cn(barBtn, arranging ? "bg-foreground text-background" : "bg-foreground/[0.08]")}>
          {arranging ? <><Check className="size-4" aria-hidden="true" />Fatto</> : <><Hand className="size-4" aria-hidden="true" />Sposta elementi</>}
        </button>
        {!arranging && (
          <button type="button" onClick={onOnly} disabled={!canOnly && !only} aria-pressed={only} className={cn(barBtn, only ? "bg-brand-turquoise/20 text-brand-turquoise ring-1 ring-brand-turquoise/40" : "bg-foreground/[0.08]", "disabled:opacity-40")}>
            <PenLine className="size-4" aria-hidden="true" />{only ? "Solo disegnato · attivo" : "Solo quello disegnato"}
          </button>
        )}
        {!arranging && !only && (
          <button type="button" onClick={onBest} aria-pressed={best} className={cn(barBtn, best ? "bg-brand-turquoise/20 text-brand-turquoise ring-1 ring-brand-turquoise/40" : "bg-foreground/[0.08]")}>
            <Sun className="size-4" aria-hidden="true" />{best ? "Posizione migliore · attiva" : "Posizione migliore"}
          </button>
        )}
        {edited && <button type="button" onClick={onAuto} className={cn(barBtn, "bg-foreground/[0.08]")}><RotateCcw className="size-4" aria-hidden="true" />Disposizione automatica</button>}
      </div>
    </div>
  );
}

const ZONE_HINT: Record<ZoneKind, string> = {
  libera: "Resta vuota (una fontana, una strada, un parcheggio) e la sua superficie si toglie dal totale.",
  alberi: "Gli alberi della simulazione vanno qui dentro.",
  prato: "Qui ci sono aiuole e ciottoli, poi il resto della percentuale dove c’è posto.",
  ombra: "Qui c’è un pergolato, poi il resto della percentuale dove c’è posto.",
  nebulizzatori: "I nebulizzatori vanno qui dentro: circa uno ogni 40 m².",
  irrigazione: "Qui le viti hanno l’irrigazione a goccia su ogni filare, con il tubo principale lungo il bordo.",
  teli: "Qui le viti stanno sotto i teli d’ombra.",
  frangivento: "Qui va la siepe frangivento, lungo il lato più lungo della zona.",
  lotto: "Una parte del progetto, con la sua superficie e la sua quota dell’area.",
};

/**
 * Drawing a zone inside the area (or editing one: its pins drag, a tap adds one more, and its kind can change): what it
 * is, its pins and surface so far, Ultimo pin, Esci, Fine.
 */
function ZoneDrawBar({ kind, pins, m2, editing, kinds, onKind, onUndo, onCancel, onFinish }: {
  kind: ZoneKind; pins: number; m2: number | null; editing: boolean; kinds: readonly ZoneKind[]; onKind: (k: ZoneKind) => void;
  onUndo: () => void; onCancel: () => void; onFinish: () => void;
}) {
  return (
    <div role="group" aria-label={`${editing ? "Modifica" : "Disegna"} la zona: ${ZONE_LABEL[kind]}`} className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4">
      <p className="flex items-center gap-2 text-[15px] font-semibold"><span className="size-3 rounded-[3px]" style={{ background: ZONE_COLORS[kind] }} aria-hidden="true" />{editing ? "Modifica la zona" : "Zona"}: {ZONE_LABEL[kind]}</p>
      {editing && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo di zona">
          {kinds.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={k === kind} onClick={() => onKind(k)}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring", k === kind ? "bg-foreground text-background" : "bg-foreground/[0.08]")}>
              <span className="size-2.5 rounded-[3px]" style={{ background: ZONE_COLORS[k] }} aria-hidden="true" />{ZONE_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground" aria-live="polite">{editing
        ? `Trascina i pin per spostare gli angoli, tocca dentro l’area per aggiungerne uno. ${pins} pin${m2 !== null ? ` · ${surfaceText(m2)}` : ""}`
        : pins === 0 ? `Tocca dentro l’area sugli angoli della zona. ${ZONE_HINT[kind]}` : `${pins} pin${m2 !== null ? ` · ${surfaceText(m2)}` : " · ne servono almeno 3"}`}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onUndo} disabled={pins === 0} className={cn(barBtn, "bg-foreground/[0.08]")}><Undo2 className="size-4" aria-hidden="true" />Ultimo pin</button>
        <button type="button" onClick={onCancel} className={cn(barBtn, "bg-foreground/[0.08]")}><X className="size-4" aria-hidden="true" />Esci</button>
        <button type="button" onClick={onFinish} disabled={pins < 3} className={cn(barBtn, "ml-auto bg-foreground text-background")}><Check className="size-4" aria-hidden="true" />{editing ? "Salva" : "Fine"}</button>
      </div>
    </div>
  );
}

/**
 * The smaller zones inside the area: each with its colour, name and surface (lots with their share), a bin to remove
 * it and a pencil to edit it, the surface left free and the one that takes interventions; "Aggiungi zona" offers the kinds of this simulation.
 */
function ZonesBar({ area, flow, onAdd, onEdit, onRemove }: { area: DrawnArea; flow: "piazza" | "vigneto"; onAdd: (k: ZoneKind) => void; onEdit: (z: SubArea) => void; onRemove: (id: string) => void }) {
  const [choosing, setChoosing] = useState(false);
  const zones = zonesOfArea(area), lots = lotsOf(area), free = freeM2(area);
  const shareOf = (id: string) => lots.find((l) => l.id === id)?.share;
  return (
    <div className="space-y-3 rounded-3xl bg-foreground/[0.05] p-4">
      <p className="text-[15px] font-semibold">Zone dentro l’area</p>
      {zones.length > 0 ? (
        <ul className="divide-y divide-foreground/10">
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-3 py-2.5">
              <span className="size-3 shrink-0 rounded-[3px]" style={{ background: ZONE_COLORS[z.kind] }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{z.kind === "lotto" ? z.name : ZONE_LABEL[z.kind]}</span>
                <span className="block text-sm text-muted-foreground">{surfaceText(pinsM2(z.ring))}{z.kind === "lotto" && shareOf(z.id) !== undefined ? ` · ${Math.round(shareOf(z.id)! * 100)}% dell’area` : z.kind === "libera" ? " · lasciata libera" : ""}</span>
              </span>
              <button type="button" onClick={() => onEdit(z)} aria-label={`Modifica la zona ${z.name ?? ZONE_LABEL[z.kind]}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-ring"><PenLine className="size-4" aria-hidden="true" /></button>
              <button type="button" onClick={() => onRemove(z.id)} aria-label={`Cancella la zona ${z.name ?? ZONE_LABEL[z.kind]}`} className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground/[0.08] outline-none focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Disegna dentro l’area le parti da lasciare libere, quelle con un intervento preciso o i lotti del progetto.</p>}
      {free > 0 && <p className="text-sm text-muted-foreground">Superficie per gli interventi: <span className="font-semibold text-foreground">{surfaceText(usableM2(area))}</span> ({surfaceText(free)} lasciati liberi)</p>}
      {choosing ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Che zona vuoi disegnare?">
          {ZONE_KINDS[flow].map((k) => (
            <button key={k} type="button" onClick={() => { setChoosing(false); onAdd(k); }} className={cn(barBtn, "bg-foreground/[0.08]")}>
              <span className="size-3 rounded-[3px]" style={{ background: ZONE_COLORS[k] }} aria-hidden="true" />{ZONE_LABEL[k]}
            </button>
          ))}
          <button type="button" onClick={() => setChoosing(false)} className={cn(barBtn, "text-muted-foreground")}><X className="size-4" aria-hidden="true" />Annulla</button>
        </div>
      ) : (
        <button type="button" onClick={() => setChoosing(true)} className={cn(barBtn, "bg-foreground/[0.08]")}><PenLine className="size-4" aria-hidden="true" />Aggiungi zona</button>
      )}
    </div>
  );
}
