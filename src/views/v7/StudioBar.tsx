import { Camera, Images, MapPin, MoreHorizontal, Radar, RotateCcw, Scale, Send, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setCameraSheetOpen } from "@/lib/camera-dock";

/** Page sections the context menu can open (ids of the Fold elements below the studio). */
export const foldId = (kind: "urban" | "vineyard", section: "luogo" | "media" | "sensori") => `fold-${section}-${kind}`;

/** Opens one of the page's Fold sections (the others close) and brings it into view. */
export function openFold(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
}

function Item({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return <DropdownMenuItem onSelect={onSelect} className="min-h-12 gap-3 rounded-xl px-3 text-[15px] font-medium focus:bg-white/10 focus:text-white"><Icon className="size-5 text-white/70" aria-hidden="true" />{label}</DropdownMenuItem>;
}

/**
 * v7 top bar of a simulator: the place (touch to change it), Confronta, and the context menu ⋯ with
 * everything else this page can do. Dark like the studio below it.
 */
export function StudioBar({ kind, place, onCompare, onReset, onSend }: { kind: "urban" | "vineyard"; place: string; onCompare: () => void; onReset: () => void; onSend?: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-white/10 bg-[#0d1016] px-3 py-2 text-white shadow-lg sm:px-6">
      <button type="button" onClick={() => openFold(foldId(kind, "luogo"))} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-300" aria-label={`Luogo: ${place}. Tocca per cambiarlo`}>
        <MapPin className="size-5 shrink-0 text-cyan-300" aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold">{place}</span>
      </button>
      <button type="button" onClick={onCompare} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white/[0.08] px-3 text-sm font-semibold outline-none transition-colors hover:bg-white/[0.14] focus-visible:ring-2 focus-visible:ring-cyan-300">
        <Scale className="size-5" aria-hidden="true" /><span className="max-[359px]:sr-only">Confronta</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Altre azioni" className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/[0.08] outline-none transition-colors hover:bg-white/[0.14] focus-visible:ring-2 focus-visible:ring-cyan-300"><MoreHorizontal className="size-6" aria-hidden="true" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-2xl border-white/10 bg-[#151922] p-1.5 text-white shadow-2xl">
          <Item icon={Camera} label="Fotocamera" onSelect={() => setCameraSheetOpen(true)} />
          <Item icon={Images} label="Foto e video salvati" onSelect={() => openFold(foldId(kind, "media"))} />
          <Item icon={Radar} label="Dove mettere i sensori" onSelect={() => openFold(foldId(kind, "sensori"))} />
          <Item icon={MapPin} label="Cambia luogo" onSelect={() => openFold(foldId(kind, "luogo"))} />
          <DropdownMenuSeparator className="bg-white/10" />
          {onSend && <Item icon={Send} label="Invia all’agronomo" onSelect={onSend} />}
          <Item icon={RotateCcw} label="Ricomincia" onSelect={onReset} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
