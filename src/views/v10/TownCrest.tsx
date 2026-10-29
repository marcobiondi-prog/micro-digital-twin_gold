import { useEffect, useState } from "react";
import { loadComuni } from "@/lib/comuni";
import { regionCrest, townCrest } from "@/lib/town-crest";
import { findComune } from "@/models/comuni";
import { cn } from "@/lib/utils";
import type { ProId } from "@/models/professional-id";

/**
 * The coat of arms of a town (by ISTAT code, or found by name in the list of towns), with its credit under it;
 * nothing at all while it loads, when the town has none or when it cannot be fetched.
 */
/** The coat of arms of a town as a picture address (by ISTAT code, or found by name), null while loading or when there is none. */
export function useTownCrest(name: string | null | undefined, istat?: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (!name) return;
    const code = istat ? Promise.resolve(istat) : loadComuni().then((l) => findComune(l, name)?.[3] ?? null);
    void code.then((c) => (c ? townCrest(c) : null)).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [name, istat]);
  return src;
}

/** A region's coat of arms as a picture address, null while loading or when there is none. */
export function useRegionCrest(region: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (region) void regionCrest(region).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [region]);
  return src;
}

/** The coat of arms of the profile in use: the town's for a municipal officer, the region's for an agronomist. */
export function useProfileCrest(id: ProId | null | undefined): { src: string | null; alt: string } {
  const town = useTownCrest(id?.kind === "funzionario" ? id.comune : null, id?.kind === "funzionario" ? id.istat : undefined);
  const region = useRegionCrest(id?.kind === "agronomo" ? id.region : null);
  if (id?.kind === "funzionario") return { src: town, alt: `Stemma del Comune di ${id.comune}` };
  if (id?.kind === "agronomo") return { src: region, alt: `Stemma della Regione ${id.region}` };
  return { src: null, alt: "" };
}

export function TownCrest({ name, istat, region, size = 56, className, caption = true, label = false }: { name: string; istat?: string | undefined; region?: boolean; size?: number; className?: string; caption?: boolean; label?: boolean }) {
  // A town's crest, or with `region` the crest of the region called `name`.
  const town = useTownCrest(region ? null : name, istat);
  const reg = useRegionCrest(region ? name : null);
  const found = region ? reg : town;
  const [broken, setBroken] = useState<string | null>(null);
  const src = found && found !== broken ? found : null;
  if (!src) return null;
  return (
    <figure className={cn("flex shrink-0 flex-col items-center gap-1", className)}>
      <img src={src} alt={region ? `Stemma della Regione ${name}` : `Stemma del Comune di ${name}`} width={size} height={size} loading="lazy" referrerPolicy="no-referrer"
        onError={() => setBroken(src)} className="object-contain drop-shadow-[0_2px_8px_rgb(0_0_0/0.35)]" style={{ width: size, height: size }} />
      {/* With `label`, the town's or region's name under the crest, then the credit. */}
      {(label || caption) && (
        <figcaption className="flex max-w-[6.5rem] flex-col items-center gap-0.5 text-center">
          {label && <span className="text-xs font-semibold leading-tight text-foreground">{region ? `Regione ${name}` : `Comune di ${name}`}</span>}
          {caption && <span className="text-[10px] leading-none text-muted-foreground">Wikimedia Commons</span>}
        </figcaption>
      )}
    </figure>
  );
}
