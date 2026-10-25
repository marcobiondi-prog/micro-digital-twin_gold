import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Grape, MapPin } from "lucide-react";
import { useLab } from "@/models/lab-store";
import { Ambient, PageHero, TabRow, openSimTab } from "@/views/v8/console";

type Place = "urban" | "vineyard";
const PLACES: ReadonlyArray<{ id: Place; label: string; icon: typeof Building2 }> = [
  { id: "urban", label: "Piazza", icon: Building2 },
  { id: "vineyard", label: "Vigneto", icon: Grape },
];

/**
 * The map page (it takes Home's place in the menu): the two places being simulated, one at a time on a big
 * interactive map, and under it the place with its two ways in: open the simulation, or change the place there.
 */
export function PlacesMap() {
  const lab = useLab();
  const navigate = useNavigate();
  const [place, setPlace] = useState<Place>("urban");
  const loc = place === "urban" ? lab.urban.location : lab.vineyard.location;
  const [name, ...rest] = loc.label.split(" · ");
  const key = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY;
  const q = `${loc.lat},${loc.lng}`;
  const zoom = place === "urban" ? 17 : 14;
  // With the browser key the official embed, else the keyless one: both are interactive (pan, pinch).
  const src = key
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=${zoom}&maptype=satellite&language=it`
    : `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&t=k&hl=it&output=embed`;
  const go = (tab: "simula" | "luogo") => {
    openSimTab(place, tab);
    void navigate({ to: place === "urban" ? "/urbano" : "/vigneto", replace: true });
  };
  return (
    <div className="space-y-4">
      <Ambient tone="rgb(120 130 150 / 0.22)" />
      <PageHero title="Mappa" />
      <TabRow label="Luogo da vedere" items={PLACES} value={place} onChange={setPlace} />
      <div data-map-gestures className="-mx-4 overflow-hidden bg-card sm:mx-0 sm:rounded-3xl">
        <iframe key={src} title={`Mappa di ${name}`} src={src} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="block h-[44vh] min-h-64 w-full border-0" />
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
          <button type="button" onClick={() => go("luogo")} className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-foreground/[0.08] px-5 text-sm font-semibold outline-none hover:bg-foreground/[0.12] focus-visible:ring-2 focus-visible:ring-ring sm:flex-none">Cambia luogo</button>
          <button type="button" onClick={() => go("simula")} className="inline-flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background outline-none focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:active:scale-100 sm:flex-none">Apri la simulazione<ArrowRight className="size-4" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  );
}
