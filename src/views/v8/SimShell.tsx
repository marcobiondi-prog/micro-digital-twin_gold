import { type ReactNode } from "react";
import { Camera, Images, Map as MapIcon, MapPin, EllipsisVertical, Radar, RotateCcw, Scale, Send, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useTabSwipe } from "@/lib/use-tab-swipe";
import { useAutoHistory } from "@/lib/use-auto-history";
import { SimMap } from "@/views/v10/SimMap";
import { Ambient, HeroButton, PageHero, Panels, TabRow, openSimTab, showSimMedia, simMediaId, useSimTab, type SimKind, type SimTab } from "./console";

const TABS: ReadonlyArray<{ id: SimTab; label: string; icon: LucideIcon }> = [
  { id: "simula", label: "Simula", icon: SlidersHorizontal },
  { id: "mappa", label: "Mappa", icon: MapIcon },
  { id: "sensori", label: "Sensori AI", icon: Radar },
];
const TONE: Record<SimKind, string> = { urban: "rgb(28 112 210 / 0.42)", vineyard: "rgb(150 36 110 / 0.42)" };

function Item({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return <DropdownMenuItem onSelect={onSelect} className="min-h-12 gap-3 rounded-xl px-3 text-[15px] font-medium focus:bg-accent focus:text-accent-foreground"><Icon className="size-5 text-muted-foreground" aria-hidden="true" />{label}</DropdownMenuItem>;
}

/**
 * v8 simulator page: ambient light, the place (touch to change it) above a big thin title, Confronta and
 * the ⋮ context menu on the right, then pill tabs (Simula · Mappa · Sensori AI) and one panel.
 * Simula shows the simulation with its photos and videos below it.
 */
export function SimShell({ kind, place, onCompare, onReset, onSend, simula, media, sensori }: { kind: SimKind; place: string; onCompare?: (() => void) | undefined; onReset: () => void; onSend?: () => void; simula: ReactNode; media: ReactNode; sensori: ReactNode }) {
  const tab = useSimTab(kind);
  const go = (t: SimTab) => openSimTab(kind, t);
  // The place is shown and changed in the Mappa tab.
  const toMap = () => go("mappa");
  // A sideways swipe on the panel moves to the neighbouring tab, like the tutorial; sliders, maps and rows that scroll sideways keep their own moves.
  useAutoHistory(kind);
  useTabSwipe(TABS.map((t) => t.id), tab, go);
  return (
    <div className="space-y-4">
      <Ambient tone={TONE[kind]} />
      <PageHero kicker={place} kickerIcon={MapPin} onKicker={toMap} title={kind === "urban" ? "Piazza" : "Vigneto"}
        actions={<>
          {onCompare && <HeroButton icon={Scale} label="Confronta" onClick={onCompare} showLabel />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Altre azioni" className="grid size-11 place-items-center rounded-full bg-foreground/10 text-foreground outline-none backdrop-blur transition-colors hover:bg-foreground/[0.16] focus-visible:ring-2 focus-visible:ring-ring"><EllipsisVertical className="size-6" aria-hidden="true" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="z-[999999999] w-64 rounded-2xl p-1.5 shadow-2xl">
              <Item icon={Camera} label="Fotocamera" onSelect={() => setCameraSheetOpen(true)} />
              <Item icon={Images} label="Foto e video salvati" onSelect={() => showSimMedia(kind)} />
              <Item icon={Radar} label="Dove mettere i sensori" onSelect={() => go("sensori")} />
              <Item icon={MapPin} label="Cambia luogo" onSelect={toMap} />
              <DropdownMenuSeparator />
              {onSend && <Item icon={Send} label="Invia all’agronomo" onSelect={onSend} />}
              <Item icon={RotateCcw} label="Ricomincia" onSelect={onReset} />
            </DropdownMenuContent>
          </DropdownMenu>
        </>} />
      <div className="sticky top-[var(--nav-h)] z-[999999997] -mx-4 bg-background/80 px-4 py-2 backdrop-blur-xl transition-[top] duration-300">
        <TabRow label="Sezioni" items={TABS} value={tab} onChange={go} />
      </div>
      <Panels value={tab} panels={[
        // Simula carries the photos and videos under the simulation, so it stays mounted: the camera dock reaches LabMedia from any tab.
        { id: "simula", always: true, content: <div className="space-y-6">{simula}<section id={simMediaId(kind)} aria-label="Foto e video" className="fuse-canvas scroll-mt-[calc(var(--nav-h)+5rem)] rounded-t-3xl px-3 pt-4 pb-6 sm:px-5">{media}</section></div> },
        { id: "mappa", content: <SimMap kind={kind} /> },
        { id: "sensori", content: sensori },
      ]} />
    </div>
  );
}
