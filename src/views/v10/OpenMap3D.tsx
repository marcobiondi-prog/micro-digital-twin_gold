import { useEffect, useRef, useState } from "react";
import { Crosshair, LoaderCircle } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Ring } from "@/models/place-area";
import { addAreaLayers, addSimLayers, placePinElement, setAreaData, setSimData, SIM_TREES_3D, type SimLayout, MAP_LOCALE } from "@/views/v10/map-area";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useSimWhen } from "@/models/sim-when";
import { sunAt } from "@/models/sun-shadow";
import type { SimThreeLayer } from "@/views/v10/three-layer";

/**
 * 3D view without the browser key: an open vector map tilted, with the buildings raised from their heights and a pin
 * on the place. Loaded only when 3D opens; one finger moves, two fingers turn and tilt it ([data-map-gestures]).
 */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number };

export function OpenMap3D({ lat, lng, label, zoom, area = [], sim = null }: { lat: number; lng: number; label: string; zoom: number; area?: Ring; sim?: SimLayout | null }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ easeTo: (c: Camera & { duration: number }) => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // The simulation's objects are drawn by three.js inside the map (views/v10/three-layer): real models lit by the
  // simulation's sun, with shadows. The map is built once per place; the objects and the light follow the levers.
  const engine = useRef<{ map: MlMap; three: SimThreeLayer | null } | null>(null);
  const when = useSimWhen(sim?.kind === "vigneto" ? "vineyard" : "urban");
  const sun = when ? sunAt(lat, lng, when.season, when.hour, when.minute ?? 0, when.dst) : null;
  const simKey = JSON.stringify(sim), sunKey = sun ? `${sun.az.toFixed(3)},${sun.alt.toFixed(3)}` : "notte";
  const camera: Camera = { center: [lng, lat], zoom, pitch: 60, bearing: -20 };
  useEffect(() => {
    let cancelled = false, remove: (() => void) | undefined;
    setState("loading");
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !host.current) return;
      const map = new maplibregl.Map({ container: host.current, style: STYLE, locale: MAP_LOCALE, ...camera, maxPitch: 75, attributionControl: false });
      map.on("load", () => {
        // The style already raises buildings only at close zoom: make sure they stand up wherever there are heights.
        if (!map.getLayer("building-3d") && map.getSource("openmaptiles")) {
          map.addLayer({ id: "building-3d-raised", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
            paint: { "fill-extrusion-color": "#c9ccd3", "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.85 } });
        }
        // The area drawn with pins on the 2D map, on the ground under the raised buildings.
        addAreaLayers(map);
        setAreaData(map, area);
        // The simulation inside it: lawn, shade, zones and lines on the ground, the trees raised as crowns.
        addSimLayers(map, lat, true);
        let three: SimThreeLayer | null = null;
        void import("@/views/v10/three-layer").then(({ simThreeLayer }) => {
          if (cancelled) return;
          three = simThreeLayer(maplibregl, [lng, lat]);
          map.addLayer(three);
          engine.current = { map, three };
          setState("ready");
        }).catch(() => { engine.current = { map, three: null }; if (!cancelled) setState("ready"); });
        engine.current = { map, three };
      });
      map.on("error", () => { if (!cancelled && !map.loaded()) setState("error"); });
      new maplibregl.Marker({ element: placePinElement(), anchor: "bottom" }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 38 }).setText(label)).addTo(map);
      mapRef.current = map;
      remove = () => map.remove();
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; mapRef.current = null; engine.current = null; remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom, label, JSON.stringify(area)]);
  // The levers and the clock: the ground shapes on the map's own layers, the objects (and, without three.js, the old
  // extruded slabs) and the sun in the three.js layer — no rebuilding of the map.
  useEffect(() => {
    const e = engine.current;
    if (state !== "ready" || !e) return;
    setSimData(e.map, sim, true);
    if (e.three) {
      (e.map.getSource(SIM_TREES_3D) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      e.three.update(sim, sun ? { az: sun.az, alt: sun.alt } : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, simKey, sunKey]);
  const recenter = () => mapRef.current?.easeTo({ ...camera, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800 });
  return (
    <div data-map-gestures="" className="relative h-full w-full touch-none overflow-hidden bg-card">
      <div ref={host} className="h-full w-full" role="img" aria-label={`Vista 3D di ${label}`} />
      {state === "ready" && <button type="button" onClick={recenter} aria-label="Ricentra la vista 3D sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
      {state === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label="Caricamento vista 3D" /></div>}
      {state === "error" && <p role="status" className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground">Vista 3D non disponibile in questo momento.</p>}
    </div>
  );
}
