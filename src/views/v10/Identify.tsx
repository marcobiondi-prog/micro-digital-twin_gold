import { useEffect, useId, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, Grape, LogOut, ShieldCheck } from "lucide-react";
import { saveProId, useProId } from "@/lib/use-pro-id";
import { loadComuni } from "@/lib/comuni";
import { findComune, searchComuni, townDomain, type Comune } from "@/models/comuni";
import { findRegion, officeOf, searchOffices, searchRegions } from "@/models/professional-id";
import { TownCrest } from "@/views/v10/TownCrest";
import { cn } from "@/lib/utils";
import {
  checkAgronomo, checkFunzionario, KIND_LABEL, ROLES, proSummary,
  type AgronomoInput, type Errors, type FunzionarioInput, type ProId, type ProKind,
} from "@/models/professional-id";
import { Ambient, PageHero } from "@/views/v8/console";
import { SECTION_TONE } from "@/views/v10/ProfileGate";

const fieldCls = "h-12 w-full rounded-2xl border border-foreground/10 bg-foreground/[0.05] px-4 text-[16px] outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-danger dark:[color-scheme:dark]";
/** The list a select opens is drawn by the system: its rows get the theme's own colours, else on Windows they read white on white. */
const optionCls = "bg-background text-foreground";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | undefined; children: (id: string, describedBy: string | undefined) => ReactNode }) {
  const id = useId(), msg = `${id}-msg`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block px-1 text-sm font-medium">{label}</label>
      {children(id, error || hint ? msg : undefined)}
      {(error || hint) && <p id={msg} className={cn("px-1 text-xs", error ? "text-danger" : "text-muted-foreground")}>{error ?? hint}</p>}
    </div>
  );
}

function Declare({ checked, onChange, error }: { checked: boolean; onChange: (v: boolean) => void; error?: string | undefined }) {
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-3 rounded-2xl bg-foreground/[0.05] px-4 py-3 text-sm">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-current" aria-invalid={!!error} />
        <span>Dichiaro che i dati sono miei e veri. So che vengono controllati solo nella forma e non con il registro ufficiale.</span>
      </label>
      {error && <p className="px-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

const PAGE: Record<ProKind, { title: string; section: "urban" | "vineyard"; opens: string; locks: string; go: "/urbano" | "/vigneto"; intro: string }> = {
  agronomo: { title: "Agronomo", section: "vineyard", opens: "il vigneto", locks: "la piazza", go: "/vigneto",
    intro: "Con il patentino fitosanitario si apre la simulazione del vigneto. Un profilo alla volta: la simulazione della piazza si blocca." },
  funzionario: { title: "Funzionario comunale", section: "urban", opens: "la piazza", locks: "il vigneto", go: "/urbano",
    intro: "Con il tuo Comune, l'ufficio di appartenenza e l'email del Comune si apre la simulazione della piazza. Un profilo alla volta: la simulazione del vigneto si blocca." },
};

function AgronomoForm({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState<AgronomoInput>({ name: "", licenceType: "", licence: "", region: "", expires: "", declared: false });
  const [errors, setErrors] = useState<Errors<keyof AgronomoInput>>({});
  // Changing a field clears its message: the rest stay until the next try.
  const up = <K extends keyof AgronomoInput>(k: K, val: AgronomoInput[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((e) => { const { [k]: _gone, ...rest } = e; return rest as typeof e; });
  };
  const submit = async () => {
    // "molise", "valle d'aosta": the region is taken with its own spelling from the list.
    const { id, errors: e } = checkAgronomo({ ...v, region: findRegion(v.region) ?? v.region });
    setErrors(e);
    if (!id) return;
    await saveProId(id);
    onDone();
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
      <Field label="Nome e cognome" error={errors.name}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.name} autoComplete="name" value={v.name} onChange={(e) => up("name", e.target.value)} className={fieldCls} />}</Field>
      <div className="space-y-1.5" role="radiogroup" aria-label="Tipo di patentino">
        <p className="px-1 text-sm font-medium">Tipo di patentino</p>
        <div className="grid grid-cols-2 gap-2">
          {([["consulente", "Consulente", "per consigliare"], ["utilizzatore", "Utilizzatore", "per acquisto e uso"]] as const).map(([k, l, s]) => (
            <button key={k} type="button" role="radio" aria-checked={v.licenceType === k} onClick={() => up("licenceType", k)}
              className={cn("rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring", v.licenceType === k ? "bg-foreground text-background" : "bg-foreground/[0.05]")}>
              <span className="block text-[16px] font-semibold">{l}</span><span className={cn("block text-xs", v.licenceType === k ? "text-background/70" : "text-muted-foreground")}>{s}</span>
            </button>
          ))}
        </div>
        {errors.licenceType && <p className="px-1 text-xs text-danger">{errors.licenceType}</p>}
      </div>
      <Field label="Numero del patentino fitosanitario" hint="Come è scritto sul patentino, per esempio MOL/CB/01234." error={errors.licence}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.licence} autoCapitalize="characters" value={v.licence} onChange={(e) => up("licence", e.target.value)} className={fieldCls} />}</Field>
      <Field label="Regione che l'ha rilasciato" hint="Scrivi le prime lettere e scegli la regione dall'elenco." error={errors.region}>{(id, d) => <RegionField id={id} describedBy={d} invalid={!!errors.region} value={v.region} onChange={(x) => up("region", x)} />}</Field>
      <Field label="Scadenza" hint="Il patentino vale 5 anni: deve essere ancora valido." error={errors.expires}>{(id, d) => <input id={id} type="date" aria-describedby={d} aria-invalid={!!errors.expires} value={v.expires} onChange={(e) => up("expires", e.target.value)} className={fieldCls} />}</Field>
      {/* At the end, the licence's region with its coat of arms. */}
      {findRegion(v.region) && (
        <div className="flex items-center gap-4 rounded-2xl bg-foreground/[0.05] px-4 py-3">
          <TownCrest name={findRegion(v.region)!} region />
          <p className="min-w-0 text-[16px] font-semibold">Regione {findRegion(v.region)}<span className="block text-sm font-normal text-muted-foreground">Il tuo profilo porterà il suo stemma.</span></p>
        </div>
      )}
      <Declare checked={v.declared} onChange={(b) => up("declared", b)} error={errors.declared} />
      <Submit label="Identificati e apri il vigneto" />
    </form>
  );
}

type Suggestion = [label: string, aside: string];

/**
 * A field that suggests as one types: the matching items show under it ([label, aside], e.g. "Campobasso · CB"),
 * arrows and Enter pick one, Escape closes the list, a tap picks one. `suggest` returns the items for what is typed.
 */
function SuggestField({ id, describedBy, invalid, value, placeholder, label, suggest, onFocusLoad, onChange, onPick }: {
  id: string; describedBy: string | undefined; invalid: boolean; value: string; placeholder: string; label: string;
  suggest: (q: string) => Suggestion[]; onFocusLoad?: () => void; onChange: (v: string) => void; onPick: (label: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = open ? suggest(value) : [];
  const shown = hits.length === 1 && hits[0]![0] === value ? [] : hits;
  useEffect(() => { setActive(0); }, [value]);
  const pick = (c: Suggestion) => { onChange(c[0]); onPick(c[0]); setOpen(false); };
  const listId = `${id}-list`;
  return (
    <div className="relative">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={shown.length > 0} aria-controls={listId}
        aria-activedescendant={shown.length ? `${listId}-${active}` : undefined} aria-describedby={describedBy} aria-invalid={invalid}
        autoComplete="off" value={value} placeholder={placeholder}
        onFocus={() => { onFocusLoad?.(); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { onFocusLoad?.(); setOpen(true); onChange(e.target.value); onPick(null); }}
        onKeyDown={(e) => {
          if (!shown.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((x) => (x + 1) % shown.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((x) => (x - 1 + shown.length) % shown.length); }
          else if (e.key === "Enter") { e.preventDefault(); const c = shown[active]; if (c) pick(c); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={fieldCls} />
      {shown.length > 0 && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-foreground/10 bg-popover p-1 text-popover-foreground shadow-2xl">
          {shown.map((c, i) => (
            <li key={`${c[0]}-${c[1]}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-[16px]", i === active && "bg-foreground/[0.08]")}>
              <span className="truncate">{c[0]}</span>{c[1] && <span className="shrink-0 text-sm text-muted-foreground">{c[1]}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The town field: from two letters, the Italian towns that match, from the most populated, with their province. The list loads the first time the field is used. */
function ComuneField(props: { id: string; describedBy: string | undefined; invalid: boolean; value: string; onChange: (v: string) => void; onPick: (name: string | null) => void }) {
  const [list, setList] = useState<readonly Comune[]>([]);
  return <SuggestField {...props} label="Comuni" placeholder="Scrivi il nome del Comune" onFocusLoad={() => { if (!list.length) void loadComuni().then(setList); }}
    suggest={(q) => searchComuni(list, q).map((c): Suggestion => [c[0], c[1]])} />;
}

/** The office field: every listed office as soon as it is touched, narrowed as one types; an office not listed is written by name. */
function OfficeField(props: { id: string; describedBy: string | undefined; invalid: boolean; value: string; onChange: (v: string) => void }) {
  return <SuggestField {...props} label="Uffici" placeholder="Scrivi o scegli l'ufficio" onPick={() => undefined}
    suggest={(q) => searchOffices(q).map((o): Suggestion => [o, ""])} />;
}

/** The region field: every region as soon as it is touched, narrowed as one types (accents and case aside). */
function RegionField(props: { id: string; describedBy: string | undefined; invalid: boolean; value: string; onChange: (v: string) => void }) {
  return <SuggestField {...props} label="Regioni" placeholder="Scrivi o scegli la regione" onPick={() => undefined}
    suggest={(q) => searchRegions(q).map((r): Suggestion => [r, ""])} />;
}

function FunzionarioForm({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState<FunzionarioInput>({ name: "", comune: "", office: "", otherOffice: "", role: "", email: "", badge: "", declared: false });
  // The town picked from the list: the email example follows it.
  const [town, setTown] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors<keyof FunzionarioInput>>({});
  // Changing a field clears its message: the rest stay until the next try.
  const up = <K extends keyof FunzionarioInput>(k: K, val: FunzionarioInput[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    // The office field also carries the message about an unlisted office's name.
    setErrors((e) => { const rest: Errors<keyof FunzionarioInput> = { ...e }; delete rest[k]; if (k === "office") delete rest.otherOffice; return rest; });
  };
  const submit = async () => {
    // The office field holds what was typed: a listed office, or the name of one that is not listed.
    const { id, errors: e } = checkFunzionario({ ...v, ...officeOf(v.office) });
    // The town must be a real Italian one, written as in the list (its spelling is taken from there).
    const towns = await loadComuni();
    const town = towns.length ? findComune(towns, v.comune) : undefined;
    if (towns.length && !town && !e.comune) e.comune = "Scegli il tuo Comune dall'elenco dei comuni italiani.";
    if (town && id && id.kind === "funzionario") { id.comune = town[0]; id.istat = town[3]; }
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!id) return;
    await saveProId(id);
    onDone();
  };
  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
      <Field label="Nome e cognome" error={errors.name}>{(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!errors.name} autoComplete="name" value={v.name} onChange={(e) => up("name", e.target.value)} className={fieldCls} />}</Field>
      <Field label="Comune" hint="Scrivi le prime lettere e scegli il tuo Comune dall'elenco." error={errors.comune}>{(id, d) => <ComuneField id={id} describedBy={d} invalid={!!errors.comune} value={v.comune} onChange={(x) => up("comune", x)} onPick={setTown} />}</Field>
      <Field label="Ufficio di appartenenza" hint="Scegli dall'elenco o scrivi il nome del tuo ufficio." error={errors.office ?? errors.otherOffice}>{(id, d) => <OfficeField id={id} describedBy={d} invalid={!!(errors.office ?? errors.otherOffice)} value={v.office} onChange={(x) => up("office", x)} />}</Field>
      <Field label="Ruolo" error={errors.role}>{(id, d) => (
        <select id={id} aria-describedby={d} aria-invalid={!!errors.role} value={v.role} onChange={(e) => up("role", e.target.value)} className={fieldCls}>
          <option value="" className={optionCls}>Scegli il ruolo</option>{ROLES.map((r) => <option key={r} value={r} className={optionCls}>{r}</option>)}
        </select>)}</Field>
      <Field label="Email del Comune" hint={`Quella istituzionale, per esempio nome.cognome@${townDomain(town ?? "Campobasso")}.`} error={errors.email}>{(id, d) => <input id={id} type="email" inputMode="email" autoComplete="email" aria-describedby={d} aria-invalid={!!errors.email} value={v.email} onChange={(e) => up("email", e.target.value)} className={fieldCls} />}</Field>
      <Field label="Matricola (facoltativa)" hint="Il numero del tuo badge o della matricola, se vuoi aggiungerlo." error={errors.badge}>{(id, d) => <input id={id} aria-describedby={d} value={v.badge} onChange={(e) => up("badge", e.target.value)} className={fieldCls} />}</Field>
      {/* At the end, the picked town with its coat of arms. */}
      {town && (
        <div className="flex items-center gap-4 rounded-2xl bg-foreground/[0.05] px-4 py-3">
          <TownCrest name={town} />
          <p className="min-w-0 text-[16px] font-semibold">Comune di {town}<span className="block text-sm font-normal text-muted-foreground">Il tuo profilo porterà il suo stemma.</span></p>
        </div>
      )}
      <Declare checked={v.declared} onChange={(b) => up("declared", b)} error={errors.declared} />
      <Submit label="Identificati e apri la piazza" />
    </form>
  );
}

function Submit({ label }: { label: string }) {
  return (
    <button type="submit" className="flex h-14 w-full items-center justify-between rounded-full bg-foreground pl-6 pr-2 text-base font-semibold text-background outline-none focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-[0.99]">
      {label}<span className="grid size-10 place-items-center rounded-full bg-background text-foreground"><ArrowRight className="size-5" aria-hidden="true" /></span>
    </button>
  );
}

/** The identification form of one profile: on the identification page and in the "Profilo" tab of a locked section. */
export function IdentifyForm({ kind, onDone }: { kind: ProKind; onDone: () => void }) {
  return kind === "agronomo" ? <AgronomoForm onDone={onDone} /> : <FunzionarioForm onDone={onDone} />;
}

/** What the profile opens and locks, in one line. */
export const profileIntro = (kind: ProKind) => PAGE[kind].intro;

/** The profile in use, with "Esci dal profilo" (and, on the identification page, the way into its section). */
export function ProfileCard({ kind, go }: { kind: ProKind; go?: () => void }) {
  const id = useProId();
  const mine = id?.kind === kind ? id : null;
  const Icon = kind === "agronomo" ? Grape : Building2;
  if (!mine) return null;
  const leave = async () => {
    await saveProId(null);
    toast("Profilo rimosso", { description: "Piazza e vigneto sono bloccati finché non ti identifichi." });
  };
  return (
    <div className="fuse-canvas space-y-4 rounded-3xl px-5 py-6">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-lg font-semibold"><BadgeCheck className="size-6 shrink-0 text-emerald-400" aria-hidden="true" />Sei identificato come {KIND_LABEL[kind].toLowerCase()}</p>
        {mine.kind === "funzionario" ? <TownCrest name={mine.comune} istat={mine.istat} size={52} label /> : <TownCrest name={mine.region} region size={52} label />}
      </div>
      <dl className="divide-y divide-foreground/10 rounded-2xl bg-foreground/[0.05] px-4">
        {profileRows(mine).map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-3"><dt className="shrink-0 text-sm text-muted-foreground">{k}</dt><dd className="min-w-0 text-right text-[16px] font-medium [overflow-wrap:anywhere]">{v}</dd></div>
        ))}
      </dl>
      {go && (
        <button type="button" onClick={go} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[16px] font-semibold text-background outline-none focus-visible:ring-4 focus-visible:ring-ring/50">
          <Icon className="size-5" aria-hidden="true" />Vai {kind === "agronomo" ? "al vigneto" : "alla piazza"}
        </button>
      )}
      <button type="button" onClick={() => void leave()} className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <LogOut className="size-4" aria-hidden="true" />Esci dal profilo
      </button>
    </div>
  );
}

/** The profile's data as label · value rows. */
function profileRows(id: ProId): Array<[string, string]> {
  const since = new Date(id.at).toLocaleDateString("it-IT");
  return id.kind === "agronomo"
    ? [["Nome", id.name], ["Patentino", `${id.licenceType === "consulente" ? "Consulente" : "Utilizzatore"} · ${id.licence}`], ["Regione", id.region], ["Scadenza", new Date(`${id.expires}T12:00:00`).toLocaleDateString("it-IT")], ["Identificato il", since]]
    : [["Nome", id.name], ["Comune", id.comune], ["Ufficio", id.office], ["Ruolo", id.role], ["Email", id.email], ...(id.badge ? [["Matricola", id.badge] as [string, string]] : []), ["Identificato il", since]];
}

/**
 * The identification page of one profile (/identificazione/agronomo, /identificazione/funzionario): what it opens and
 * locks, then the form; once identified, who you are, the way into the section and "Esci dal profilo".
 */
export function IdentifyPage({ kind }: { kind: ProKind }) {
  const navigate = useNavigate();
  const id = useProId();
  const p = PAGE[kind];
  const back = () => {
    if ((window.history.state?.__TSR_index ?? 0) > 0) window.history.back();
    else void navigate({ to: "/benvenuto", replace: true });
  };
  const done = () => {
    toast.success(`Identificato come ${KIND_LABEL[kind].toLowerCase()}`, { description: `Si apre ${p.opens}; ${p.locks} è bloccat${kind === "agronomo" ? "a" : "o"}.` });
    void navigate({ to: p.go, replace: true });
  };
  const mine = id?.kind === kind ? id : null;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Ambient tone={SECTION_TONE[p.section]} />
      <button type="button" onClick={back} className="-mb-2 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft className="size-5" aria-hidden="true" />Indietro
      </button>
      <PageHero kicker="Identificazione" kickerIcon={ShieldCheck} title={p.title} />
      {mine ? (
        <ProfileCard kind={kind} go={() => void navigate({ to: p.go })} />
      ) : (
        <>
          <p className="text-[16px] leading-relaxed text-muted-foreground">{p.intro}</p>
          {id && <p className="rounded-2xl bg-foreground/[0.06] px-4 py-3 text-sm text-muted-foreground">Ora sei identificato come <span className="font-semibold text-foreground">{proSummary(id)}</span>: identificandoti qui, quel profilo viene sostituito e {p.locks} si blocca.</p>}
          <IdentifyForm kind={kind} onDone={done} />
          <p className="px-1 text-xs text-muted-foreground">I dati restano su questo dispositivo e, se hai fatto l'accesso, nel tuo account. Puoi uscire dal profilo quando vuoi.</p>
        </>
      )}
    </div>
  );
}
