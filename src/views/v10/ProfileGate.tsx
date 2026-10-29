import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Grape, Lock, UserRound } from "lucide-react";
import { useProId } from "@/lib/use-pro-id";
import { KIND_LABEL, SECTION_KIND, SECTION_LABEL, proSummary, unlocks, type Section } from "@/models/professional-id";
import { toast } from "sonner";
import { Ambient, PageHero, TabRow, openSimTab } from "@/views/v8/console";
import { IdentifyForm, profileIntro } from "@/views/v10/Identify";
import { cn } from "@/lib/utils";

export const SECTION_TONE: Record<Section, string> = { urban: "rgb(28 112 210 / 0.42)", vineyard: "rgb(150 36 110 / 0.42)" };
const IDENTIFY_PATH = { urban: "/identificazione/funzionario", vineyard: "/identificazione/agronomo" } as const;
const WHO: Record<Section, { title: string; who: string; how: string }> = {
  urban: { title: "Piazza", who: "La simulazione della piazza è per i funzionari del Comune.", how: "Ti identifichi con il tuo Comune, l'ufficio di appartenenza e l'email del Comune." },
  vineyard: { title: "Vigneto", who: "La simulazione del vigneto è per gli agronomi.", how: "Ti identifichi con il patentino fitosanitario: numero, regione e scadenza." },
};

/** Whether this section is open to the profile in use (undefined while the page is not yet on the phone). */
export function useSectionOpen(section: Section): boolean | undefined {
  const id = useProId();
  return id === undefined ? undefined : unlocks(id, section);
}

/** The lock and the way in: what the section needs, who you are now (one profile at a time) and the white button to identify. */
export function SectionLockCard({ section, className }: { section: Section; className?: string }) {
  const id = useProId();
  const need = SECTION_KIND[section], other: Section = section === "urban" ? "vineyard" : "urban";
  return (
    <div className={cn("fuse-canvas space-y-4 rounded-3xl px-5 py-6 text-center", className)}>
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-foreground/[0.08]"><Lock className="size-7" aria-hidden="true" /></span>
      <div className="space-y-1.5">
        <p className="text-lg font-semibold">{WHO[section].who}</p>
        <p className="text-[15px] text-muted-foreground">{WHO[section].how}</p>
      </div>
      {id && id.kind !== need && (
        <p className="rounded-2xl bg-foreground/[0.06] px-4 py-3 text-sm text-muted-foreground">
          Ora sei identificato come <span className="font-semibold text-foreground">{proSummary(id)}</span>. Un profilo alla volta: se ti identifichi come {KIND_LABEL[need].toLowerCase()}, si blocca la {other === "urban" ? "piazza" : "sezione vigneto"}.
        </p>
      )}
      <Link to={IDENTIFY_PATH[section]} className="mx-auto inline-flex h-12 items-center gap-2 rounded-full bg-foreground pl-6 pr-2 text-[15px] font-semibold text-background outline-none focus-visible:ring-4 focus-visible:ring-ring/50">
        Identificati come {KIND_LABEL[need].toLowerCase()}
        <span className="grid size-8 place-items-center rounded-full bg-background text-foreground"><ArrowRight className="size-4" aria-hidden="true" /></span>
      </Link>
      {id && id.kind !== need && (
        <Link to={other === "urban" ? "/urbano" : "/vigneto"} className="block text-sm font-semibold text-muted-foreground underline underline-offset-4">Torna {other === "urban" ? "alla piazza" : "al vigneto"}</Link>
      )}
    </div>
  );
}

/**
 * A simulation page behind its profile: open to the right profile; otherwise the section shows only its "Profilo" tab,
 * with the identification form of the profile that opens it right there (the agronomist's in the vineyard, the
 * municipal officer's in the piazza). Nothing is drawn until the profile is read on the phone, so an open section never flashes the lock.
 */
export function SectionGate({ section, children }: { section: Section; children: ReactNode }) {
  const id = useProId();
  if (id === undefined) return <div className="min-h-[60vh]" />;
  if (unlocks(id, section)) return <>{children}</>;
  const Icon = section === "urban" ? Building2 : Grape;
  const need = SECTION_KIND[section];
  const done = () => {
    toast.success(`Identificato come ${KIND_LABEL[need].toLowerCase()}`, { description: `Si apre ${section === "urban" ? "la piazza" : "il vigneto"}.` });
    openSimTab(section, "simula");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  return (
    <div className="space-y-4">
      <Ambient tone={SECTION_TONE[section]} />
      <PageHero kicker={`Sezione ${SECTION_LABEL[section]} · bloccata`} kickerIcon={Icon} title={WHO[section].title} />
      <div className="sticky top-[var(--nav-h)] z-[999999997] -mx-4 bg-background/80 px-4 py-2 backdrop-blur-xl">
        <TabRow label="Sezioni" items={[{ id: "profilo", label: "Profilo", icon: UserRound }]} value="profilo" onChange={() => undefined} />
      </div>
      <div className="fuse-canvas space-y-4 rounded-3xl px-4 pb-6 pt-5 sm:px-5">
        <p className="flex items-center gap-2 text-lg font-semibold"><Lock className="size-5" aria-hidden="true" />{WHO[section].who}</p>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{profileIntro(need)}</p>
        {id && <p className="rounded-2xl bg-foreground/[0.06] px-4 py-3 text-sm text-muted-foreground">Ora sei identificato come <span className="font-semibold text-foreground">{proSummary(id)}</span>: identificandoti qui, quel profilo viene sostituito e {section === "urban" ? "il vigneto" : "la piazza"} si blocca.</p>}
        <IdentifyForm kind={need} onDone={done} />
        <p className="px-1 text-xs text-muted-foreground">I dati restano su questo dispositivo e, se hai fatto l'accesso, nel tuo account. Puoi uscire dal profilo quando vuoi, dalla scheda Profilo.</p>
      </div>
    </div>
  );
}
