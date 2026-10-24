import type { ReactNode } from "react";
import { Camera, Images, MapPin, MoreHorizontal, Radar, RotateCcw, Scale, Send, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { Ambient, HeroButton, PageHero, Panels, TabRow, openSimTab, useSimTab, type SimKind, type SimTab } from "./console";

const TABS: ReadonlyArray<{ id: SimTab; label: string; icon: LucideIcon }> = [
  { id: "simula", label: "Simula", icon: SlidersHorizontal },
  { id: "luogo", label: "Luogo", icon: MapPin },
  { id: "media", label: "Foto e video", icon: Images },
  { id: "sensori", label: "Sensori AI", icon: Radar },
];
const TONE: Record<SimKind, string> = { urban: "rgb(28 112 210 / 0.42)", vineyard: "rgb(150 36 110 / 0.42)" };

function Item({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return <DropdownMenuItem onSelect={onSelect} className="min-h-12 gap-3 rounded-xl px-3 text-[15px] font-medium focus:bg-white/10 focus:text-white"><Icon className="size-5 text-white/70" aria-hidden="true" />{label}</DropdownMenuItem>;
}

/**
 * v8 simulator page: ambient light, the place (touch to change it) above a big thin title, Confronta and
 * the ⋯ context menu on the right, then pill tabs (Simula · Luogo · Foto e video · Sensori AI) and one panel.
 * The media panel is always mounted so the camera dock can reach it from any tab.
 */
export function SimShell({ kind, place, onCompare, onReset, onSend, simula, luogo, media, sensori }: { kind: SimKind; place: string; onCompare: () => void; onReset: () => void; onSend?: () => void; simula: ReactNode; luogo: ReactNode; media: ReactNode; sensori: ReactNode }) {
  const tab = useSimTab(kind);
  const go = (t: SimTab) => openSimTab(kind, t);
  return (
    <div className="space-y-4">
      <Ambient tone={TONE[kind]} />
      <PageHero kicker={place} kickerIcon={MapPin} onKicker={() => go("luogo")} title={kind === "urban" ? "Piazza" : "Vigneto"}
        actions={<>
          <HeroButton icon={Scale} label="Confronta" onClick={onCompare} showLabel />
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Altre azioni" className="grid size-11 place-items-center rounded-full bg-foreground/10 text-foreground outline-none backdrop-blur transition-colors hover:bg-foreground/[0.16] focus-visible:ring-2 focus-visible:ring-ring"><MoreHorizontal className="size-6" aria-hidden="true" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-2xl border-white/10 bg-[#262b34] p-1.5 text-white shadow-2xl">
              <Item icon={Camera} label="Fotocamera" onSelect={() => setCameraSheetOpen(true)} />
              <Item icon={Images} label="Foto e video salvati" onSelect={() => go("media")} />
              <Item icon={Radar} label="Dove mettere i sensori" onSelect={() => go("sensori")} />
              <Item icon={MapPin} label="Cambia luogo" onSelect={() => go("luogo")} />
              <DropdownMenuSeparator className="bg-white/10" />
              {onSend && <Item icon={Send} label="Invia all’agronomo" onSelect={onSend} />}
              <Item icon={RotateCcw} label="Ricomincia" onSelect={onReset} />
            </DropdownMenuContent>
          </DropdownMenu>
        </>} />
      <div className="sticky top-[var(--nav-h)] z-[999999997] -mx-4 bg-background/80 px-4 py-2 backdrop-blur-xl transition-[top] duration-300">
        <TabRow label="Sezioni" items={TABS} value={tab} onChange={go} />
      </div>
      <Panels value={tab} panels={[
        { id: "simula", content: simula },
        { id: "luogo", content: luogo },
        { id: "media", always: true, content: media },
        { id: "sensori", content: sensori },
      ]} />
    </div>
  );
}
