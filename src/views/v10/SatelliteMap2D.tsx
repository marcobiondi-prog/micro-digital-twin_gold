import { useEffect, useRef, useState } from "react";
import { Crosshair, LoaderCircle } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

/**
 * 2D view: open satellite imagery with place names over it and a pin on the place, no key needed. One finger moves
 * it, two fingers zoom and turn it, with no "use two fingers" lock ([data-map-gestures] keeps its own gestures).
 */
const ARCGIS = "https://server.arcgisonline.com/ArcGIS/rest/services";
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: { type: "raster", tiles: [`${ARCGIS}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution: "Immagini © Esri, Maxar, Earthstar Geographics" },
    places: { type: "raster", tiles: [`${ARCGIS}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "places", type: "raster", source: "places" },
  ],
};

type Camera = { center: [number, number]; zoom: number; bearing: number };

export function SatelliteMap2D({ lat, lng, label, zoom }: { lat: number; lng: number; label: string; zoom: number }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ easeTo: (c: Camera & { duration: number }) => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const camera: Camera = { center: [lng, lat], zoom, bearing: 0 };
  useEffect(() => {
    let cancelled = false, remove: (() => void) | undefined;
    setState("loading");
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !host.current) return;
      const map = new maplibregl.Map({ container: host.current, style: STYLE, ...camera, maxZoom: 19, pitchWithRotate: false, cooperativeGestures: false, attributionControl: { compact: true } });
      map.touchPitch.disable();
      map.on("load", () => { if (!cancelled) setState("ready"); });
      // A tile that does not arrive leaves a gap, not an error: the map stays usable.
      new maplibregl.Marker({ color: "#0b0f15" }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 24 }).setText(label)).addTo(map);
      mapRef.current = map;
      remove = () => map.remove();
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; mapRef.current = null; remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom, label]);
  const recenter = () => mapRef.current?.easeTo({ ...camera, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800 });
  return (
    <div data-map-gestures="" className="relative h-full w-full touch-none overflow-hidden bg-card">
      <div ref={host} className="h-full w-full" role="img" aria-label={`Mappa di ${label}`} />
      {state === "ready" && <button type="button" onClick={recenter} aria-label="Ricentra la mappa sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
      {state === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label="Caricamento mappa" /></div>}
      {state === "error" && <p role="status" className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground">Mappa non disponibile in questo momento.</p>}
    </div>
  );
}
