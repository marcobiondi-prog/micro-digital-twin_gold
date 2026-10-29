import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Grape, Lock } from "lucide-react";
import { useSectionOpen } from "@/views/v10/ProfileGate";
import { useProId } from "@/lib/use-pro-id";
import { KIND_LABEL, type ProId } from "@/models/professional-id";
import { ProfileIcon } from "@/views/ProfileIcon";
import { useProfileCrest } from "@/views/v10/TownCrest";
import { Ambient, PageHero, openSimTab } from "@/views/v8/console";
import { HistoryBlock } from "@/views/v10/HistoryBlock";

const TONE = "rgb(40 130 120 / 0.40)";

function Start({ to, icon: Icon, title, text, who }: { to: "/urbano" | "/vigneto"; icon: typeof Building2; title: string; text: string; who: string }) {
  // Locked until the profile that opens it is identified: the tile says who it is for and still leads to the page with the lock.
  const open = useSectionOpen(to === "/urbano" ? "urban" : "vineyard");
  return (
    <Link to={to} onClick={() => openSimTab(to === "/urbano" ? "urban" : "vineyard", "simula")} className="group flex min-h-24 min-w-0 flex-1 flex-col justify-between gap-3 rounded-3xl bg-foreground/[0.05] p-4 outline-none transition-colors hover:bg-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex items-center justify-between"><Icon className="size-6" aria-hidden="true" />{open === false && <Lock className="size-5 text-muted-foreground" aria-label="bloccato" />}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-base font-semibold">{title}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        <span className="block text-sm text-muted-foreground">{open === false ? who : text}</span>
      </span>
    </Link>
  );
}

/** In the place of the locked section, once identified: a round button with the profile's badge, leading to the profile page. */
function ProfileButton({ id }: { id: ProId }) {
  const crest = useProfileCrest(id);
  return (
    // It takes the locked tile's half of the row, so the open section's tile keeps its size; the circle sits in the middle.
    <Link to="/profilo" aria-label={`Profilo: ${KIND_LABEL[id.kind].toLowerCase()}, ${id.name}`}
      className="group flex min-h-24 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {/* The profile's coat of arms in the circle (the town's for the officer, the region's for the agronomist), else its badge. */}
      <span className="grid size-20 place-items-center overflow-hidden rounded-full bg-foreground/[0.08] ring-1 ring-foreground/10 transition-colors group-hover:bg-foreground/[0.14]">
        {crest.src
          ? <img src={crest.src} alt={crest.alt} referrerPolicy="no-referrer" className="size-14 object-contain drop-shadow-[0_2px_6px_rgb(0_0_0/0.35)]" />
          : <ProfileIcon kind={id.kind} className="size-8" aria-hidden="true" />}
      </span>
      <span className="text-sm font-semibold">Profilo</span>
    </Link>
  );
}

/** The page after the intro: where to start, then the latest interventions, with the whole history one tap away. */
export function Welcome() {
  const proId = useProId();
  return (
    <div className="space-y-6">
      <Ambient tone={TONE} />
      <PageHero kicker="Micro Digital Twin" title="Benvenuto" />
      <p className="text-[15px] leading-relaxed text-muted-foreground">Scegli da dove partire. Qui sotto trovi gli ultimi interventi che hai registrato.</p>
      <div className="flex gap-3">
        {/* Identified, the section the profile locks gives its place to the round profile button (the agronomist's where Piazza was, the officer's where Vigneto was). */}
        {proId?.kind === "agronomo" ? <ProfileButton id={proId} /> : <Start to="/urbano" icon={Building2} title="Piazza" text="Prova gli interventi in città" who="Per i funzionari del Comune" />}
        {proId?.kind === "funzionario" ? <ProfileButton id={proId} /> : <Start to="/vigneto" icon={Grape} title="Vigneto" text="Prova gli interventi in vigna" who="Per gli agronomi" />}
      </div>
      <HistoryBlock compact />
    </div>
  );
}
