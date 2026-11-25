import { useRef, useState } from "react";
import { Amphora, Check, DraftingCompass, Landmark, Lock, Mail, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ApprovalStatus = "attesa" | "approvato" | "respinto";
export type Approval = { status: ApprovalStatus; ref: string; sent: string; date: string };
export const EMPTY_APPROVAL: Approval = { status: "attesa", ref: "", sent: "", date: "" };

const ICONS: Record<string, LucideIcon> = { "Comune · Giunta": Landmark, Soprintendenza: Amphora, "Ufficio tecnico": DraftingCompass };
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

const STAGE_NAMES = ["In valutazione", "Progettazione", "Approvato", "Realizzato"];
const WORD: Record<ApprovalStatus, string> = { attesa: "In attesa", approvato: "Approvato", respinto: "Respinto" };

/**
 * Approvals of the public bodies (proposal C): a ring with the opinions received and the phase, then one card per body
 * sliding sideways (three side by side from 768 px). Free: the outcome marked by hand; Premium adds referent and date,
 * the email request with its answer link and the answers coming in by themselves, with each body's own record.
 */
export function Approvals({ entities, approvals, stage, premium, onStatus, onEdit, onSend, onRealized, onUpgrade }: Props) {
  const rowRef = useRef<HTMLUListElement>(null);
  const [page, setPage] = useState(0);
  const list = entities.map((e) => approvals[e] ?? EMPTY_APPROVAL);
  const ok = list.filter((a) => a.status === "approvato").length;
  const no = list.filter((a) => a.status === "respinto").length;
  const sent = list.filter((a) => a.status === "attesa" && a.sent).length;
  const todo = entities.length - ok - no - (premium ? sent : 0);
  const share = entities.length ? ok / entities.length : 0;
  const onScroll = () => {
    const el = rowRef.current;
    if (!el) return;
    const w = el.firstElementChild instanceof HTMLElement ? el.firstElementChild.offsetWidth + 12 : el.clientWidth;
    setPage(Math.max(0, Math.min(entities.length - 1, Math.round(el.scrollLeft / w))));
  };
  const goTo = (i: number) => {
    const el = rowRef.current, card = el?.children[i];
    if (el && card instanceof HTMLElement) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  };
  return (
    <section className="space-y-3" aria-label="Approvazioni degli enti" data-testid="approvals">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-lg font-semibold tracking-tight">Approvazioni degli enti</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", premium ? "bg-ok/15 text-ok" : "bg-foreground/[0.08] text-muted-foreground")}>{premium ? "Premium" : "Free"}</span>
      </div>
      <div className="flex items-center gap-4 rounded-3xl bg-foreground/[0.05] p-4 ring-1 ring-foreground/10 sm:p-5">
        <div className="relative grid size-[5.25rem] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-brand-turquoise, #2dd4bf) ${share * 360}deg, rgb(127 127 127 / 0.18) 0)` }}
          role="img" aria-label={`${ok} pareri favorevoli su ${entities.length}`}>
          <div className="grid size-[4.25rem] place-items-center rounded-full bg-background text-center leading-none">
            <span className="font-display text-xl font-light tabular-nums">{ok}/{entities.length}<span className="mt-1 block text-[10px] font-normal text-muted-foreground">pareri</span></span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">Fase</p>
          <p className="font-display text-xl font-light">{STAGE_NAMES[Math.min(stage, 3)]}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {ok > 0 && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-ok">{ok} sì</span>}
            {no > 0 && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-danger">{no} no</span>}
            {premium && sent > 0 && <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-sky-700 dark:text-sky-300">{sent} {sent === 1 ? "inviata" : "inviate"}</span>}
            {todo > 0 && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-amber-700 dark:text-amber-300">{todo} {premium ? "da fare" : "in attesa"}</span>}
          </div>
        </div>
      </div>

      <ul ref={rowRef} onScroll={onScroll} data-map-gestures="" aria-label="Enti"
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 touch-pan-x [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:touch-auto">
        {entities.map((e, i) => {
          const a = list[i]!;
          const [label, tone] = chip(a, premium);
          const I = ICONS[e] ?? Landmark;
          return (
            <li key={e} data-testid="external-approval" className="w-[86%] shrink-0 snap-center rounded-3xl bg-foreground/[0.05] p-4 ring-1 ring-foreground/10 md:w-auto">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground/10"><I className="size-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">{e}</p><p className="text-[11px] text-muted-foreground">{i + 1} di {entities.length}</p></div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>
              </div>
              <p className="mt-3 font-display text-3xl font-extralight">{WORD[a.status]}</p>
              <p className="text-xs text-muted-foreground">{subline(a, premium)}</p>
              {premium ? (
                <div className="mt-3 grid gap-2">
                  <label className="rounded-2xl bg-foreground/[0.06] px-3 py-2">
                    <span className="block text-[11px] text-muted-foreground">Referente</span>
                    <input value={a.ref} onChange={(ev) => onEdit(e, { ref: ev.target.value })} placeholder="Nome e cognome" aria-label={`Referente ${e}`} className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/60" />
                  </label>
                  {(a.sent || a.status !== "attesa") && (
                    <ul className="text-xs text-muted-foreground">
                      {a.sent && <li className="flex items-center gap-2 border-t border-foreground/10 py-1.5"><Mail className="size-3.5" aria-hidden="true" />{day(a.sent)} · Richiesta inviata</li>}
                      {a.status !== "attesa" && <li className="flex items-center gap-2 border-t border-foreground/10 py-1.5"><Check className="size-3.5" aria-hidden="true" />{a.date || "—"} · {a.status === "approvato" ? "Parere favorevole" : "Parere negativo"}</li>}
                    </ul>
                  )}
                </div>
              ) : (
                <button type="button" onClick={onUpgrade} className="mt-3 flex w-full items-center gap-2 border-t border-foreground/10 pt-2.5 text-left text-xs text-muted-foreground">
                  <Lock className="size-3.5 shrink-0" aria-hidden="true" /><span className="flex-1">Referente, email e storico · Premium</span>
                </button>
              )}
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-foreground/[0.06] p-1" role="radiogroup" aria-label={`Esito ${e}`}>
                {STATES.map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={a.status === v} onClick={() => onStatus(e, v)}
                    className={cn("h-9 rounded-full text-[13px] font-medium transition-colors", a.status === v ? (v === "approvato" ? "bg-ok/25 text-foreground" : v === "respinto" ? "bg-danger/25 text-foreground" : "bg-foreground/15 text-foreground") : "text-muted-foreground")}>{l}</button>
                ))}
              </div>
              {premium ? (
                a.status !== "approvato" && (
                  <button type="button" onClick={() => onSend(e)} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground text-sm font-semibold text-background">
                    <Mail className="size-4" aria-hidden="true" />{a.sent ? "Sollecita" : "Invia richiesta via email"}
                  </button>
                )
              ) : (
                <button type="button" onClick={onUpgrade} className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/20 text-sm font-semibold text-muted-foreground">
                  <Lock className="size-4" aria-hidden="true" />Invia richiesta · Premium
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex justify-center gap-1.5 md:hidden" role="tablist" aria-label="Scegli l’ente">
        {entities.map((e, i) => (
          <button key={e} type="button" role="tab" aria-selected={page === i} aria-label={e} onClick={() => goTo(i)}
            className={cn("h-1.5 rounded-full transition-all", page === i ? "w-5 bg-foreground" : "w-1.5 bg-foreground/30")} />
        ))}
      </div>
      <p className="px-1 text-center text-xs text-muted-foreground">Per «Approvato» servono tutti e tre i pareri.</p>
      {onRealized && <button type="button" onClick={onRealized} className="h-11 w-full rounded-full border border-ok/40 text-sm font-semibold text-ok">Conferma intervento realizzato</button>}
      {!premium && (
        <div className="rounded-3xl bg-gradient-to-br from-brand-turquoise/15 to-sky-400/10 p-4 ring-1 ring-brand-turquoise/35">
          <p className="text-sm font-semibold">Con Premium</p>
          <p className="mt-1 text-xs text-muted-foreground">Richieste via email con un link per rispondere, pareri che arrivano da soli, referente e storico di ogni ente.</p>
          <button type="button" onClick={onUpgrade} className="mt-3 h-11 w-full rounded-full bg-foreground text-sm font-semibold text-background">Accedi per passare a Premium</button>
        </div>
      )}
    </section>
  );
}
