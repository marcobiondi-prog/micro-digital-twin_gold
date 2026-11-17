import { Camera, Images, MapPin, EllipsisVertical, Radar, RotateCcw, Send, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** The ⋮ button's look, shared with the plain button SimShell shows until this menu's code has come. */
export const MENU_BUTTON = "grid size-11 place-items-center rounded-full bg-foreground/10 text-foreground outline-none backdrop-blur transition-colors hover:bg-foreground/[0.16] focus-visible:ring-2 focus-visible:ring-ring";

function Item({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return <DropdownMenuItem onSelect={onSelect} className="min-h-12 gap-3 rounded-xl px-3 text-[15px] font-medium focus:bg-accent focus:text-accent-foreground"><Icon className="size-5 text-muted-foreground" aria-hidden="true" />{label}</DropdownMenuItem>;
}

/**
 * The simulation's ⋮ context menu (radix's dropdown and its positioning, about 40 kB): loaded with the first tap on ⋮,
 * which it opens at once (defaultOpen), or once the page is idle.
 */
export default function SimMenu({ open, onCamera, onMedia, onSensors, onMap, onSend, onReset }: {
  open: boolean; onCamera: () => void; onMedia: () => void; onSensors: () => void; onMap: () => void; onSend?: (() => void) | undefined; onReset: () => void;
}) {
  return (
    <DropdownMenu defaultOpen={open}>
      <DropdownMenuTrigger asChild><button type="button" aria-label="Altre azioni" className={MENU_BUTTON}><EllipsisVertical className="size-6" aria-hidden="true" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="z-[999999999] w-64 rounded-2xl p-1.5 shadow-2xl">
        <Item icon={Camera} label="Fotocamera" onSelect={onCamera} />
        <Item icon={Images} label="Foto e video salvati" onSelect={onMedia} />
        <Item icon={Radar} label="Dove mettere i sensori" onSelect={onSensors} />
        <Item icon={MapPin} label="Cambia luogo" onSelect={onMap} />
        <DropdownMenuSeparator />
        {onSend && <Item icon={Send} label="Invia all’agronomo" onSelect={onSend} />}
        <Item icon={RotateCcw} label="Ricomincia" onSelect={onReset} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
