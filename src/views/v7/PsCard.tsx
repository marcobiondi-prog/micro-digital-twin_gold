import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PlayStation-app feed card: a source row (small coloured square icon + name), a wide picture,
 * a bold title, one plain line and a quiet meta on the right. Renders its own body; the caller
 * wraps it in a Link or a button so the whole card is one target.
 */
export function PsCardBody({ icon: Icon, iconImg, tone, source, art, title, desc, meta }: { icon?: LucideIcon; iconImg?: string | undefined; tone: string; source: string; art: ReactNode; title: string; desc: string; meta?: string }) {
  return (
    <>
      <span className="flex items-center gap-2.5">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]", tone)}>
          {iconImg ? <img src={iconImg} alt="" aria-hidden="true" className="size-6" /> : Icon ? <Icon className="size-[18px]" aria-hidden="true" /> : null}
        </span>
        <span className="text-[15px] text-muted-foreground">{source}</span>
      </span>
      <span className="relative mt-3 block aspect-[16/9] overflow-hidden rounded-md bg-black/40">{art}</span>
      <span className="mt-3 block text-lg font-semibold leading-snug text-foreground">{title}</span>
      <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{desc}</span>
      {meta && <span className="mt-2 block text-right text-xs tracking-wide text-muted-foreground/80">{meta}</span>}
    </>
  );
}

export const psCardClass = "group block w-full rounded-xl bg-card p-3.5 text-left outline-none ring-1 ring-white/[0.04] transition-[transform,background-color] duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 sm:p-4";
