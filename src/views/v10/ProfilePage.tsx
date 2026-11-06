import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Check, Grape, Lock, LogOut, UserRound, type LucideIcon } from "lucide-react";
import { leaveGuest, openSectorGate, useGuest, useProId } from "@/lib/use-pro-id";
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
  const guest = useGuest();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Ambient tone="rgb(40 130 120 / 0.40)" />
      <PageHero kicker="Profilo professionale" title="Profilo" />
      {id === undefined ? <div className="min-h-[40vh]" /> : guest && !id ? <GuestCard /> : id ? (
        <ProfileCard kind={id.kind} go={() => void navigate({ to: id.kind === "agronomo" ? "/vigneto" : "/urbano" })} />
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-muted-foreground">Identificati per aprire la tua simulazione.</p>
          <div className="space-y-3"><Way kind="agronomo" /><Way kind="funzionario" /></div>
        </>
      )}
    </div>
  );
}

const GUEST_CAN = ["La simulazione della piazza e quella del vigneto", "La mappa in 2D, il luogo e l'area disegnata", "Foto e video", "La dashboard"];
const GUEST_CANNOT = ["La cronologia degli interventi: da ospite non si registra", "Sensori AI", "Esporta report e Invia il progetto"];

/** The guest's profile: what one can use without identifying, what not, the two ways to identify and "Esci da ospite". */
function GuestCard() {
  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-3xl bg-foreground/[0.05] p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground/[0.08]"><UserRound className="size-6" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-lg font-semibold">Sei entrato come ospite</p>
            <p className="text-sm text-muted-foreground">Né funzionario né conduttore: usi l'app, ma non tutta.</p>
          </div>
        </div>
        <div className="rounded-2xl bg-foreground/[0.04] p-4">
          <p className="mb-2 text-sm font-semibold">Puoi usare</p>
          <ul className="space-y-1.5">{GUEST_CAN.map((t) => <li key={t} className="flex items-start gap-2 text-sm"><Check className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />{t}</li>)}</ul>
          <p className="mb-2 mt-4 text-sm font-semibold">Solo dopo esserti identificato</p>
          <ul className="space-y-1.5">{GUEST_CANNOT.map((t) => <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground"><Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{t}</li>)}</ul>
        </div>
      </div>
      <div className="space-y-3">
        <p className="px-1 text-sm font-semibold text-muted-foreground">Identificati per avere tutto</p>
        <GuestWay kind="funzionario" /><GuestWay kind="agronomo" />
      </div>
      <button type="button" onClick={() => { leaveGuest(); openSectorGate(null); }} className="mx-auto flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <LogOut className="size-4" aria-hidden="true" />Esci da ospite
      </button>
    </div>
  );
}

function GuestWay({ kind }: { kind: ProKind }) {
  const w = WAY[kind], Icon = w.icon;
  return (
    <button type="button" onClick={() => openSectorGate(kind)} className="group flex w-full items-center gap-4 rounded-3xl bg-foreground/[0.05] p-4 text-left outline-none transition-colors hover:bg-foreground/[0.09] focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-foreground/[0.08]"><Icon className="size-6" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{KIND_LABEL[kind]}</span>
        <span className="block text-sm text-muted-foreground">{w.opens} · {w.with}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}
