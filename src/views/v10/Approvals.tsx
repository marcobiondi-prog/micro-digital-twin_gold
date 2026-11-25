import { useState } from "react";
import { Amphora, Check, ChevronRight, DraftingCompass, Landmark, Lock, Mail, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ApprovalStatus = "attesa" | "approvato" | "respinto";
export type Approval = { status: ApprovalStatus; ref: string; sent: string; date: string };
export const EMPTY_APPROVAL: Approval = { status: "attesa", ref: "", sent: "", date: "" };

const ICONS: Record<string, LucideIcon> = { "Comune · Giunta": Landmark, Soprintendenza: Amphora, "Ufficio tecnico": DraftingCompass };
const SHORT_STAGES = ["Valutazione", "Progetto", "Approvato", "Realizzato"];
const SHEET = "gap-4 border-foreground/20 bg-card dark:bg-[oklch(0.25_0.016_258)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_-24px_60px_rgb(0_0_0/0.6)] p-5 max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-1/2 max-sm:data-[state=closed]:slide-out-to-bottom-1/2 sm:w-[min(460px,calc(100vw-1.5rem))] sm:rounded-2xl";
const STATES: [ApprovalStatus, string][] = [["attesa", "In attesa"], ["approvato", "Approvato"], ["respinto", "Respinto"]];

const day = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : iso);

/** The chip of a body's state: Premium tells a request sent apart from one still to send. */
function chip(a: Approval, premium: boolean): [string, string] {
  if (a.status === "approvato") return ["Approvato", "bg-ok/15 text-ok"];
  if (a.status === "respinto") return ["Respinto", "bg-danger/15 text-danger"];
  if (premium && a.sent) return ["Inviata", "bg-sky-400/15 text-sky-700 dark:text-sky-300"];
  if (premium) return ["Da inviare", "bg-warn/15 text-amber-700 dark:text-amber-300"];
  return ["In attesa", "bg-warn/15 text-amber-700 dark:text-amber-300"];
}

function subline(a: Approval, premium: boolean) {
  const answered = a.status !== "attesa" ? `${a.status === "approvato" ? "Approvato" : "Respinto"}${a.date ? ` il ${a.date}` : ""}` : "";
  if (!premium) return answered ? `Segnato a mano${a.date ? ` · ${a.date}` : ""}` : "Tocca per segnare l’esito";
  const who = a.ref.trim();
  if (answered) return who ? `${who} · ${answered.toLowerCase()}` : answered;
  if (a.sent) return `${who ? `${who} · ` : ""}Email inviata il ${day(a.sent)}`;
  return who || "Nessun referente";
}

type Props = {
  entities: readonly string[];
  approvals: Record<string, Approval>;
  stage: number;
  premium: boolean;
  onStatus: (e: string, s: ApprovalStatus) => void;
  onEdit: (e: string, patch: Partial<Approval>) => void;
  onSend: (e: string) => void;
  onRealized: (() => void) | null;
  onUpgrade: () => void;
};

/**
 * Approvals of the public bodies, as a list with a sheet (proposal A). Free: the cycle and each body's outcome marked
 * by hand; Premium adds referent and date, the email request with its answer link and the answers coming in by themselves.
 */
export function Approvals({ entities, approvals, stage, premium, onStatus, onEdit, onSend, onRealized, onUpgrade }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const ok = entities.filter((e) => approvals[e]?.status === "approvato").length;
  const cur = open ? approvals[open] ?? EMPTY_APPROVAL : null;
  const Icon = open ? ICONS[open] ?? Landmark : Landmark;
  const fill = (Math.min(stage, 3) / 3) * 100;
  return (
    <section className="space-y-3" aria-label="Approvazioni degli enti" data-testid="approvals">
      <div className="px-1">
        <h2 className="text-lg font-semibold tracking-tight">Approvazioni degli enti</h2>
        <p className="text-sm text-muted-foreground">{premium ? "Premium" : "Piano Free"} · {ok} {ok === 1 ? "parere" : "pareri"} su {entities.length}</p>
      </div>
      <div className="rounded-3xl bg-foreground/[0.05] p-4 sm:p-5">
        <ol className="relative grid grid-cols-4" aria-label="Stadi di approvazione">
          <span className="absolute left-[12.5%] right-[12.5%] top-[9px] h-0.5 rounded-full bg-foreground/15" aria-hidden="true" />
          <span className="absolute left-[12.5%] top-[9px] h-0.5 rounded-full bg-brand-turquoise transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${fill * 0.75}%` }} aria-hidden="true" />
          {SHORT_STAGES.map((s, i) => (
            <li key={s} aria-current={i === stage ? "step" : undefined} className="relative flex flex-col items-center gap-1.5">
              <span className={cn("size-5 rounded-full border-2", i < stage ? "border-brand-turquoise bg-brand-turquoise" : i === stage ? "border-brand-turquoise bg-background shadow-[0_0_0_4px_rgb(45_212_191/0.2)]" : "border-foreground/25 bg-background")} aria-hidden="true" />
              <span className={cn("text-[11px]", i === stage ? "font-semibold text-foreground" : "text-muted-foreground")}>{s}</span>
            </li>
          ))}
        </ol>
        <ul className="mt-4 space-y-2 md:grid md:grid-cols-3 md:gap-2 md:space-y-0">
          {entities.map((e) => {
            const a = approvals[e] ?? EMPTY_APPROVAL;
            const [label, tone] = chip(a, premium);
            const I = ICONS[e] ?? Landmark;
            return (
              <li key={e} data-testid="external-approval">
                <button type="button" onClick={() => setOpen(e)} aria-haspopup="dialog" className="flex w-full items-center gap-3 rounded-2xl bg-foreground/[0.05] p-3 text-left outline-none ring-1 ring-foreground/10 transition-colors hover:bg-foreground/[0.08] focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/10"><I className="size-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{e}</span>
                    <span className="block text-xs text-muted-foreground">{subline(a, premium)}</span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Per passare ad «Approvato» servono tutte le approvazioni esterne.</p>
        {onRealized && <button type="button" onClick={onRealized} className="mt-3 h-11 w-full rounded-full border border-ok/40 text-sm font-semibold text-ok">Conferma intervento realizzato</button>}
        {!premium && (
          <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand-turquoise/15 to-sky-400/10 p-4 ring-1 ring-brand-turquoise/35">
            <p className="text-sm font-semibold">Con Premium</p>
            <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
              <li className="flex gap-2"><Mail className="size-3.5 shrink-0 translate-y-0.5" aria-hidden="true" />Richiesta via email con un link per rispondere</li>
              <li className="flex gap-2"><Check className="size-3.5 shrink-0 translate-y-0.5" aria-hidden="true" />Il parere arriva da solo nell’app</li>
              <li className="flex gap-2"><Lock className="size-3.5 shrink-0 translate-y-0.5" aria-hidden="true" />Referente, data e iter salvati nel tuo account</li>
            </ul>
            <button type="button" onClick={onUpgrade} className="mt-3 h-11 w-full rounded-full bg-foreground text-sm font-semibold text-background">Accedi per passare a Premium</button>
          </div>
        )}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent onOpenAutoFocus={(ev) => ev.preventDefault()} overlayClassName="bg-black/45 backdrop-blur-md sm:!fixed sm:!inset-0 sm:!h-auto sm:!min-h-0" className={SHEET}>
          <span className="mx-auto -mt-1 h-1.5 w-10 rounded-full bg-foreground/20 sm:hidden" aria-hidden="true" />
          {open && cur && (
            <>
              <div className="flex items-center gap-3 pr-8">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/10"><Icon className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-semibold">{open}</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">{premium ? "Referente, esito e richiesta via email" : "Segna l’esito quando l’ente ti risponde"}</DialogDescription>
                </div>
              </div>
              {premium ? (
                <div className="grid gap-2">
                  <label className="rounded-2xl bg-foreground/[0.06] px-3 py-2">
                    <span className="block text-[11px] text-muted-foreground">Referente</span>
                    <input value={cur.ref} onChange={(ev) => onEdit(open, { ref: ev.target.value })} placeholder="Nome e cognome" className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60" />
                  </label>
                  <label className="rounded-2xl bg-foreground/[0.06] px-3 py-2">
                    <span className="block text-[11px] text-muted-foreground">Data della richiesta</span>
                    <input type="date" value={cur.sent} onChange={(ev) => onEdit(open, { sent: ev.target.value })} className="w-full bg-transparent text-[15px] outline-none" />
                  </label>
                </div>
              ) : (
                <button type="button" onClick={() => { setOpen(null); onUpgrade(); }} className="flex items-center gap-2 rounded-2xl bg-foreground/[0.06] px-3 py-3 text-left text-sm text-muted-foreground">
                  <span className="flex-1">Referente e data della richiesta</span><span className="text-xs">Premium</span><Lock className="size-4" aria-hidden="true" />
                </button>
              )}
              <div className="grid grid-cols-3 gap-1 rounded-full bg-foreground/[0.06] p-1" role="radiogroup" aria-label={`Esito ${open}`}>
                {STATES.map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={cur.status === v} onClick={() => onStatus(open, v)}
                    className={cn("h-10 rounded-full text-sm font-medium transition-colors", cur.status === v ? (v === "approvato" ? "bg-ok/25 text-foreground" : v === "respinto" ? "bg-danger/25 text-foreground" : "bg-foreground/15 text-foreground") : "text-muted-foreground")}>{l}</button>
                ))}
              </div>
              {premium ? (
                cur.status !== "approvato" && (
                  <button type="button" onClick={() => onSend(open)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background">
                    <Mail className="size-4" aria-hidden="true" />{cur.sent ? "Sollecita via email" : "Invia richiesta via email"}
                  </button>
                )
              ) : (
                <button type="button" onClick={() => { setOpen(null); onUpgrade(); }} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-foreground/20 text-sm font-semibold text-muted-foreground">
                  <Lock className="size-4" aria-hidden="true" />Invia richiesta via email · Premium
                </button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
