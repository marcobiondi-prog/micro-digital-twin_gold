import { useEffect, useState } from "react";
import { wikiLogos } from "@/lib/gnss-logos";
import { needsDarkTile, type CreditItem } from "@/models/credit-logos";
import { cn } from "@/lib/utils";

/**
 * Credits as tiles: each logo on its own tile (white, or dark for a light mark), the name and one line under it. The
 * bundled marks show at once; the others come from Wikidata once and are kept on the device; without one, the name.
 */
export function LogoTiles({ items, cacheKey, label }: { items: CreditItem[]; cacheKey: string; label: string }) {
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { let on = true; void wikiLogos(cacheKey, items).then((l) => { if (on) setLogos(l); }); return () => { on = false; }; }, [cacheKey, items]);
  return (
    <span className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" role="list" aria-label={label}>
      {items.map((g) => {
        const src = logos[g.id];
        const dark = g.icon ? needsDarkTile(g.icon.hex) : false;
        return (
          <span key={g.id} role="listitem" className="flex flex-col items-center gap-1.5 rounded-xl bg-foreground/[0.04] p-2 text-center ring-1 ring-foreground/10">
            <span className={cn("grid h-12 w-full place-items-center rounded-lg p-1.5", dark ? "bg-slate-800" : "bg-white")}>
              {g.icon ? (
                <svg viewBox="0 0 24 24" role="img" aria-label={`Logo ${g.name}`} className="size-8"><path d={g.icon.path} fill={g.icon.hex} /></svg>
              ) : src && !failed.has(g.id) ? (
                <img src={src} alt={`Logo ${g.name}`} loading="lazy" className="max-h-full max-w-full object-contain" onError={() => setFailed((p) => new Set(p).add(g.id))} />
              ) : (
                <span className={cn("line-clamp-2 max-w-full overflow-hidden font-bold leading-tight text-slate-700 [overflow-wrap:anywhere]", g.name.length > 14 ? "text-[10px]" : "text-[13px] tracking-wide")}>{g.name}</span>
              )}
            </span>
            <span className="max-w-full text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{g.name}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">{g.sub}</span>
          </span>
        );
      })}
    </span>
  );
}
