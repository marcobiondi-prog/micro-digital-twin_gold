import { useEffect, useState } from "react";
import { loadComuni } from "@/lib/comuni";
import { townCrest } from "@/lib/town-crest";
import { findComune } from "@/models/comuni";
import { cn } from "@/lib/utils";

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

export function TownCrest({ name, istat, size = 56, className, caption = true }: { name: string; istat?: string | undefined; size?: number; className?: string; caption?: boolean }) {
  const found = useTownCrest(name, istat);
  const [broken, setBroken] = useState<string | null>(null);
  const src = found && found !== broken ? found : null;
  if (!src) return null;
  return (
    <figure className={cn("flex shrink-0 flex-col items-center gap-1", className)}>
      <img src={src} alt={`Stemma del Comune di ${name}`} width={size} height={size} loading="lazy" referrerPolicy="no-referrer"
        onError={() => setBroken(src)} className="object-contain drop-shadow-[0_2px_8px_rgb(0_0_0/0.35)]" style={{ width: size, height: size }} />
      {caption && <figcaption className="text-[10px] leading-none text-muted-foreground">Wikimedia Commons</figcaption>}
    </figure>
  );
}
