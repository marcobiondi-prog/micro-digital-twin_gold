import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Grape, Lock, MapPin } from "lucide-react";
import { useSignedIn } from "@/lib/use-signed-in";
import { openAccount } from "@/lib/camera-dock";
import { DEMO_LOGIN_AVAILABLE, setDemoSignedIn } from "@/lib/demo-login";
import { cn } from "@/lib/utils";
import { useLab } from "@/models/lab-store";
import { Ambient, PageHero, TabRow, getMapPlace, openSimTab, setMapPlace } from "@/views/v8/console";
import { PlaceSearch } from "@/views/SimulationGrid";

const OpenMap3D = lazy(() => import("@/views/v10/OpenMap3D").then((m) => ({ default: m.OpenMap3D })));
const LocationMap3D = lazy(() => import("@/views/LocationMap3D").then((m) => ({ default: m.LocationMap3D })));

type Place = "urban" | "vineyard";
const PLACES: ReadonlyArray<{ id: Place; label: string; icon: typeof Building2 }> = [
  { id: "urban", label: "Piazza", icon: Building2 },
  { id: "vineyard", label: "Vigneto", icon: Grape },
];

/**
 * The map page (it takes Home's place in the menu): the two places being simulated, one at a time on a big
 * interactive map with the search to change it, and under it the place and the way into its simulation.
 */
export function PlacesMap() {
  const lab = useLab();
  const navigate = useNavigate();
  const [place, setPlaceState] = useState<Place>(getMapPlace);
  const setPlace = (p: Place) => { setMapPlace(p); setPlaceState(p); };
  const loc = place === "urban" ? lab.urban.location : lab.vineyard.location;
  const [name, ...rest] = loc.label.split(" · ");
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const q = `${loc.lat},${loc.lng}`;
  const zoom = place === "urban" ? 17 : 14;
  // The 2D map is the keyless satellite embed: it needs no key, so it never shows an error when the key does not
  // allow this address (previews, new domains). Interactive (pan, pinch).
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&t=k&hl=it&output=embed`;
  // 2D (the embed) is the default; 3D (photorealistic, needs the browser key) opens only for signed-in users:
  // guests see the switch with a lock, and touching it offers the sign-in.
  const { signedIn } = useSignedIn();
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [hint, setHint] = useState(false);
  useEffect(() => { if (!signedIn) setView("2d"); else setHint(false); }, [signedIn]);
  // Always both: with the browser key 3D is the photorealistic view, without it an open map with the buildings raised.
  const show3d = view === "3d" && signedIn;
  const go = () => {
    openSimTab(place, "simula");
    void navigate({ to: place === "urban" ? "/urbano" : "/vigneto", replace: true });
  };
  return (
    <div className="space-y-4">
      <Ambient tone="rgb(120 130 150 / 0.22)" />
      <PageHero title="Mappa" />
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><TabRow label="Luogo da vedere" items={PLACES} value={place} onChange={setPlace} /></div>
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
      <PlaceSearch key={place} kind={place} />
      <div className="-mx-4 h-[38vh] min-h-60 overflow-hidden bg-card sm:mx-0 sm:rounded-3xl">
        {show3d
          ? <Suspense fallback={<div className="h-full w-full bg-card" />}>{key
            ? <LocationMap3D key={`${loc.lat},${loc.lng}`} lat={loc.lat} lng={loc.lng} label={name ?? ""} apiKey={key}
              fallback={<OpenMap3D lat={loc.lat} lng={loc.lng} label={name ?? ""} zoom={place === "urban" ? 17 : 15} />} />
            : <OpenMap3D key={`${loc.lat},${loc.lng}`} lat={loc.lat} lng={loc.lng} label={name ?? ""} zoom={place === "urban" ? 17 : 15} />}</Suspense>
          : <iframe key={src} data-map-gestures title={`Mappa di ${name}`} src={src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="block h-full w-full border-0" />}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name}</p>
            {rest.length > 0 && <p className="truncate text-sm text-muted-foreground">{rest.join(" · ")}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={go} className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background outline-none focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100 sm:flex-none">Apri la simulazione<ArrowRight className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}
