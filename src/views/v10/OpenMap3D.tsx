import { useEffect, useRef, useState } from "react";
import { Crosshair, LoaderCircle } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * 3D view without the browser key: an open vector map tilted, with the buildings raised from their heights and a pin
 * on the place. Loaded only when 3D opens; one finger moves, two fingers turn and tilt it ([data-map-gestures]).
 */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Camera = { center: [number, number]; zoom: number; pitch: number; bearing: number };

export function OpenMap3D({ lat, lng, label, zoom }: { lat: number; lng: number; label: string; zoom: number }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ easeTo: (c: Camera & { duration: number }) => void } | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const camera: Camera = { center: [lng, lat], zoom, pitch: 60, bearing: -20 };
  useEffect(() => {
    let cancelled = false, remove: (() => void) | undefined;
    setState("loading");
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !host.current) return;
      const map = new maplibregl.Map({ container: host.current, style: STYLE, ...camera, maxPitch: 75, attributionControl: { compact: true } });
      map.on("load", () => {
        // The style already raises buildings only at close zoom: make sure they stand up wherever there are heights.
        if (!map.getLayer("building-3d") && map.getSource("openmaptiles")) {
          map.addLayer({ id: "building-3d-raised", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
            paint: { "fill-extrusion-color": "#c9ccd3", "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.85 } });
        }
        if (!cancelled) setState("ready");
      });
      map.on("error", () => { if (!cancelled && !map.loaded()) setState("error"); });
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
      <div ref={host} className="h-full w-full" role="img" aria-label={`Vista 3D di ${label}`} />
      {state === "ready" && <button type="button" onClick={recenter} aria-label="Ricentra la vista 3D sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
      {state === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label="Caricamento vista 3D" /></div>}
      {state === "error" && <p role="status" className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground">Vista 3D non disponibile in questo momento.</p>}
    </div>
  );
}
