import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Grape, type LucideIcon } from "lucide-react";
import { useProId } from "@/lib/use-pro-id";
import { KIND_LABEL, type ProKind } from "@/models/professional-id";
import { Ambient, PageHero } from "@/views/v8/console";
import { ProfileCard } from "@/views/v10/Identify";

const WAY: Record<ProKind, { to: "/identificazione/agronomo" | "/identificazione/funzionario"; icon: LucideIcon; opens: string; with: string }> = {
  agronomo: { to: "/identificazione/agronomo", icon: Grape, opens: "Apre il vigneto", with: "Con il patentino fitosanitario" },
  funzionario: { to: "/identificazione/funzionario", icon: Building2, opens: "Apre la piazza", with: "Con il Comune, l'ufficio e l'email del Comune" },
};

function Way({ kind }: { kind: ProKind }) {
  const w = WAY[kind], Icon = w.icon;
  return (
    <Link to={w.to} className="group flex items-center gap-4 rounded-3xl bg-foreground/[0.05] p-4 outline-none transition-colors hover:bg-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-foreground/[0.08]"><Icon className="size-6" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{KIND_LABEL[kind]}</span>
        <span className="block text-sm text-muted-foreground">{w.opens} · {w.with}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * Profilo (/profilo), reached from the round button in the place of the locked section: who is identified, with their
 * data, the way into their section and "Esci dal profilo" (no switching to the other profile here); with no profile, the two ways to identify.
 */
export function ProfilePage() {
  const id = useProId();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Ambient tone="rgb(40 130 120 / 0.40)" />
      <PageHero kicker="Profilo professionale" title="Profilo" />
      {id === undefined ? <div className="min-h-[40vh]" /> : id ? (
        <ProfileCard kind={id.kind} go={() => void navigate({ to: id.kind === "agronomo" ? "/vigneto" : "/urbano" })} />
      ) : (
        <>
          <p className="text-[16px] leading-relaxed text-muted-foreground">Identificati per aprire la tua simulazione. Un profilo alla volta: l'altra sezione resta bloccata.</p>
          <div className="space-y-3"><Way kind="agronomo" /><Way kind="funzionario" /></div>
        </>
      )}
    </div>
  );
}
